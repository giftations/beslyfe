import { getDatabase } from '@netlify/database'
import { requireAdmin, requireSameOrigin, recordAudit, json, str, iso, toDate } from './lib/session.mjs'
import { listThemes, resolveThemeSettings, getTheme, DEFAULT_THEME_KEY } from '../../platform/themes/registry.mjs'
import { CORE } from '../../platform/core/manifest.mjs'
import { MODULES } from '../../platform/modules/manifest.mjs'
import { PLATFORM_CONTRACT_REGISTRY, platformContractRegistrySummary } from '../../platform/contracts.mjs'

// The events registry — the top-level tenant of the Event OS. Every edition of
// Bak'd On The Bay (and every future expo, venue or partner production) is a row
// here, and event-scoped entities (applications, profiles, …) carry its id.
// Exactly one event is flagged active; it is the edition new public submissions
// attach to and the one the admin is currently operating. Backed by Netlify
// Database and following the same native-driver conventions as the other
// functions (see applications.mjs / profiles.mjs).

// The flagship edition, seeded on first use so the platform is never event-less.
// A fixed id lets existing pre-multi-event records be backfilled deterministically.
const FLAGSHIP = {
  id: 'evt-bakd-on-the-bay-2026',
  slug: 'bakd-on-the-bay-2026',
  name: "Bak'd On The Bay 2026",
  tagline: 'The Bayfront Convention Center event experience',
  venue: 'Bayfront Convention Center',
  location: 'Erie, PA',
}

const STATUSES = new Set(['planning', 'active', 'archived'])
const TEXT_FIELDS = { name: 200, tagline: 300, venue: 200, location: 200 }

function newId() {
  return `evt-${Date.now()}-${Math.round(Math.random() * 1e9).toString(36)}`
}

// Business rule: an edition cannot end before it starts. Either bound may be
// null (open-ended); the order is only enforced when both dates are present.
// Returns an error string, or '' when the pair is valid.
function dateOrderError(startsAt, endsAt) {
  if (startsAt && endsAt && new Date(endsAt).getTime() < new Date(startsAt).getTime()) {
    return 'An event cannot end before it starts.'
  }
  return ''
}

// url-safe slug from a name, with a random suffix as a last resort so the
// unique slug index is never violated by two same-named editions.
function slugify(name) {
  const base = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return base || `event-${Math.round(Math.random() * 1e6).toString(36)}`
}

