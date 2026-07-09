import { getDatabase } from '@netlify/database'
import { requireAdmin, requireSameOrigin, recordAudit, json, str, iso, newId, toDate, logWarn } from './lib/session.mjs'

// ── Advertising platform ──
//
// Sells and serves event advertising inventory and tracks its delivery and
// billing. It has two audiences behind one function:
//
//   • The public site  — `resource=serve` returns the creatives eligible for a
//     placement right now (respecting campaign status and the scheduled
//     start/end window) and logs an impression for each; `action=click` logs a
//     click and redirects to the advertiser's URL. Both are unauthenticated.
//   • The admin (Ad Manager) — everything else is admin-only and manages
//     campaigns, their creatives, invoices and reporting.
//
// The advertiser is a canonical CRM company (crm_companies) referenced by id, so
// no advertiser data is duplicated. Conventions mirror crm.mjs: native driver,
// requireAdmin + requireSameOrigin on mutations, audited writes, cents-as-integer
// money. See db/schema.ts (ad_campaigns / ad_creatives / ad_events / ad_invoices).

const PLACEMENTS = new Set(['homepage_banner', 'directory', 'featured_vendor', 'email_sponsor', 'sidebar'])
const CAMPAIGN_STATUSES = new Set(['draft', 'scheduled', 'active', 'paused', 'completed', 'archived'])
const RATE_TYPES = new Set(['flat', 'cpm', 'cpc'])
const CREATIVE_STATUSES = new Set(['active', 'paused'])
const INVOICE_STATUSES = new Set(['draft', 'sent', 'paid', 'void'])
const LIMIT = 1000

// Coerce any incoming money value (dollars, string or number) to integer cents.
function toCents(value) {
  if (value === null || value === undefined || value === '') return 0
  const n = Number(value)
  if (!isFinite(n) || n < 0) return 0
  return Math.round(n * 100)
}
function toInt(value, def, min, max) {
  const n = parseInt(value, 10)
  if (!isFinite(n)) return def
  return Math.max(min, Math.min(max, n))
}

