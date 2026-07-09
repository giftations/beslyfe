import { getDatabase } from '@netlify/database'
import { requireAdmin, requireSameOrigin } from './lib/session.mjs'

// Persistent, fully customizable event floor plan. The admin editor saves a
// draft and publishes it; the public viewer reads the published layout. Stored
// as rows in the `floorplan` table so the plan is shared across every
// browser/device and lives alongside the rest of the site's data.
//
//   GET                      → published layout (public viewer)
//   GET ?draft=1             → working draft (admin editor)
//   PUT  { ...layout }       → save the draft
//   POST ?action=publish     → copy the current draft to published
//
// A layout is { venue:{name,widthFt,heightFt}, booths:[...], updatedAt }.

const DRAFT_KEY = 'draft'
const PUBLISHED_KEY = 'published'

const MAX_BOOTHS = 1000
const USES = new Set(['vendor', 'food', 'sponsor', 'stage', 'entrance', 'restroom', 'lounge', 'other'])
const STATUSES = new Set(['available', 'reserved', 'sold'])

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  })
}

function num(value, def, min, max) {
  var n = Number(value)
  if (!isFinite(n)) n = def
  if (min !== undefined) n = Math.max(min, n)
  if (max !== undefined) n = Math.min(max, n)
  return n
}

function str(value, max) {
  if (value === null || value === undefined) return ''
  return String(value).slice(0, max)
}

// Coerce arbitrary client input into a safe, bounded layout object.
function sanitizeLayout(input) {
  const v = (input && input.venue) || {}
  const venue = {
    name: str(v.name, 120) || 'Bayfront Convention Center',
    widthFt: num(v.widthFt, 200, 10, 2000),
    heightFt: num(v.heightFt, 120, 10, 2000),
  }
  const boothsIn = Array.isArray(input && input.booths) ? input.booths.slice(0, MAX_BOOTHS) : []
  const booths = boothsIn.map((b, i) => ({
    id: str(b.id, 60) || `b-${i}-${Math.round(Math.random() * 1e6).toString(36)}`,
    label: str(b.label, 40),
    x: num(b.x, 0, 0, 2000),
    y: num(b.y, 0, 0, 2000),
    wFt: num(b.wFt, 10, 1, 500),
    hFt: num(b.hFt, 10, 1, 500),
    use: USES.has(b.use) ? b.use : 'vendor',
    status: STATUSES.has(b.status) ? b.status : 'available',
    tier: str(b.tier, 40),
    price: str(b.price, 40),
    assignedTo: str(b.assignedTo, 160),
    logoUrl: str(b.logoUrl, 1000),
    notes: str(b.notes, 280),
  }))
  return { venue, booths }
}

// Read one layout row ('draft' or 'published'). Returns the stored layout
// object, or null when nothing has been saved yet.
async function readLayout(db, key) {
  const rows = await db.sql`SELECT "data" FROM floorplan WHERE "key" = ${key} LIMIT 1`
  return rows.length ? (rows[0].data || null) : null
}

// Save a layout row, creating it on first write and overwriting thereafter.
async function writeLayout(db, key, layout) {
  await db.sql`
    INSERT INTO floorplan ("key", "data", "updated_at")
    VALUES (${key}, ${JSON.stringify(layout)}::jsonb, ${new Date().toISOString()})
    ON CONFLICT ("key") DO UPDATE SET "data" = EXCLUDED."data", "updated_at" = EXCLUDED."updated_at"
  `
}

export default async (req) => {
  const db = getDatabase()
  const url = new URL(req.url)

  if (req.method === 'GET') {
    const wantsDraft = !!url.searchParams.get('draft')
    // The published layout is public; the working draft is admin-only.
    if (wantsDraft) {
      const admin = await requireAdmin(req, db)
      if (admin instanceof Response) return admin
    }
    const key = wantsDraft ? DRAFT_KEY : PUBLISHED_KEY
    const data = await readLayout(db, key)
    if (!data) {
      return json(
        { venue: { name: 'Bayfront Convention Center', widthFt: 200, heightFt: 120 }, booths: [], published: false },
        200,
        { 'Cache-Control': 'no-store' }
      )
    }
    return json(data, 200, { 'Cache-Control': 'no-store' })
  }

  if (req.method === 'PUT') {
    const cross = requireSameOrigin(req)
    if (cross) return cross
    const admin = await requireAdmin(req, db)
    if (admin instanceof Response) return admin
    let body
    try {
      body = await req.json()
    } catch {
      return json({ error: 'Invalid JSON' }, 400)
    }
    const layout = sanitizeLayout(body)
    layout.updatedAt = new Date().toISOString()
    layout.draft = true
    await writeLayout(db, DRAFT_KEY, layout)
    return json({ ok: true, layout })
  }

  if (req.method === 'POST' && url.searchParams.get('action') === 'publish') {
    const cross = requireSameOrigin(req)
    if (cross) return cross
    const admin = await requireAdmin(req, db)
    if (admin instanceof Response) return admin
    let draft = await readLayout(db, DRAFT_KEY)
    // Allow publishing a payload sent directly in the request body too.
    if (req.headers.get('content-type') && req.headers.get('content-type').includes('application/json')) {
      try {
        const body = await req.json()
        if (body && (body.booths || body.venue)) draft = sanitizeLayout(body)
      } catch { /* fall back to the stored draft */ }
    }
    if (!draft) return json({ error: 'Nothing to publish yet — save a draft first.' }, 400)
    const published = { ...draft, draft: false, published: true, publishedAt: new Date().toISOString() }
    await writeLayout(db, PUBLISHED_KEY, published)
    // Keep the draft in sync with what was just published.
    await writeLayout(db, DRAFT_KEY, { ...published, draft: true })
    return json({ ok: true, layout: published })
  }

  return json({ error: 'Method Not Allowed' }, 405)
}