function normalizeRow(row) {
  if (!row) return null
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    venue: row.venue,
    location: row.location,
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    status: row.status,
    isActive: row.is_active === true || row.is_active === 'true',
    settings: row.settings || {},
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

// Seed the flagship edition the first time the platform is used. Cheap on every
// call after the first (a single COUNT), so it is safe to run on any request.
async function ensureSeed(db) {
  const existing = await db.sql`SELECT COUNT(*)::int AS count FROM events`
  if (!existing.length || existing[0].count === 0) {
    const now = new Date().toISOString()
    // Seed the flagship on its own theme, so even the first edition is "just a
    // theme" — the platform is never in an un-themed state.
    const settings = JSON.stringify(resolveThemeSettings(DEFAULT_THEME_KEY))
    await db.sql`
      INSERT INTO events ("id", "slug", "name", "tagline", "venue", "location", "status", "is_active", "settings", "created_at", "updated_at")
      VALUES (${FLAGSHIP.id}, ${FLAGSHIP.slug}, ${FLAGSHIP.name}, ${FLAGSHIP.tagline}, ${FLAGSHIP.venue}, ${FLAGSHIP.location}, 'active', true, ${settings}::jsonb, ${now}, ${now})
      ON CONFLICT ("id") DO NOTHING
    `
  }
  return getActiveEventId(db)
}

// Adopt any records created before multi-event scoping existed by backfilling
// their event_id to the active edition. This does two full-table UPDATEs, so it
// only runs on writes — not on every read, where it was pure waste (the WHERE
// clauses match nothing once every row is stamped).
async function backfillEventScope(db, activeId) {
  if (!activeId) return
  await db.sql`UPDATE applications SET "event_id" = ${activeId} WHERE "event_id" = '' OR "event_id" IS NULL`
  await db.sql`UPDATE profiles SET "event_id" = ${activeId} WHERE "event_id" = '' OR "event_id" IS NULL`
}

// The id of the current edition: the active one, or the oldest as a fallback.
async function getActiveEventId(db) {
  const active = await db.sql`SELECT "id" FROM events WHERE "is_active" = true ORDER BY "created_at" ASC LIMIT 1`
  if (active.length) return active[0].id
  const any = await db.sql`SELECT "id" FROM events ORDER BY "created_at" ASC LIMIT 1`
  return any.length ? any[0].id : ''
}

async function getEvent(db, id) {
  const rows = await db.sql`SELECT * FROM events WHERE "id" = ${id} LIMIT 1`
  return normalizeRow(rows[0])
}

// Promote one edition to active and demote every other one, so there is always
// exactly one active event.
async function activate(db, id) {
  const now = new Date().toISOString()
  await db.sql`UPDATE events SET "is_active" = false, "updated_at" = ${now} WHERE "is_active" = true AND "id" <> ${id}`
  const rows = await db.sql`UPDATE events SET "is_active" = true, "status" = 'active', "updated_at" = ${now} WHERE "id" = ${id} RETURNING *`
  return normalizeRow(rows[0])
}

export default async (req) => {
  const url = new URL(req.url)
  const id = url.searchParams.get('id')

  // ── Read ──
  if (req.method === 'GET') {
    // The theme catalogue — what the Admin OS Events form offers when creating
    // an edition. Pure presentation presets, so this is safe to serve openly.
    if (url.searchParams.get('themes') !== null) {
      return json({ themes: listThemes(), defaultTheme: DEFAULT_THEME_KEY }, 200, { 'Cache-Control': 'no-store' })
    }

    // The platform manifest — the core-entity and module map (documentation as
    // data). Read-only; surfaced in the Admin OS System view.
    if (url.searchParams.get('platform') !== null) {
      return json(
        {
          core: CORE,
          modules: MODULES,
          themes: listThemes(),
          contracts: PLATFORM_CONTRACT_REGISTRY,
          contractsSummary: platformContractRegistrySummary(),
        },
        200,
        { 'Cache-Control': 'no-store' }
      )
    }

    // The current edition — used by public/admin surfaces that need "which event
    // are we running right now" without listing them all.
    const db = getDatabase()

    // Every database-backed request guarantees the flagship edition exists
    // (cheap). The heavier backfill of legacy records only runs on writes, below.
    await ensureSeed(db)

    if (url.searchParams.get('active') !== null) {
      const activeId = await getActiveEventId(db)
      const item = activeId ? await getEvent(db, activeId) : null
      return json({ item }, 200, { 'Cache-Control': 'no-store' })
    }

    if (id) {
      const item = await getEvent(db, id)
      if (!item) return json({ error: 'Not found' }, 404)
      return json({ item }, 200, { 'Cache-Control': 'no-store' })
    }

    // Full list, newest first, each with a live count of the records scoped to it.
    const rows = await db.sql`SELECT * FROM events ORDER BY "created_at" DESC`
    const appCounts = await db.sql`SELECT "event_id", COUNT(*)::int AS count FROM applications GROUP BY "event_id"`
    const profCounts = await db.sql`SELECT "event_id", COUNT(*)::int AS count FROM profiles GROUP BY "event_id"`
    const appBy = {}, profBy = {}
    for (const r of appCounts) appBy[r.event_id] = r.count
    for (const r of profCounts) profBy[r.event_id] = r.count
    const items = rows.map(normalizeRow).filter(Boolean).map((e) => ({
      ...e,
      counts: { applications: appBy[e.id] || 0, profiles: profBy[e.id] || 0 },
    }))
    return json({ items }, 200, { 'Cache-Control': 'no-store' })
  }

  // ── Create a new edition (admin) ──
  const db = getDatabase()

  // Every database-backed request guarantees the flagship edition exists
  // (cheap). The heavier backfill of legacy records only runs on writes, below.
  await ensureSeed(db)

  if (req.method === 'POST') {
    const admin = await requireAdmin(req, db)
    if (admin instanceof Response) return admin
    const cross = requireSameOrigin(req)
    if (cross) return cross
    await backfillEventScope(db, await getActiveEventId(db))
    let body
    try {
      body = await req.json()
    } catch {
      return json({ error: 'Invalid JSON' }, 400)
    }
    if (!body || typeof body !== 'object') return json({ error: 'Expected a JSON object' }, 400)

    const name = str(body.name, TEXT_FIELDS.name).trim()
    if (!name) return json({ error: 'An event needs a name.' }, 400)

    const startsAt = toDate(body.startsAt)
    const endsAt = toDate(body.endsAt)
    const orderError = dateOrderError(startsAt, endsAt)
    if (orderError) return json({ error: orderError }, 400)

    const baseSlug = slugify(body.slug || name)
    const status = STATUSES.has(body.status) ? body.status : 'planning'
    // Resolve the chosen theme (or the default) into the settings document. This
    // is what makes "create an event" mean "pick a theme + enter details": the
    // branding and default module set are stamped on now, not coded later.
    const themeSettings = resolveThemeSettings(str(body.theme, 60))
    const settingsJson = JSON.stringify(themeSettings)
    const now = new Date().toISOString()
    const eventId = newId()
    // Slug uniqueness is enforced by the unique index, not a prior SELECT: insert
    // with ON CONFLICT DO NOTHING and, if a concurrent row already took the slug,
    // retry with a short random suffix. This closes the check-then-act race where
    // two simultaneous creates both passed a read and the second insert threw.
    let slug = baseSlug
    let inserted = null
    for (let attempt = 0; attempt < 6 && !inserted; attempt++) {
      const trySlug = attempt === 0 ? baseSlug : `${baseSlug}-${Math.round(Math.random() * 1e4).toString(36)}`
      const rows = await db.sql`
        INSERT INTO events ("id", "slug", "name", "tagline", "venue", "location", "starts_at", "ends_at", "status", "is_active", "settings", "created_at", "updated_at")
        VALUES (
          ${eventId}, ${trySlug}, ${name}, ${str(body.tagline, TEXT_FIELDS.tagline)}, ${str(body.venue, TEXT_FIELDS.venue)},
          ${str(body.location, TEXT_FIELDS.location)}, ${startsAt}, ${endsAt}, ${status}, false, ${settingsJson}::jsonb, ${now}, ${now}
        )
        ON CONFLICT ("slug") DO NOTHING
        RETURNING *
      `
      if (rows.length) { inserted = rows[0]; slug = trySlug }
    }
    if (!inserted) return json({ error: 'Could not allocate a unique slug for this event. Please try a different name.' }, 409)
    let item = normalizeRow(inserted)
    if (body.makeActive === true) item = await activate(db, eventId)
    await recordAudit(db, req, admin, {
      action: 'event.create', resourceType: 'event', resourceId: eventId,
      details: { name, slug, theme: themeSettings.theme, makeActive: body.makeActive === true },
    })
    return json({ ok: true, id: eventId, item })
  }

  // ── Update / activate an edition (admin) ──
  if (req.method === 'PUT' || req.method === 'PATCH') {
    const admin = await requireAdmin(req, db)
    if (admin instanceof Response) return admin
    const cross = requireSameOrigin(req)
    if (cross) return cross
    await backfillEventScope(db, await getActiveEventId(db))
    let body
    try {
      body = await req.json()
    } catch {
      return json({ error: 'Invalid JSON' }, 400)
    }
    const targetId = (body && body.id) || id
    if (!targetId) return json({ error: 'Missing event id' }, 400)
    const current = await getEvent(db, targetId)
    if (!current) return json({ error: 'Not found' }, 404)

    // Activation-only request.
    if (body.activate === true) {
      const item = await activate(db, targetId)
      await recordAudit(db, req, admin, {
        action: 'event.activate', resourceType: 'event', resourceId: targetId,
        details: { name: current.name },
      })
      return json({ ok: true, item })
    }

    const next = {
      name: body.name !== undefined ? str(body.name, TEXT_FIELDS.name) : current.name,
      tagline: body.tagline !== undefined ? str(body.tagline, TEXT_FIELDS.tagline) : current.tagline,
      venue: body.venue !== undefined ? str(body.venue, TEXT_FIELDS.venue) : current.venue,
      location: body.location !== undefined ? str(body.location, TEXT_FIELDS.location) : current.location,
      startsAt: body.startsAt !== undefined ? toDate(body.startsAt) : current.startsAt,
      endsAt: body.endsAt !== undefined ? toDate(body.endsAt) : current.endsAt,
      status: body.status !== undefined && STATUSES.has(body.status) ? body.status : current.status,
    }
    const orderError = dateOrderError(next.startsAt, next.endsAt)
    if (orderError) return json({ error: orderError }, 400)
    // Optional re-theme: only when a *known* theme key is supplied. Unknown keys
    // are ignored here (unlike create, which falls back to the default) so a bad
    // value can never silently overwrite a live edition's branding. The resolved
    // theme fragment is merged over the existing settings, preserving any other
    // keys an editor has stored there.
    const reTheme = body.theme !== undefined && getTheme(str(body.theme, 60)) ? str(body.theme, 60) : ''
    const nextSettings = reTheme
      ? { ...(current.settings || {}), ...resolveThemeSettings(reTheme) }
      : (current.settings || {})
    const settingsJson = JSON.stringify(nextSettings)
    const rows = await db.sql`
      UPDATE events SET
        "name" = ${next.name}, "tagline" = ${next.tagline}, "venue" = ${next.venue}, "location" = ${next.location},
        "starts_at" = ${next.startsAt}, "ends_at" = ${next.endsAt}, "status" = ${next.status},
        "settings" = ${settingsJson}::jsonb, "updated_at" = ${new Date().toISOString()}
      WHERE "id" = ${targetId} RETURNING *
    `
    await recordAudit(db, req, admin, {
      action: 'event.update', resourceType: 'event', resourceId: targetId,
      details: { statusBefore: current.status, statusAfter: next.status, theme: reTheme || (current.settings && current.settings.theme) || '' },
    })
    return json({ ok: true, item: normalizeRow(rows[0]) })
  }

  // ── Delete an edition (admin) ──
  if (req.method === 'DELETE') {
    const admin = await requireAdmin(req, db)
    if (admin instanceof Response) return admin
    const cross = requireSameOrigin(req)
    if (cross) return cross
    if (!id) return json({ error: 'Missing event id' }, 400)
    const target = await getEvent(db, id)
    if (!target) return json({ error: 'Not found' }, 404)
    if (target.isActive) return json({ error: 'You cannot delete the active event. Activate another edition first.' }, 400)
    // The friendly, specific guards below run first so the admin gets a precise
    // message for each deterministic refusal. The DELETE itself then re-checks the
    // same invariants atomically in its WHERE clause, so a state change that races
    // in after these reads (a concurrent activate, or records attached to the
    // edition) cannot slip a delete through — a zero-row result means "it changed
    // under you", not success.
    const total = await db.sql`SELECT COUNT(*)::int AS count FROM events`
    if (total[0].count <= 1) return json({ error: 'You cannot delete the only event.' }, 400)
    // Refuse to orphan scoped records — an edition with applications or profiles
    // must be archived, not deleted.
    const apps = await db.sql`SELECT COUNT(*)::int AS count FROM applications WHERE "event_id" = ${id}`
    const profs = await db.sql`SELECT COUNT(*)::int AS count FROM profiles WHERE "event_id" = ${id}`
    if ((apps[0].count || 0) + (profs[0].count || 0) > 0) {
      return json({ error: 'This event has applications or profiles. Archive it instead of deleting.' }, 400)
    }
    const deleted = await db.sql`
      DELETE FROM events
      WHERE "id" = ${id}
        AND "is_active" = false
        AND (SELECT COUNT(*) FROM events) > 1
        AND NOT EXISTS (SELECT 1 FROM applications WHERE "event_id" = ${id})
        AND NOT EXISTS (SELECT 1 FROM profiles WHERE "event_id" = ${id})
      RETURNING "id"
    `
    if (!deleted.length) return json({ error: 'This event changed while you were deleting it. Refresh and try again.' }, 409)
    await recordAudit(db, req, admin, {
      action: 'event.delete', resourceType: 'event', resourceId: id,
      details: { name: target.name, slug: target.slug },
    })
    return json({ ok: true })
  }

  return json({ error: 'Method Not Allowed' }, 405)
}