// ── Normalizers ──
function normCampaign(row) {
  if (!row) return null
  return {
    id: row.id,
    eventId: row.event_id || '',
    companyId: row.company_id || '',
    companyName: row.company_name || '',
    name: row.name || '',
    status: row.status || 'draft',
    rateType: row.rate_type || 'flat',
    rateAmountCents: row.rate_amount_cents || 0,
    budgetCents: row.budget_cents || 0,
    priority: row.priority || 1,
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    notes: row.notes || '',
    details: row.details || {},
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}
function normCreative(row) {
  if (!row) return null
  return {
    id: row.id,
    campaignId: row.campaign_id || '',
    placement: row.placement || 'homepage_banner',
    headline: row.headline || '',
    body: row.body || '',
    imageUrl: row.image_url || '',
    ctaLabel: row.cta_label || '',
    targetUrl: row.target_url || '',
    profileId: row.profile_id || '',
    weight: row.weight || 1,
    status: row.status || 'active',
    details: row.details || {},
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}
function normInvoice(row) {
  if (!row) return null
  return {
    id: row.id,
    campaignId: row.campaign_id || '',
    companyId: row.company_id || '',
    companyName: row.company_name || '',
    campaignName: row.campaign_name || '',
    number: row.number || '',
    amountCents: row.amount_cents || 0,
    currency: row.currency || 'USD',
    status: row.status || 'draft',
    issuedAt: iso(row.issued_at),
    dueAt: iso(row.due_at),
    paidAt: iso(row.paid_at),
    lineItems: row.line_items || [],
    notes: row.notes || '',
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

// ── Public serving ──

// Only ever redirect a click to an http(s) URL we stored ourselves. Guards the
// click tracker from being turned into an open redirect.
function safeRedirect(url) {
  const u = String(url || '').trim()
  if (/^https?:\/\//i.test(u)) return u
  if (u.startsWith('/')) return u
  return '/'
}

// A uniform random integer in [0, max) from the platform CSPRNG. Rejection
// sampling removes the modulo bias a plain `% max` would introduce, so the ad
// rotation is fair even for weights that don't divide 2^32.
function randInt(max) {
  if (max <= 1) return 0
  const limit = Math.floor(0x100000000 / max) * max
  const buf = new Uint32Array(1)
  let x
  do { crypto.getRandomValues(buf); x = buf[0] } while (x >= limit)
  return x % max
}

// Pick up to `count` creatives from the eligible pool, weighted by the product of
// the creative weight and its campaign priority, without replacement.
function weightedPick(pool, count) {
  const items = pool.slice()
  const out = []
  while (items.length && out.length < count) {
    let total = 0
    for (const it of items) total += Math.max(1, (it.weight || 1) * (it.priority || 1))
    // Seed the selection from a cryptographic RNG rather than the clock: a
    // clock-derived offset makes rotation predictable and biases selection under
    // bursts (many impressions within the same millisecond serve identically).
    let r = randInt(total)
    let idx = 0
    for (let i = 0; i < items.length; i++) {
      r -= Math.max(1, (items[i].weight || 1) * (items[i].priority || 1))
      if (r < 0) { idx = i; break }
    }
    out.push(items.splice(idx, 1)[0])
  }
  return out
}

// Return the creatives eligible to serve in `placement` right now, and log an
// impression for each. `event` optionally scopes to one edition; when omitted,
// globally-scoped campaigns (event_id '') and any edition both qualify.
async function serve(db, req, { placement, eventId, count, path }) {
  const rows = await db.sql`
    SELECT cr.*, c.priority, c.status AS campaign_status, c.starts_at, c.ends_at, c.event_id AS campaign_event
    FROM ad_creatives cr
    JOIN ad_campaigns c ON c.id = cr.campaign_id
    WHERE cr.placement = ${placement}
      AND cr.status = 'active'
      AND c.status = 'active'
      AND (c.starts_at IS NULL OR c.starts_at <= now())
      AND (c.ends_at IS NULL OR c.ends_at >= now())
    LIMIT ${LIMIT}`
  const pool = rows
    .filter((r) => !eventId || !r.campaign_event || r.campaign_event === eventId)
    .map((r) => ({ ...normCreative(r), priority: r.priority || 1 }))
  const chosen = weightedPick(pool, count)

  // Log one impression per served creative (best-effort — never fail delivery),
  // but record a failure rather than dropping it silently so impression counts
  // that go quiet are attributable to a logging fault, not zero traffic.
  for (const cr of chosen) {
    try {
      await db.sql`
        INSERT INTO ad_events ("id", "creative_id", "campaign_id", "placement", "kind", "event_id", "path", "created_at")
        VALUES (${newId('aev_')}, ${cr.id}, ${cr.campaignId}, ${placement}, 'impression', ${str(eventId, 80)}, ${str(path, 300)}, ${new Date().toISOString()})`
    } catch (error) {
      logWarn('ads', 'impression log failed', { creativeId: cr.id, campaignId: cr.campaignId, placement, error: error && error.message })
    }
  }
  // Shape a lean public payload with a same-origin click-tracking URL.
  return chosen.map((cr) => ({
    id: cr.id,
    placement: cr.placement,
    headline: cr.headline,
    body: cr.body,
    imageUrl: cr.imageUrl,
    ctaLabel: cr.ctaLabel,
    profileId: cr.profileId,
    clickUrl: '/.netlify/functions/ads?action=click&creative=' + encodeURIComponent(cr.id),
  }))
}

async function logClick(db, req, creativeId, path) {
  const rows = await db.sql`
    SELECT cr."target_url", cr."campaign_id", cr."placement", cr."profile_id", c."event_id"
    FROM ad_creatives cr LEFT JOIN ad_campaigns c ON c.id = cr.campaign_id
    WHERE cr.id = ${creativeId} LIMIT 1`
  const row = rows[0]
  if (!row) return '/'
  try {
    await db.sql`
      INSERT INTO ad_events ("id", "creative_id", "campaign_id", "placement", "kind", "event_id", "path", "created_at")
      VALUES (${newId('aev_')}, ${creativeId}, ${row.campaign_id || ''}, ${row.placement || ''}, 'click', ${row.event_id || ''}, ${str(path, 300)}, ${new Date().toISOString()})`
  } catch (error) {
    logWarn('ads', 'click log failed', { creativeId, campaignId: row.campaign_id || '', placement: row.placement || '', error: error && error.message })
  }
  // Featured-vendor clicks land on the promoted profile when no explicit URL set.
  if (!row.target_url && row.profile_id) return '/profile?id=' + encodeURIComponent(row.profile_id)
  return safeRedirect(row.target_url)
}

// ── Admin reads ──

async function listCampaigns(db, { status, companyId, eventId }) {
  const rows = await db.sql`
    SELECT c.*, co.name AS company_name FROM ad_campaigns c
    LEFT JOIN crm_companies co ON co.id = c.company_id
    ORDER BY c.created_at DESC LIMIT ${LIMIT}`
  // Aggregate delivery + creative counts in two grouped queries, joined in JS.
  const deliv = await db.sql`
    SELECT "campaign_id", "kind", COUNT(*)::int AS n FROM ad_events GROUP BY "campaign_id", "kind"`
  const creatives = await db.sql`SELECT "campaign_id", COUNT(*)::int AS n FROM ad_creatives GROUP BY "campaign_id"`
  const impBy = {}, clkBy = {}, crBy = {}
  for (const r of deliv) { if (r.kind === 'impression') impBy[r.campaign_id] = r.n; else if (r.kind === 'click') clkBy[r.campaign_id] = r.n }
  for (const r of creatives) crBy[r.campaign_id] = r.n
  return rows.map((row) => {
    const c = normCampaign(row)
    c.impressions = impBy[c.id] || 0
    c.clicks = clkBy[c.id] || 0
    c.creativeCount = crBy[c.id] || 0
    return c
  }).filter((c) => {
    if (status && c.status !== status) return false
    if (companyId && c.companyId !== companyId) return false
    if (eventId && c.eventId !== eventId) return false
    return true
  })
}

async function getCampaign(db, id) {
  const campaign = normCampaign((await db.sql`
    SELECT c.*, co.name AS company_name FROM ad_campaigns c
    LEFT JOIN crm_companies co ON co.id = c.company_id WHERE c.id = ${id} LIMIT 1`)[0])
  if (!campaign) return null
  const creatives = await db.sql`SELECT * FROM ad_creatives WHERE campaign_id = ${id} ORDER BY created_at ASC`
  // Per-creative delivery so the admin sees which creative performs.
  const deliv = await db.sql`SELECT "creative_id", "kind", COUNT(*)::int AS n FROM ad_events WHERE campaign_id = ${id} GROUP BY "creative_id", "kind"`
  const impBy = {}, clkBy = {}
  for (const r of deliv) { if (r.kind === 'impression') impBy[r.creative_id] = r.n; else if (r.kind === 'click') clkBy[r.creative_id] = r.n }
  campaign.creatives = creatives.map((row) => {
    const cr = normCreative(row)
    cr.impressions = impBy[cr.id] || 0
    cr.clicks = clkBy[cr.id] || 0
    return cr
  })
  campaign.impressions = campaign.creatives.reduce((s, cr) => s + cr.impressions, 0)
  campaign.clicks = campaign.creatives.reduce((s, cr) => s + cr.clicks, 0)
  campaign.invoices = (await db.sql`SELECT * FROM ad_invoices WHERE campaign_id = ${id} ORDER BY created_at DESC`).map(normInvoice)
  return campaign
}

async function listInvoices(db, { status }) {
  const rows = await db.sql`
    SELECT i.*, co.name AS company_name, c.name AS campaign_name FROM ad_invoices i
    LEFT JOIN crm_companies co ON co.id = i.company_id
    LEFT JOIN ad_campaigns c ON c.id = i.campaign_id
    ORDER BY i.created_at DESC LIMIT ${LIMIT}`
  return rows.map(normInvoice).filter((i) => !status || i.status === status)
}

// Reporting: platform-wide totals, delivery by placement, and the top campaigns
// by impressions — everything computed live from ad_events.
async function getReport(db) {
  const [camp, deliv, byPlacement, topRows, revenue] = await Promise.all([
    db.sql`SELECT "status", COUNT(*)::int AS n FROM ad_campaigns GROUP BY "status"`,
    db.sql`SELECT "kind", COUNT(*)::int AS n FROM ad_events GROUP BY "kind"`,
    db.sql`SELECT "placement", "kind", COUNT(*)::int AS n FROM ad_events GROUP BY "placement", "kind"`,
    db.sql`
      SELECT c.id, c.name, co.name AS company_name,
        COUNT(*) FILTER (WHERE e.kind = 'impression')::int AS impressions,
        COUNT(*) FILTER (WHERE e.kind = 'click')::int AS clicks
      FROM ad_campaigns c
      LEFT JOIN crm_companies co ON co.id = c.company_id
      LEFT JOIN ad_events e ON e.campaign_id = c.id
      GROUP BY c.id, c.name, co.name
      ORDER BY impressions DESC NULLS LAST LIMIT 10`,
    db.sql`SELECT "status", COALESCE(SUM("amount_cents"),0)::int AS cents, COUNT(*)::int AS n FROM ad_invoices GROUP BY "status"`,
  ])
  const byStatus = {}; for (const r of camp) byStatus[r.status] = r.n
  let impressions = 0, clicks = 0
  for (const r of deliv) { if (r.kind === 'impression') impressions = r.n; else if (r.kind === 'click') clicks = r.n }
  const placements = {}
  for (const r of byPlacement) {
    const p = placements[r.placement] || (placements[r.placement] = { impressions: 0, clicks: 0 })
    if (r.kind === 'impression') p.impressions = r.n; else if (r.kind === 'click') p.clicks = r.n
  }
  const invoiceTotals = {}; let revenuePaidCents = 0, revenueOutstandingCents = 0
  for (const r of revenue) {
    invoiceTotals[r.status] = { count: r.n, cents: r.cents }
    if (r.status === 'paid') revenuePaidCents += r.cents
    if (r.status === 'sent') revenueOutstandingCents += r.cents
  }
  return {
    campaigns: { total: camp.reduce((s, r) => s + r.n, 0), byStatus },
    impressions, clicks,
    ctr: impressions ? Math.round((clicks / impressions) * 1000) / 10 : 0,
    placements,
    topCampaigns: topRows.map((r) => ({
      id: r.id, name: r.name || '(untitled)', companyName: r.company_name || '',
      impressions: r.impressions || 0, clicks: r.clicks || 0,
      ctr: r.impressions ? Math.round((r.clicks / r.impressions) * 1000) / 10 : 0,
    })),
    revenue: { paidCents: revenuePaidCents, outstandingCents: revenueOutstandingCents, byStatus: invoiceTotals },
  }
}

// ── Writes ──

async function createCampaign(db, body) {
  const id = newId('cmp_ad_')
  const now = new Date().toISOString()
  const status = CAMPAIGN_STATUSES.has(body.status) ? body.status : 'draft'
  const rateType = RATE_TYPES.has(body.rateType) ? body.rateType : 'flat'
  await db.sql`
    INSERT INTO ad_campaigns ("id","event_id","company_id","name","status","rate_type","rate_amount_cents","budget_cents","priority","starts_at","ends_at","notes","details","created_at","updated_at")
    VALUES (${id}, ${str(body.eventId, 80)}, ${str(body.companyId, 80)}, ${str(body.name, 200)}, ${status}, ${rateType},
      ${toCents(body.rateAmount)}, ${toCents(body.budget)}, ${toInt(body.priority, 1, 0, 1000)},
      ${toDate(body.startsAt)}, ${toDate(body.endsAt)}, ${str(body.notes, 4000)}, '{}'::jsonb, ${now}, ${now})`
  return id
}

async function createCreative(db, campaignId, body) {
  const id = newId('crv_')
  const now = new Date().toISOString()
  const placement = PLACEMENTS.has(body.placement) ? body.placement : 'homepage_banner'
  const status = CREATIVE_STATUSES.has(body.status) ? body.status : 'active'
  await db.sql`
    INSERT INTO ad_creatives ("id","campaign_id","placement","headline","body","image_url","cta_label","target_url","profile_id","weight","status","details","created_at","updated_at")
    VALUES (${id}, ${campaignId}, ${placement}, ${str(body.headline, 200)}, ${str(body.body, 600)}, ${str(body.imageUrl, 600)},
      ${str(body.ctaLabel, 80)}, ${str(body.targetUrl, 600)}, ${str(body.profileId, 80)}, ${toInt(body.weight, 1, 1, 1000)}, ${status}, '{}'::jsonb, ${now}, ${now})`
  return id
}

// A readable, unique invoice number: INV-<yyyymmdd>-<short>. The unique index on
// `number` guarantees no collision; the random suffix makes one unlikely anyway.
function invoiceNumber() {
  const d = new Date()
  const ymd = d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, '0') + String(d.getUTCDate()).padStart(2, '0')
  return 'INV-' + ymd + '-' + crypto.randomUUID().slice(0, 6).toUpperCase()
}

export default async (req) => {
  const db = getDatabase()
  const url = new URL(req.url)
  const resource = url.searchParams.get('resource') || 'campaigns'
  const action = url.searchParams.get('action') || ''
  const id = url.searchParams.get('id')

  // ── Public, unauthenticated surface ──
  // Click tracker: log then redirect. Kept above the admin gate on purpose.
  if (req.method === 'GET' && action === 'click') {
    const creativeId = url.searchParams.get('creative') || ''
    const to = creativeId ? await logClick(db, req, creativeId, url.searchParams.get('path') || '') : '/'
    return new Response(null, { status: 302, headers: { Location: to, 'Cache-Control': 'no-store' } })
  }
  // Serve inventory for a placement.
  if (req.method === 'GET' && resource === 'serve') {
    const placement = url.searchParams.get('placement') || ''
    if (!PLACEMENTS.has(placement)) return json({ items: [] })
    const items = await serve(db, req, {
      placement,
      eventId: url.searchParams.get('event') || '',
      count: toInt(url.searchParams.get('count'), 1, 1, 6),
      path: url.searchParams.get('path') || '',
    })
    return json({ items })
  }

  // ── Everything else is admin-only ──
  const admin = await requireAdmin(req, db)
  if (admin instanceof Response) return admin

  if (req.method === 'GET') {
    if (resource === 'report' || resource === 'stats') return json({ report: await getReport(db) })
    if (resource === 'campaigns') {
      if (id) {
        const item = await getCampaign(db, id)
        if (!item) return json({ error: 'Not found' }, 404)
        return json({ item })
      }
      return json({ items: await listCampaigns(db, {
        status: url.searchParams.get('status') || '',
        companyId: url.searchParams.get('companyId') || '',
        eventId: url.searchParams.get('eventId') || '',
      }) })
    }
    if (resource === 'invoices') return json({ items: await listInvoices(db, { status: url.searchParams.get('status') || '' }) })
    return json({ error: 'Unknown resource' }, 400)
  }

  // Mutations: same-origin admin actions only.
  const cross = requireSameOrigin(req)
  if (cross) return cross

  let body = {}
  if (req.method !== 'DELETE') {
    try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
    if (!body || typeof body !== 'object') return json({ error: 'Expected a JSON object' }, 400)
  }

  // ── Create ──
  if (req.method === 'POST') {
    if (resource === 'campaign') {
      if (!str(body.name, 200).trim()) return json({ error: 'A campaign needs a name.' }, 400)
      if (!str(body.companyId, 80).trim()) return json({ error: 'Choose the advertiser (a CRM company).' }, 400)
      const cid = await createCampaign(db, body)
      await recordAudit(db, req, admin, { action: 'ad.campaign.create', resourceType: 'ad_campaign', resourceId: cid, details: { name: str(body.name, 200), actorName: admin && admin.name } })
      return json({ ok: true, item: await getCampaign(db, cid) })
    }
    if (resource === 'creative') {
      const campaignId = str(body.campaignId, 80).trim()
      if (!campaignId) return json({ error: 'Missing campaignId' }, 400)
      const exists = await db.sql`SELECT "id" FROM ad_campaigns WHERE "id" = ${campaignId} LIMIT 1`
      if (!exists.length) return json({ error: 'Campaign not found' }, 404)
      const crid = await createCreative(db, campaignId, body)
      await recordAudit(db, req, admin, { action: 'ad.creative.create', resourceType: 'ad_creative', resourceId: crid, details: { campaignId, placement: body.placement || 'homepage_banner' } })
      return json({ ok: true, item: await getCampaign(db, campaignId) })
    }
    if (resource === 'invoice') {
      const campaignId = str(body.campaignId, 80).trim()
      if (!campaignId) return json({ error: 'Missing campaignId' }, 400)
      const camp = (await db.sql`SELECT * FROM ad_campaigns WHERE "id" = ${campaignId} LIMIT 1`)[0]
      if (!camp) return json({ error: 'Campaign not found' }, 404)
      // Default the amount to the campaign's rate when none is supplied.
      const amountCents = body.amount !== undefined ? toCents(body.amount) : (camp.rate_amount_cents || 0)
      const iid = newId('inv_')
      const now = new Date().toISOString()
      const number = str(body.number, 40).trim() || invoiceNumber()
      const lineItems = Array.isArray(body.lineItems) ? body.lineItems.slice(0, 50) : [{ label: camp.name || 'Advertising', amountCents }]
      await db.sql`
        INSERT INTO ad_invoices ("id","campaign_id","company_id","number","amount_cents","currency","status","issued_at","due_at","paid_at","line_items","notes","created_at","updated_at")
        VALUES (${iid}, ${campaignId}, ${camp.company_id || ''}, ${number}, ${amountCents}, ${str(body.currency, 8) || 'USD'},
          ${INVOICE_STATUSES.has(body.status) ? body.status : 'draft'}, ${toDate(body.issuedAt) || now}, ${toDate(body.dueAt)}, ${null},
          ${JSON.stringify(lineItems)}::jsonb, ${str(body.notes, 2000)}, ${now}, ${now})`
      await recordAudit(db, req, admin, { action: 'ad.invoice.create', resourceType: 'ad_invoice', resourceId: iid, details: { number, campaignId, actorName: admin && admin.name } })
      return json({ ok: true, item: (await db.sql`SELECT * FROM ad_invoices WHERE "id" = ${iid} LIMIT 1`).map(normInvoice)[0] })
    }
    return json({ error: 'Unknown resource' }, 400)
  }

  // ── Update ──
  if (req.method === 'PUT' || req.method === 'PATCH') {
    const targetId = body.id || id
    if (!targetId) return json({ error: 'Missing id' }, 400)

    if (resource === 'campaign') {
      const cur = (await db.sql`SELECT * FROM ad_campaigns WHERE id = ${targetId} LIMIT 1`)[0]
      if (!cur) return json({ error: 'Not found' }, 404)
      const next = {
        event_id: body.eventId !== undefined ? str(body.eventId, 80) : cur.event_id,
        company_id: body.companyId !== undefined ? str(body.companyId, 80) : cur.company_id,
        name: body.name !== undefined ? str(body.name, 200) : cur.name,
        status: body.status !== undefined && CAMPAIGN_STATUSES.has(body.status) ? body.status : cur.status,
        rate_type: body.rateType !== undefined && RATE_TYPES.has(body.rateType) ? body.rateType : cur.rate_type,
        rate_amount_cents: body.rateAmount !== undefined ? toCents(body.rateAmount) : cur.rate_amount_cents,
        budget_cents: body.budget !== undefined ? toCents(body.budget) : cur.budget_cents,
        priority: body.priority !== undefined ? toInt(body.priority, cur.priority, 0, 1000) : cur.priority,
        starts_at: body.startsAt !== undefined ? toDate(body.startsAt) : cur.starts_at,
        ends_at: body.endsAt !== undefined ? toDate(body.endsAt) : cur.ends_at,
        notes: body.notes !== undefined ? str(body.notes, 4000) : cur.notes,
      }
      await db.sql`
        UPDATE ad_campaigns SET "event_id" = ${next.event_id}, "company_id" = ${next.company_id}, "name" = ${next.name},
          "status" = ${next.status}, "rate_type" = ${next.rate_type}, "rate_amount_cents" = ${next.rate_amount_cents},
          "budget_cents" = ${next.budget_cents}, "priority" = ${next.priority}, "starts_at" = ${next.starts_at},
          "ends_at" = ${next.ends_at}, "notes" = ${next.notes}, "updated_at" = ${new Date().toISOString()} WHERE "id" = ${cur.id}`
      await recordAudit(db, req, admin, { action: 'ad.campaign.update', resourceType: 'ad_campaign', resourceId: cur.id, details: { name: next.name, status: next.status, actorName: admin && admin.name } })
      return json({ ok: true, item: await getCampaign(db, cur.id) })
    }

    if (resource === 'creative') {
      const cur = (await db.sql`SELECT * FROM ad_creatives WHERE id = ${targetId} LIMIT 1`)[0]
      if (!cur) return json({ error: 'Not found' }, 404)
      const next = {
        placement: body.placement !== undefined && PLACEMENTS.has(body.placement) ? body.placement : cur.placement,
        headline: body.headline !== undefined ? str(body.headline, 200) : cur.headline,
        body: body.body !== undefined ? str(body.body, 600) : cur.body,
        image_url: body.imageUrl !== undefined ? str(body.imageUrl, 600) : cur.image_url,
        cta_label: body.ctaLabel !== undefined ? str(body.ctaLabel, 80) : cur.cta_label,
        target_url: body.targetUrl !== undefined ? str(body.targetUrl, 600) : cur.target_url,
        profile_id: body.profileId !== undefined ? str(body.profileId, 80) : cur.profile_id,
        weight: body.weight !== undefined ? toInt(body.weight, cur.weight, 1, 1000) : cur.weight,
        status: body.status !== undefined && CREATIVE_STATUSES.has(body.status) ? body.status : cur.status,
      }
      await db.sql`
        UPDATE ad_creatives SET "placement" = ${next.placement}, "headline" = ${next.headline}, "body" = ${next.body},
          "image_url" = ${next.image_url}, "cta_label" = ${next.cta_label}, "target_url" = ${next.target_url},
          "profile_id" = ${next.profile_id}, "weight" = ${next.weight}, "status" = ${next.status},
          "updated_at" = ${new Date().toISOString()} WHERE "id" = ${cur.id}`
      await recordAudit(db, req, admin, { action: 'ad.creative.update', resourceType: 'ad_creative', resourceId: cur.id, details: { placement: next.placement, status: next.status } })
      return json({ ok: true, item: await getCampaign(db, cur.campaign_id) })
    }

    if (resource === 'invoice') {
      const cur = (await db.sql`SELECT * FROM ad_invoices WHERE id = ${targetId} LIMIT 1`)[0]
      if (!cur) return json({ error: 'Not found' }, 404)
      const status = body.status !== undefined && INVOICE_STATUSES.has(body.status) ? body.status : cur.status
      // Stamp paidAt the moment an invoice flips to paid (and clear it if reopened).
      const paidAt = status === 'paid' ? (cur.paid_at ? iso(cur.paid_at) : new Date().toISOString()) : null
      const next = {
        amount_cents: body.amount !== undefined ? toCents(body.amount) : cur.amount_cents,
        currency: body.currency !== undefined ? (str(body.currency, 8) || 'USD') : cur.currency,
        status,
        due_at: body.dueAt !== undefined ? toDate(body.dueAt) : cur.due_at,
        notes: body.notes !== undefined ? str(body.notes, 2000) : cur.notes,
      }
      await db.sql`
        UPDATE ad_invoices SET "amount_cents" = ${next.amount_cents}, "currency" = ${next.currency}, "status" = ${next.status},
          "due_at" = ${next.due_at}, "paid_at" = ${paidAt}, "notes" = ${next.notes}, "updated_at" = ${new Date().toISOString()} WHERE "id" = ${cur.id}`
      await recordAudit(db, req, admin, { action: 'ad.invoice.update', resourceType: 'ad_invoice', resourceId: cur.id, details: { number: cur.number, status: next.status, actorName: admin && admin.name } })
      return json({ ok: true, item: (await db.sql`SELECT * FROM ad_invoices WHERE "id" = ${cur.id} LIMIT 1`).map(normInvoice)[0] })
    }
    return json({ error: 'Unknown resource' }, 400)
  }

  // ── Delete ──
  if (req.method === 'DELETE') {
    if (!id) return json({ error: 'Missing id' }, 400)
    if (resource === 'campaign') {
      // Remove the campaign and everything derived from it. Delivery history is
      // cleared too so counts stay consistent with what still exists.
      await db.sql`DELETE FROM ad_events WHERE "campaign_id" = ${id}`
      await db.sql`DELETE FROM ad_creatives WHERE "campaign_id" = ${id}`
      await db.sql`DELETE FROM ad_invoices WHERE "campaign_id" = ${id}`
      await db.sql`DELETE FROM ad_campaigns WHERE "id" = ${id}`
      await recordAudit(db, req, admin, { action: 'ad.campaign.delete', resourceType: 'ad_campaign', resourceId: id, details: { actorName: admin && admin.name } })
      return json({ ok: true })
    }
    if (resource === 'creative') {
      const cur = (await db.sql`SELECT "campaign_id" FROM ad_creatives WHERE "id" = ${id} LIMIT 1`)[0]
      await db.sql`DELETE FROM ad_events WHERE "creative_id" = ${id}`
      await db.sql`DELETE FROM ad_creatives WHERE "id" = ${id}`
      await recordAudit(db, req, admin, { action: 'ad.creative.delete', resourceType: 'ad_creative', resourceId: id, details: {} })
      return json({ ok: true, item: cur ? await getCampaign(db, cur.campaign_id) : null })
    }
    if (resource === 'invoice') {
      await db.sql`DELETE FROM ad_invoices WHERE "id" = ${id}`
      await recordAudit(db, req, admin, { action: 'ad.invoice.delete', resourceType: 'ad_invoice', resourceId: id, details: {} })
      return json({ ok: true })
    }
    return json({ error: 'Unknown resource' }, 400)
  }

  return json({ error: 'Method Not Allowed' }, 405)
}
