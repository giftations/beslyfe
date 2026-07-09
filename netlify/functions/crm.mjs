import { getDatabase } from '@netlify/database'
import { requireAdmin, requireSameOrigin, recordAudit, json, str, iso, newId } from './lib/session.mjs'

// ── CRM — People & Companies ──
//
// A normalized customer-relationship layer over the platform. The public site
// writes `profiles` (one row per role) and `applications` (one row per
// submission), which means a single human who applies as a vendor, signs up as a
// speaker and attends next year is scattered across several rows, and the
// company they represent is a free-text string copied onto each one.
//
// This function is the back-office view where that data is deduplicated into a
// canonical shape:
//
//   • crm_people        — one row per human (deduped by email)
//   • crm_companies     — one row per organization (deduped by name)
//   • crm_person_roles  — one person → unlimited roles (optionally event-scoped)
//   • crm_company_events— one company → unlimited event participations
//
// A person references their company by id, so a company's details live in one
// place. Admin-only, and follows the same conventions as events.mjs /
// applications.mjs (native driver, requireAdmin + requireSameOrigin, audit).

const ROLES = new Set(['attendee', 'vendor', 'sponsor', 'speaker', 'dj', 'organizer', 'media', 'staff', 'partner', 'other'])
const RELATIONSHIPS = new Set(['exhibitor', 'sponsor', 'partner', 'speaker', 'vendor', 'media', 'other'])
const LIMIT = 1000

// ── Dedup keys ──
// A person's key is their lowercased email; a company's key is its normalized
// name. When the source has neither, the row's own id is used as the key so it
// stays unique and can never merge with an unrelated blank record.
function emailKey(email, id) {
  const e = String(email || '').trim().toLowerCase()
  return e || id
}
function nameKey(name, id) {
  const n = String(name || '').trim().toLowerCase().replace(/\s+/g, ' ')
  return n || id
}

function normPerson(row) {
  if (!row) return null
  return {
    id: row.id,
    fullName: row.full_name || '',
    email: row.email || '',
    phone: row.phone || '',
    companyId: row.company_id || '',
    companyName: row.company_name || '',
    title: row.title || '',
    notes: row.notes || '',
    details: row.details || {},
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}
function normCompany(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name || '',
    website: row.website || '',
    industry: row.industry || '',
    notes: row.notes || '',
    details: row.details || {},
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

// Upsert a company by its normalized name. Returns { row, created }. An empty
// name yields null — companies are only materialized when there is one to name.
async function upsertCompany(db, name, extra = {}) {
  const clean = str(name, 200).trim()
  if (!clean) return null
  const id = newId('cmp_')
  const key = nameKey(clean, id)
  const now = new Date().toISOString()
  const ins = await db.sql`
    INSERT INTO crm_companies ("id", "name", "name_key", "website", "industry", "notes", "details", "created_at", "updated_at")
    VALUES (${id}, ${clean}, ${key}, ${str(extra.website, 300)}, ${str(extra.industry, 120)}, ${str(extra.notes, 4000)}, '{}'::jsonb, ${now}, ${now})
    ON CONFLICT ("name_key") DO NOTHING
    RETURNING *
  `
  if (ins.length) return { row: ins[0], created: true }
  const ex = await db.sql`SELECT * FROM crm_companies WHERE "name_key" = ${key} LIMIT 1`
  return { row: ex[0], created: false }
}

// Upsert a person by their email. Returns { row, created }. When there is no
// email the person cannot be safely deduplicated, so a fresh row keyed by its
// own id is always created. `patch` fills in blanks on an existing match without
// overwriting data already there (import should enrich, never clobber).
async function upsertPerson(db, { fullName, email, phone, companyId, title }, patch = true) {
  const id = newId('per_')
  const key = emailKey(email, id)
  const now = new Date().toISOString()
  const ins = await db.sql`
    INSERT INTO crm_people ("id", "full_name", "email", "email_key", "phone", "company_id", "title", "notes", "details", "created_at", "updated_at")
    VALUES (${id}, ${str(fullName, 200)}, ${str(email, 200)}, ${key}, ${str(phone, 60)}, ${str(companyId, 80)}, ${str(title, 160)}, '', '{}'::jsonb, ${now}, ${now})
    ON CONFLICT ("email_key") DO NOTHING
    RETURNING *
  `
  if (ins.length) return { row: ins[0], created: true }
  const ex = (await db.sql`SELECT * FROM crm_people WHERE "email_key" = ${key} LIMIT 1`)[0]
  if (patch && ex) {
    // Enrich only empty fields so a later, richer source can fill gaps.
    const next = {
      full_name: ex.full_name || str(fullName, 200),
      phone: ex.phone || str(phone, 60),
      company_id: ex.company_id || str(companyId, 80),
      title: ex.title || str(title, 160),
    }
    if (next.full_name !== ex.full_name || next.phone !== ex.phone || next.company_id !== ex.company_id || next.title !== ex.title) {
      const upd = await db.sql`
        UPDATE crm_people SET "full_name" = ${next.full_name}, "phone" = ${next.phone},
          "company_id" = ${next.company_id}, "title" = ${next.title}, "updated_at" = ${now}
        WHERE "id" = ${ex.id} RETURNING *`
      return { row: upd[0], created: false }
    }
  }
  return { row: ex, created: false }
}

// Grant a role to a person, idempotently (the unique index makes a repeat a
// no-op). Returns true when a new link was created.
async function addRole(db, personId, role, eventId) {
  const r = ROLES.has(role) ? role : 'other'
  const ins = await db.sql`
    INSERT INTO crm_person_roles ("id", "person_id", "role", "event_id", "status", "details", "created_at")
    VALUES (${newId('rol_')}, ${personId}, ${r}, ${str(eventId, 80)}, 'active', '{}'::jsonb, ${new Date().toISOString()})
    ON CONFLICT ("person_id", "role", "event_id") DO NOTHING
    RETURNING "id"`
  return ins.length > 0
}

// Link a company to an event edition, idempotently. Returns true when created.
async function addCompanyEvent(db, companyId, eventId, relationship) {
  if (!companyId || !eventId) return false
  const rel = RELATIONSHIPS.has(relationship) ? relationship : 'exhibitor'
  const ins = await db.sql`
    INSERT INTO crm_company_events ("id", "company_id", "event_id", "relationship", "notes", "created_at")
    VALUES (${newId('cev_')}, ${companyId}, ${eventId}, ${rel}, '', ${new Date().toISOString()})
    ON CONFLICT ("company_id", "event_id") DO NOTHING
    RETURNING "id"`
  return ins.length > 0
}

// ── Reads ──

// The full people list, each decorated with its company name and role summary.
// The role set/count is aggregated database-side (a grouped array_agg joined by
// person_id) rather than by reading the entire crm_person_roles table into JS,
// so the volume returned is bounded by the LIMITed people set. Text filtering
// stays in JS: the admin dataset is modest and this keeps the SQL unambiguous.
async function listPeople(db, { role, q, companyId }) {
  const people = await db.sql`
    SELECT p.*, c.name AS company_name,
      COALESCE(r.roles, ARRAY[]::text[]) AS role_names,
      COALESCE(r.role_count, 0) AS role_count
    FROM crm_people p
    LEFT JOIN crm_companies c ON c.id = p.company_id
    LEFT JOIN (
      SELECT person_id, array_agg(DISTINCT role) AS roles, COUNT(*)::int AS role_count
      FROM crm_person_roles GROUP BY person_id
    ) r ON r.person_id = p.id
    ORDER BY LOWER(p.full_name), p.created_at DESC
    LIMIT ${LIMIT}`
  const needle = String(q || '').trim().toLowerCase()
  const items = people.map((row) => {
    const p = normPerson(row)
    p.roles = Array.isArray(row.role_names) ? row.role_names.slice().sort() : []
    p.roleCount = row.role_count || 0
    return p
  }).filter((p) => {
    if (companyId && p.companyId !== companyId) return false
    if (role && p.roles.indexOf(role) === -1) return false
    if (needle && (p.fullName + ' ' + p.email + ' ' + p.companyName).toLowerCase().indexOf(needle) === -1) return false
    return true
  })
  return items
}

async function getPerson(db, id) {
  const rows = await db.sql`
    SELECT p.*, c.name AS company_name FROM crm_people p
    LEFT JOIN crm_companies c ON c.id = p.company_id WHERE p.id = ${id} LIMIT 1`
  const person = normPerson(rows[0])
  if (!person) return null
  const roles = await db.sql`
    SELECT r.*, e.name AS event_name FROM crm_person_roles r
    LEFT JOIN events e ON e.id = r.event_id WHERE r.person_id = ${id}
    ORDER BY r.created_at ASC`
  person.roles = roles.map((r) => ({
    id: r.id, role: r.role, eventId: r.event_id || '', eventName: r.event_name || '',
    status: r.status || 'active', createdAt: iso(r.created_at),
  }))
  return person
}

async function listCompanies(db, { q }) {
  const companies = await db.sql`SELECT * FROM crm_companies ORDER BY LOWER(name), created_at DESC LIMIT ${LIMIT}`
  const evCounts = await db.sql`SELECT "company_id", COUNT(*)::int AS count FROM crm_company_events GROUP BY "company_id"`
  const peopleCounts = await db.sql`SELECT "company_id", COUNT(*)::int AS count FROM crm_people WHERE "company_id" <> '' GROUP BY "company_id"`
  const evBy = {}, peBy = {}
  for (const r of evCounts) evBy[r.company_id] = r.count
  for (const r of peopleCounts) peBy[r.company_id] = r.count
  const needle = String(q || '').trim().toLowerCase()
  return companies.map((row) => {
    const c = normCompany(row)
    c.eventCount = evBy[c.id] || 0
    c.peopleCount = peBy[c.id] || 0
    return c
  }).filter((c) => !needle || (c.name + ' ' + c.website + ' ' + c.industry).toLowerCase().indexOf(needle) >= 0)
}

async function getCompany(db, id) {
  const company = normCompany((await db.sql`SELECT * FROM crm_companies WHERE id = ${id} LIMIT 1`)[0])
  if (!company) return null
  const events = await db.sql`
    SELECT ce.*, e.name AS event_name, e.status AS event_status FROM crm_company_events ce
    LEFT JOIN events e ON e.id = ce.event_id WHERE ce.company_id = ${id}
    ORDER BY ce.created_at ASC`
  company.events = events.map((r) => ({
    id: r.id, eventId: r.event_id || '', eventName: r.event_name || '(unknown event)',
    eventStatus: r.event_status || '', relationship: r.relationship || 'exhibitor', createdAt: iso(r.created_at),
  }))
  const people = await db.sql`SELECT * FROM crm_people WHERE company_id = ${id} ORDER BY LOWER(full_name) LIMIT 500`
  company.people = people.map(normPerson)
  return company
}

async function getStats(db) {
  const [pe, co, ro, ev] = await Promise.all([
    db.sql`SELECT COUNT(*)::int AS n FROM crm_people`,
    db.sql`SELECT COUNT(*)::int AS n FROM crm_companies`,
    db.sql`SELECT COUNT(*)::int AS n FROM crm_person_roles`,
    db.sql`SELECT COUNT(*)::int AS n FROM crm_company_events`,
  ])
  // How much duplication the model removes: source rows that carry an email or a
  // company name, versus the canonical records they collapse into.
  const [srcPeople, srcCompanies] = await Promise.all([
    db.sql`
      SELECT COUNT(*)::int AS n FROM (
        SELECT LOWER(email) AS e FROM profiles WHERE email <> ''
        UNION ALL SELECT LOWER(email) FROM applications WHERE email <> ''
      ) s`,
    db.sql`
      SELECT COUNT(*)::int AS n FROM (
        SELECT LOWER(company) AS c FROM profiles WHERE company <> ''
      ) s`,
  ])
  return {
    people: pe[0].n, companies: co[0].n, roleLinks: ro[0].n, eventLinks: ev[0].n,
    source: { emailRecords: srcPeople[0].n, companyMentions: srcCompanies[0].n },
  }
}

// ── Import / dedup from the public data ──
// Walks every profile and application, upserting each into a canonical person
// (by email) and company (by name), attaching the derived role scoped to the
// record's event, and linking the company to that event. Idempotent: running it
// again matches existing records instead of duplicating them.
async function importFromSource(db) {
  const profiles = await db.sql`SELECT "display_name", "email", "company", "role", "event_id", "details" FROM profiles`
  const applications = await db.sql`SELECT "name", "email", "type", "event_id", "fields" FROM applications`
  const out = { scanned: 0, skipped: 0, peopleCreated: 0, peopleMatched: 0, companiesCreated: 0, companiesMatched: 0, rolesAdded: 0, eventLinksAdded: 0 }
  const companyCache = new Map() // name_key → id, to avoid re-hitting the db

  async function resolveCompany(name) {
    const clean = String(name || '').trim()
    if (!clean) return ''
    const key = clean.toLowerCase().replace(/\s+/g, ' ')
    if (companyCache.has(key)) return companyCache.get(key)
    const res = await upsertCompany(db, clean)
    if (!res || !res.row) return ''
    if (res.created) out.companiesCreated++; else out.companiesMatched++
    companyCache.set(key, res.row.id)
    return res.row.id
  }

  async function handle(name, email, companyName, role, eventId) {
    out.scanned++
    // A source row with neither a name nor an email cannot be identified as a
    // person — importing it would create a nameless, email-less phantom that can
    // never be deduped (its key falls back to a fresh id every run). Skip it, the
    // same way manual person creation refuses a blank name+email.
    if (!String(name || '').trim() && !String(email || '').trim()) { out.skipped++; return }
    const companyId = await resolveCompany(companyName)
    const res = await upsertPerson(db, { fullName: name, email, phone: '', companyId, title: '' })
    if (!res || !res.row) return
    if (res.created) out.peopleCreated++; else out.peopleMatched++
    if (await addRole(db, res.row.id, role, eventId || '')) out.rolesAdded++
    if (companyId && eventId) {
      // Map the person's role to a company-event relationship where it makes sense.
      const rel = RELATIONSHIPS.has(role) ? role : 'exhibitor'
      if (await addCompanyEvent(db, companyId, eventId, rel)) out.eventLinksAdded++
    }
  }

  for (const p of profiles) {
    await handle(p.display_name, p.email, p.company, p.role || 'attendee', p.event_id || '')
  }
  for (const a of applications) {
    const fields = a.fields || {}
    const companyName = fields.company || fields.companyName || fields.businessName || fields.organization || ''
    await handle(a.name, a.email, companyName, a.type || 'other', a.event_id || '')
  }
  return out
}

export default async (req) => {
  const db = getDatabase()
  const url = new URL(req.url)
  const resource = url.searchParams.get('resource') || 'people'
  const id = url.searchParams.get('id')

  // Every entry point is admin-only.
  const admin = await requireAdmin(req, db)
  if (admin instanceof Response) return admin

  // ── Reads ──
  if (req.method === 'GET') {
    if (resource === 'stats') return json({ stats: await getStats(db) })
    if (resource === 'people') {
      if (id) {
        const item = await getPerson(db, id)
        if (!item) return json({ error: 'Not found' }, 404)
        return json({ item })
      }
      return json({
        items: await listPeople(db, {
          role: url.searchParams.get('role') || '',
          q: url.searchParams.get('q') || '',
          companyId: url.searchParams.get('companyId') || '',
        }),
      })
    }
    if (resource === 'companies') {
      if (id) {
        const item = await getCompany(db, id)
        if (!item) return json({ error: 'Not found' }, 404)
        return json({ item })
      }
      return json({ items: await listCompanies(db, { q: url.searchParams.get('q') || '' }) })
    }
    return json({ error: 'Unknown resource' }, 400)
  }

  // Every mutation is a same-origin admin action.
  const cross = requireSameOrigin(req)
  if (cross) return cross

  let body = {}
  if (req.method !== 'DELETE') {
    try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
    if (!body || typeof body !== 'object') return json({ error: 'Expected a JSON object' }, 400)
  }

  // ── Create ──
  if (req.method === 'POST') {
    if (body.action === 'import' || resource === 'import') {
      const result = await importFromSource(db)
      await recordAudit(db, req, admin, { action: 'crm.import', resourceType: 'crm', resourceId: 'import', details: result })
      return json({ ok: true, result })
    }

    if (resource === 'person') {
      const fullName = str(body.fullName, 200).trim()
      const email = str(body.email, 200).trim()
      if (!fullName && !email) return json({ error: 'A person needs a name or an email.' }, 400)
      // Refuse to silently merge into an existing email — tell the admin instead.
      if (email) {
        const clash = await db.sql`SELECT "id" FROM crm_people WHERE "email_key" = ${email.toLowerCase()} LIMIT 1`
        if (clash.length) return json({ error: 'A person with that email already exists.', existingId: clash[0].id }, 409)
      }
      const res = await upsertPerson(db, { fullName, email, phone: body.phone, companyId: body.companyId, title: body.title }, false)
      const item = await getPerson(db, res.row.id)
      await recordAudit(db, req, admin, { action: 'crm.person.create', resourceType: 'crm_person', resourceId: res.row.id, details: { fullName, email } })
      return json({ ok: true, item })
    }

    if (resource === 'company') {
      const name = str(body.name, 200).trim()
      if (!name) return json({ error: 'A company needs a name.' }, 400)
      const clash = await db.sql`SELECT "id" FROM crm_companies WHERE "name_key" = ${nameKey(name, '')} LIMIT 1`
      if (clash.length) return json({ error: 'A company with that name already exists.', existingId: clash[0].id }, 409)
      const res = await upsertCompany(db, name, { website: body.website, industry: body.industry, notes: body.notes })
      const item = await getCompany(db, res.row.id)
      await recordAudit(db, req, admin, { action: 'crm.company.create', resourceType: 'crm_company', resourceId: res.row.id, details: { name } })
      return json({ ok: true, item })
    }

    if (resource === 'role') {
      if (!body.personId) return json({ error: 'Missing personId' }, 400)
      const role = ROLES.has(body.role) ? body.role : ''
      if (!role) return json({ error: 'Unknown role' }, 400)
      const created = await addRole(db, str(body.personId, 80), role, str(body.eventId, 80))
      await recordAudit(db, req, admin, { action: 'crm.role.add', resourceType: 'crm_person', resourceId: str(body.personId, 80), details: { role, eventId: body.eventId || '', created } })
      return json({ ok: true, created, item: await getPerson(db, str(body.personId, 80)) })
    }

    if (resource === 'companyEvent') {
      if (!body.companyId || !body.eventId) return json({ error: 'Missing companyId or eventId' }, 400)
      const created = await addCompanyEvent(db, str(body.companyId, 80), str(body.eventId, 80), body.relationship)
      await recordAudit(db, req, admin, { action: 'crm.companyEvent.add', resourceType: 'crm_company', resourceId: str(body.companyId, 80), details: { eventId: body.eventId, relationship: body.relationship || 'exhibitor', created } })
      return json({ ok: true, created, item: await getCompany(db, str(body.companyId, 80)) })
    }

    return json({ error: 'Unknown resource' }, 400)
  }

  // ── Update ──
  if (req.method === 'PUT' || req.method === 'PATCH') {
    const targetId = body.id || id
    if (!targetId) return json({ error: 'Missing id' }, 400)

    if (resource === 'person') {
      const cur = (await db.sql`SELECT * FROM crm_people WHERE id = ${targetId} LIMIT 1`)[0]
      if (!cur) return json({ error: 'Not found' }, 404)
      const email = body.email !== undefined ? str(body.email, 200).trim() : cur.email
      const key = emailKey(email, cur.id)
      // Guard the unique email against another person.
      if (key !== cur.email_key) {
        const clash = await db.sql`SELECT "id" FROM crm_people WHERE "email_key" = ${key} AND "id" <> ${cur.id} LIMIT 1`
        if (clash.length) return json({ error: 'Another person already has that email.', existingId: clash[0].id }, 409)
      }
      const next = {
        full_name: body.fullName !== undefined ? str(body.fullName, 200) : cur.full_name,
        email, email_key: key,
        phone: body.phone !== undefined ? str(body.phone, 60) : cur.phone,
        company_id: body.companyId !== undefined ? str(body.companyId, 80) : cur.company_id,
        title: body.title !== undefined ? str(body.title, 160) : cur.title,
        notes: body.notes !== undefined ? str(body.notes, 4000) : cur.notes,
      }
      await db.sql`
        UPDATE crm_people SET "full_name" = ${next.full_name}, "email" = ${next.email}, "email_key" = ${next.email_key},
          "phone" = ${next.phone}, "company_id" = ${next.company_id}, "title" = ${next.title}, "notes" = ${next.notes},
          "updated_at" = ${new Date().toISOString()} WHERE "id" = ${cur.id}`
      await recordAudit(db, req, admin, { action: 'crm.person.update', resourceType: 'crm_person', resourceId: cur.id, details: { fullName: next.full_name } })
      return json({ ok: true, item: await getPerson(db, cur.id) })
    }

    if (resource === 'company') {
      const cur = (await db.sql`SELECT * FROM crm_companies WHERE id = ${targetId} LIMIT 1`)[0]
      if (!cur) return json({ error: 'Not found' }, 404)
      const name = body.name !== undefined ? str(body.name, 200).trim() : cur.name
      const key = nameKey(name, cur.id)
      if (key !== cur.name_key) {
        const clash = await db.sql`SELECT "id" FROM crm_companies WHERE "name_key" = ${key} AND "id" <> ${cur.id} LIMIT 1`
        if (clash.length) return json({ error: 'Another company already has that name.', existingId: clash[0].id }, 409)
      }
      const next = {
        name, name_key: key,
        website: body.website !== undefined ? str(body.website, 300) : cur.website,
        industry: body.industry !== undefined ? str(body.industry, 120) : cur.industry,
        notes: body.notes !== undefined ? str(body.notes, 4000) : cur.notes,
      }
      await db.sql`
        UPDATE crm_companies SET "name" = ${next.name}, "name_key" = ${next.name_key}, "website" = ${next.website},
          "industry" = ${next.industry}, "notes" = ${next.notes}, "updated_at" = ${new Date().toISOString()} WHERE "id" = ${cur.id}`
      await recordAudit(db, req, admin, { action: 'crm.company.update', resourceType: 'crm_company', resourceId: cur.id, details: { name: next.name } })
      return json({ ok: true, item: await getCompany(db, cur.id) })
    }

    return json({ error: 'Unknown resource' }, 400)
  }

  // ── Delete ──
  if (req.method === 'DELETE') {
    if (!id) return json({ error: 'Missing id' }, 400)

    if (resource === 'person') {
      await db.sql`DELETE FROM crm_person_roles WHERE "person_id" = ${id}`
      await db.sql`DELETE FROM crm_people WHERE "id" = ${id}`
      await recordAudit(db, req, admin, { action: 'crm.person.delete', resourceType: 'crm_person', resourceId: id, details: {} })
      return json({ ok: true })
    }
    if (resource === 'company') {
      // Detach people (keep the person, drop the affiliation) and remove links.
      await db.sql`UPDATE crm_people SET "company_id" = '' WHERE "company_id" = ${id}`
      await db.sql`DELETE FROM crm_company_events WHERE "company_id" = ${id}`
      await db.sql`DELETE FROM crm_companies WHERE "id" = ${id}`
      await recordAudit(db, req, admin, { action: 'crm.company.delete', resourceType: 'crm_company', resourceId: id, details: {} })
      return json({ ok: true })
    }
    if (resource === 'role') {
      await db.sql`DELETE FROM crm_person_roles WHERE "id" = ${id}`
      await recordAudit(db, req, admin, { action: 'crm.role.remove', resourceType: 'crm_person', resourceId: id, details: {} })
      return json({ ok: true })
    }
    if (resource === 'companyEvent') {
      await db.sql`DELETE FROM crm_company_events WHERE "id" = ${id}`
      await recordAudit(db, req, admin, { action: 'crm.companyEvent.remove', resourceType: 'crm_company', resourceId: id, details: {} })
      return json({ ok: true })
    }
    return json({ error: 'Unknown resource' }, 400)
  }

  return json({ error: 'Method Not Allowed' }, 405)
}
