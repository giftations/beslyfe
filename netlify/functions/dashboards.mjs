import { getDatabase } from '@netlify/database'
import { requireAdmin, json, logError } from './lib/session.mjs'

// ── Executive dashboards ──
//
// A read-only, admin-only reporting endpoint that answers the board-level
// questions the operating team keeps asking: are we making money, is the
// pipeline healthy, and is every revenue line pulling its weight? It computes
// eight executive dashboards *live* from data the platform already owns — it
// introduces no new tables and stores nothing itself, so it can never drift
// from the source of truth and is entirely additive/reversible.
//
//   Revenue              — realized + pipeline across every line, trended monthly
//   Applications         — intake funnel, approval rate, mix, monthly trend
//   Sponsor ROI          — per-advertiser spend vs. delivery on sponsor inventory
//   Vendor ROI           — per-advertiser spend vs. delivery on vendor inventory
//   Directory traffic    — listing inventory + directory/featured-vendor delivery
//   Email performance    — email-sponsorship sends, clicks and rate
//   Booth sales          — floor-plan occupancy and booth revenue
//   Advertising revenue  — impressions/clicks/CTR, revenue by status, monthly
//
// Money is integer cents throughout, mirroring ads.mjs, so nothing rounds
// adrift. Every query is defensive: a missing table or empty dataset yields
// zeros, never a 500, so the dashboard degrades gracefully on a fresh install.

// Placement taxonomy. Sponsor inventory is brand/awareness; vendor inventory is
// lead-generation for exhibitors. These drive both the ROI split and the
// directory/email breakdowns, and match the placements ads.mjs can serve.
const SPONSOR_PLACEMENTS = new Set(['homepage_banner', 'email_sponsor', 'sidebar'])
const VENDOR_PLACEMENTS = new Set(['featured_vendor', 'directory'])
const DIRECTORY_PLACEMENTS = new Set(['directory', 'featured_vendor'])

// Best-effort query: still degrades to [] so one empty/absent table never takes
// down the whole dashboard, but a genuine query *failure* is now logged (with a
// label) rather than silently swallowed — so "no data" and "the query errored"
// are distinguishable in the logs for operational visibility. `label` names the
// dataset so a failing query can be pinpointed.
async function q(db, run, label = 'query') {
  try {
    return await run()
  } catch (error) {
    logError('dashboards', `dashboard ${label} failed`, error)
    return []
  }
}

function ctr(impressions, clicks) {
  return impressions ? Math.round((clicks / impressions) * 1000) / 10 : 0
}

// Parse a free-text booth price ("$1,200", "1200", "1,200.00") to integer cents.
// Booth prices are stored as strings in the floor-plan JSON, so this tolerates
// currency symbols, thousands separators and stray text.
function priceToCents(value) {
  if (value === null || value === undefined) return 0
  const cleaned = String(value).replace(/[^0-9.]/g, '')
  if (!cleaned) return 0
  const n = Number(cleaned)
  return isFinite(n) && n > 0 ? Math.round(n * 100) : 0
}

// ── Advertising: the delivery + billing core several dashboards build on. ──
async function loadAdCore(db) {
  const [campaigns, creatives, delivery, invoices] = await Promise.all([
    q(db, () => db.sql`
      SELECT c.id, c.company_id, c.status, co.name AS company_name
      FROM ad_campaigns c LEFT JOIN crm_companies co ON co.id = c.company_id`, 'ad campaigns'),
    // DISTINCT collapses the per-creative rows to the set of campaign×placement
    // pairs the ROI/email rollups actually consume, so a campaign with hundreds
    // of creatives contributes a handful of rows instead of an unbounded read.
    q(db, () => db.sql`SELECT DISTINCT "campaign_id", "placement" FROM ad_creatives`, 'ad creatives'),
    q(db, () => db.sql`SELECT "campaign_id", "placement", "kind", COUNT(*)::int AS n FROM ad_events GROUP BY "campaign_id", "placement", "kind"`, 'ad delivery'),
    q(db, () => db.sql`SELECT "campaign_id", "status", COALESCE(SUM("amount_cents"),0)::int AS cents, COUNT(*)::int AS n FROM ad_invoices GROUP BY "campaign_id", "status"`, 'ad invoices'),
  ])
  return { campaigns, creatives, delivery, invoices }
}

// Roll the ad core up into per-company ROI rows, split into a sponsor line and a
// vendor line. A campaign is a sponsor-line buy if any of its creatives sit in
// sponsor inventory, otherwise a vendor-line buy; its paid spend and delivery
// are attributed to that line, and rolled up per advertiser.
function buildRoi({ campaigns, creatives, delivery, invoices }) {
  const lineByCampaign = {}
  const placementsByCampaign = {}
  for (const cr of creatives) {
    (placementsByCampaign[cr.campaign_id] = placementsByCampaign[cr.campaign_id] || []).push(cr.placement)
  }
  for (const c of campaigns) {
    const pls = placementsByCampaign[c.id] || []
    lineByCampaign[c.id] = pls.some((p) => SPONSOR_PLACEMENTS.has(p)) ? 'sponsor'
      : pls.some((p) => VENDOR_PLACEMENTS.has(p)) ? 'vendor' : 'sponsor'
  }
  const delivByCampaign = {}
  for (const d of delivery) {
    const row = delivByCampaign[d.campaign_id] || (delivByCampaign[d.campaign_id] = { impressions: 0, clicks: 0 })
    if (d.kind === 'impression') row.impressions += d.n
    else if (d.kind === 'click') row.clicks += d.n
  }
  const paidByCampaign = {}
  for (const iv of invoices) if (iv.status === 'paid') paidByCampaign[iv.campaign_id] = (paidByCampaign[iv.campaign_id] || 0) + iv.cents

  const lines = { sponsor: {}, vendor: {} }
  for (const c of campaigns) {
    const line = lineByCampaign[c.id]
    const key = c.company_id || '(none)'
    const bucket = lines[line]
    const row = bucket[key] || (bucket[key] = { companyId: c.company_id || '', companyName: c.company_name || '(unassigned advertiser)', campaigns: 0, spendCents: 0, impressions: 0, clicks: 0 })
    row.campaigns += 1
    row.spendCents += paidByCampaign[c.id] || 0
    const del = delivByCampaign[c.id] || { impressions: 0, clicks: 0 }
    row.impressions += del.impressions
    row.clicks += del.clicks
  }

  function shape(bucket) {
    const rows = Object.values(bucket).map((r) => ({
      ...r,
      ctr: ctr(r.impressions, r.clicks),
      cpcCents: r.clicks ? Math.round(r.spendCents / r.clicks) : 0,
      cpmCents: r.impressions ? Math.round((r.spendCents / r.impressions) * 1000) : 0,
    })).sort((a, b) => b.spendCents - a.spendCents || b.impressions - a.impressions)
    const totals = rows.reduce((t, r) => {
      t.advertisers += 1; t.spendCents += r.spendCents; t.impressions += r.impressions; t.clicks += r.clicks; return t
    }, { advertisers: 0, spendCents: 0, impressions: 0, clicks: 0 })
    totals.ctr = ctr(totals.impressions, totals.clicks)
    totals.cpcCents = totals.clicks ? Math.round(totals.spendCents / totals.clicks) : 0
    return { totals, advertisers: rows.slice(0, 25) }
  }
  return { sponsor: shape(lines.sponsor), vendor: shape(lines.vendor) }
}

// ── Applications ──
async function buildApplications(db) {
  const [byStatus, byType, byMonth] = await Promise.all([
    q(db, () => db.sql`SELECT "status", COUNT(*)::int AS n FROM applications GROUP BY "status"`),
    q(db, () => db.sql`SELECT "type", COUNT(*)::int AS n FROM applications GROUP BY "type"`),
    q(db, () => db.sql`SELECT to_char(date_trunc('month', "created_at"), 'YYYY-MM') AS month, COUNT(*)::int AS n FROM applications GROUP BY 1 ORDER BY 1`),
  ])
  const status = {}; let total = 0
  for (const r of byStatus) { status[r.status] = r.n; total += r.n }
  const type = {}; for (const r of byType) type[r.type] = r.n
  const won = (status.approved || 0) + (status.paid || 0)
  return {
    total,
    byStatus: status,
    byType: type,
    won,
    pending: status.pending || 0,
    approvalRate: total ? Math.round((won / total) * 1000) / 10 : 0,
    paidRate: won ? Math.round(((status.paid || 0) / won) * 1000) / 10 : 0,
    trend: byMonth.map((r) => ({ month: r.month, count: r.n })).slice(-12),
  }
}

// ── Advertising revenue + delivery ──
async function buildAdvertising(db, core) {
  const [invByStatus, byPlacement, byMonth, top] = await Promise.all([
    q(db, () => db.sql`SELECT "status", COALESCE(SUM("amount_cents"),0)::int AS cents, COUNT(*)::int AS n FROM ad_invoices GROUP BY "status"`),
    q(db, () => db.sql`SELECT "placement", "kind", COUNT(*)::int AS n FROM ad_events GROUP BY "placement", "kind"`),
    q(db, () => db.sql`SELECT to_char(date_trunc('month', "paid_at"), 'YYYY-MM') AS month, COALESCE(SUM("amount_cents"),0)::int AS cents FROM ad_invoices WHERE "status" = 'paid' AND "paid_at" IS NOT NULL GROUP BY 1 ORDER BY 1`),
    q(db, () => db.sql`
      SELECT c.id, c.name, co.name AS company_name,
        COUNT(*) FILTER (WHERE e.kind = 'impression')::int AS impressions,
        COUNT(*) FILTER (WHERE e.kind = 'click')::int AS clicks
      FROM ad_campaigns c
      LEFT JOIN crm_companies co ON co.id = c.company_id
      LEFT JOIN ad_events e ON e.campaign_id = c.id
      GROUP BY c.id, c.name, co.name ORDER BY impressions DESC NULLS LAST LIMIT 8`),
  ])
  const invoices = {}; let paidCents = 0, outstandingCents = 0, draftCents = 0
  for (const r of invByStatus) {
    invoices[r.status] = { cents: r.cents, count: r.n }
    if (r.status === 'paid') paidCents += r.cents
    if (r.status === 'sent') outstandingCents += r.cents
    if (r.status === 'draft') draftCents += r.cents
  }
  const placements = {}; let impressions = 0, clicks = 0
  for (const r of byPlacement) {
    const p = placements[r.placement] || (placements[r.placement] = { impressions: 0, clicks: 0 })
    if (r.kind === 'impression') { p.impressions = r.n; impressions += r.n }
    else if (r.kind === 'click') { p.clicks = r.n; clicks += r.n }
  }
  for (const k of Object.keys(placements)) placements[k].ctr = ctr(placements[k].impressions, placements[k].clicks)
  const activeCampaigns = core.campaigns.filter((c) => c.status === 'active').length
  return {
    paidCents, outstandingCents, draftCents,
    invoicesByStatus: invoices,
    impressions, clicks, ctr: ctr(impressions, clicks),
    placements,
    activeCampaigns,
    totalCampaigns: core.campaigns.length,
    monthly: byMonth.map((r) => ({ month: r.month, cents: r.cents })).slice(-12),
    topCampaigns: top.map((r) => ({
      id: r.id, name: r.name || '(untitled)', companyName: r.company_name || '',
      impressions: r.impressions || 0, clicks: r.clicks || 0, ctr: ctr(r.impressions, r.clicks),
    })),
  }
}

// ── Booth sales (from the published floor plan) ──
async function buildBooth(db) {
  const rows = await q(db, () => db.sql`SELECT "data" FROM floorplan WHERE "key" = 'published' LIMIT 1`)
  const layout = rows[0] && rows[0].data
  const booths = (layout && Array.isArray(layout.booths)) ? layout.booths : []
  // Only sellable inventory counts toward occupancy — structural cells (stage,
  // entrance, restroom, lounge) are excluded from the denominator.
  const sellableUses = new Set(['vendor', 'food', 'sponsor', 'other'])
  const byStatus = { available: 0, reserved: 0, sold: 0 }
  const byUse = {}
  let soldCents = 0, reservedCents = 0, sellable = 0
  for (const b of booths) {
    const status = b.status || 'available'
    if (byStatus[status] === undefined) byStatus[status] = 0
    byStatus[status] += 1
    const use = b.use || 'vendor'
    byUse[use] = (byUse[use] || 0) + 1
    if (sellableUses.has(use)) sellable += 1
    const cents = priceToCents(b.price)
    if (status === 'sold') soldCents += cents
    else if (status === 'reserved') reservedCents += cents
  }
  const occupied = (byStatus.sold || 0) + (byStatus.reserved || 0)
  return {
    totalBooths: booths.length,
    sellable,
    byStatus,
    byUse,
    soldCents,
    reservedCents,
    occupancyRate: sellable ? Math.round((occupied / sellable) * 1000) / 10 : 0,
    sellThroughRate: sellable ? Math.round(((byStatus.sold || 0) / sellable) * 1000) / 10 : 0,
    hasPlan: booths.length > 0,
  }
}

// ── Directory traffic ──
async function buildDirectory(db, core) {
  const [byRole, statusRows] = await Promise.all([
    q(db, () => db.sql`SELECT "role", COUNT(*)::int AS n FROM profiles GROUP BY "role"`),
    q(db, () => db.sql`SELECT "status", COUNT(*)::int AS n FROM profiles GROUP BY "status"`),
  ])
  const roles = {}; let listings = 0
  for (const r of byRole) { roles[r.role || 'other'] = r.n; listings += r.n }
  const status = {}; for (const r of statusRows) status[r.status || 'unknown'] = r.n
  // Delivery on the directory-facing placements, from the impression/click log.
  let impressions = 0, clicks = 0
  for (const d of core.delivery) {
    if (!DIRECTORY_PLACEMENTS.has(d.placement)) continue
    if (d.kind === 'impression') impressions += d.n
    else if (d.kind === 'click') clicks += d.n
  }
  return {
    listings,
    byRole: roles,
    approved: status.approved || 0,
    impressions, clicks, ctr: ctr(impressions, clicks),
  }
}

// ── Email performance (email-sponsorship inventory) ──
function buildEmail(core) {
  let sends = 0, clicks = 0
  for (const d of core.delivery) {
    if (d.placement !== 'email_sponsor') continue
    if (d.kind === 'impression') sends += d.n
    else if (d.kind === 'click') clicks += d.n
  }
  const emailCampaignIds = new Set()
  for (const cr of core.creatives) if (cr.placement === 'email_sponsor') emailCampaignIds.add(cr.campaign_id)
  const activeSponsorships = core.campaigns.filter((c) => emailCampaignIds.has(c.id) && c.status === 'active').length
  return {
    sends, clicks, ctr: ctr(sends, clicks),
    sponsorships: emailCampaignIds.size,
    activeSponsorships,
  }
}

// ── Ticketing (sales ingested from external ticketing companies) ──
// Realized revenue is the net of completed orders; pending orders are pipeline;
// refunds are reported but excluded from realized. A monthly net-revenue series
// feeds the executive revenue trend alongside advertising.
async function buildTickets(db) {
  const [totalsRows, byTier, byStatusRows, byMonth, byProvider] = await Promise.all([
    q(db, () => db.sql`SELECT
        COALESCE(SUM("quantity") FILTER (WHERE "status" = 'completed'),0)::int AS tickets,
        COALESCE(SUM("gross_cents") FILTER (WHERE "status" = 'completed'),0)::int AS gross_cents,
        COALESCE(SUM("net_cents") FILTER (WHERE "status" = 'completed'),0)::int AS net_cents,
        COALESCE(SUM("net_cents") FILTER (WHERE "status" = 'pending'),0)::int AS pending_cents,
        COALESCE(SUM("net_cents") FILTER (WHERE "status" = 'refunded'),0)::int AS refunded_cents,
        COUNT(*)::int AS orders
      FROM ticket_orders`, 'ticket totals'),
    q(db, () => db.sql`SELECT "tier_name" AS tier, COALESCE(SUM("quantity"),0)::int AS n
      FROM ticket_orders WHERE "status" = 'completed' GROUP BY "tier_name" ORDER BY n DESC LIMIT 12`, 'ticket tiers'),
    q(db, () => db.sql`SELECT "status", COUNT(*)::int AS n FROM ticket_orders GROUP BY "status"`, 'ticket status'),
    q(db, () => db.sql`SELECT to_char(date_trunc('month', COALESCE("purchased_at", "created_at")), 'YYYY-MM') AS month,
        COALESCE(SUM("net_cents") FILTER (WHERE "status" = 'completed'),0)::int AS cents
      FROM ticket_orders GROUP BY 1 ORDER BY 1`, 'ticket monthly'),
    q(db, () => db.sql`SELECT "provider", COALESCE(SUM("quantity") FILTER (WHERE "status" = 'completed'),0)::int AS n
      FROM ticket_orders GROUP BY "provider" ORDER BY n DESC LIMIT 12`, 'ticket providers'),
  ])
  const t = totalsRows[0] || {}
  const byStatus = {}; for (const r of byStatusRows) byStatus[r.status] = r.n
  const tiers = {}; for (const r of byTier) tiers[r.tier || 'General'] = r.n
  const providers = {}; for (const r of byProvider) providers[r.provider || 'generic'] = r.n
  return {
    tickets: t.tickets || 0,
    orders: t.orders || 0,
    grossCents: t.gross_cents || 0,
    realizedCents: t.net_cents || 0,
    pendingCents: t.pending_cents || 0,
    refundedCents: t.refunded_cents || 0,
    byStatus,
    byTier: tiers,
    byProvider: providers,
    monthly: byMonth.map((r) => ({ month: r.month, cents: r.cents })).slice(-12),
    hasSales: (t.orders || 0) > 0,
  }
}

// Merge two [{month,cents}] series into one sorted, summed series (last 12).
function mergeMonthly(a, b) {
  const m = {}
  for (const p of a || []) m[p.month] = (m[p.month] || 0) + (p.cents || 0)
  for (const p of b || []) m[p.month] = (m[p.month] || 0) + (p.cents || 0)
  return Object.keys(m).sort().map((month) => ({ month, cents: m[month] })).slice(-12)
}

// ── Revenue (the executive top line) ──
// Combines every realized/pipeline money line the platform can measure today:
// paid advertising invoices, sold booths and completed ticket sales are
// realized; sent invoices, reserved booths and pending orders are pipeline.
function buildRevenue(advertising, booth, tickets) {
  const realizedCents = advertising.paidCents + booth.soldCents + tickets.realizedCents
  const pipelineCents = advertising.outstandingCents + booth.reservedCents + tickets.pendingCents
  const lines = [
    { key: 'tickets', label: 'Ticket sales', realizedCents: tickets.realizedCents, pipelineCents: tickets.pendingCents },
    { key: 'advertising', label: 'Advertising', realizedCents: advertising.paidCents, pipelineCents: advertising.outstandingCents },
    { key: 'booths', label: 'Booth sales', realizedCents: booth.soldCents, pipelineCents: booth.reservedCents },
  ]
  return {
    realizedCents,
    pipelineCents,
    totalPotentialCents: realizedCents + pipelineCents,
    lines,
    monthly: mergeMonthly(advertising.monthly, tickets.monthly),
  }
}

export default async (req) => {
  if (req.method !== 'GET') return json({ error: 'Method Not Allowed' }, 405)
  const db = getDatabase()
  const admin = await requireAdmin(req, db)
  if (admin instanceof Response) return admin

  const core = await loadAdCore(db)
  const [applications, advertising, booth, directory, tickets] = await Promise.all([
    buildApplications(db),
    buildAdvertising(db, core),
    buildBooth(db),
    buildDirectory(db, core),
    buildTickets(db),
  ])
  const email = buildEmail(core)
  const roi = buildRoi(core)
  const revenue = buildRevenue(advertising, booth, tickets)

  return json({
    dashboards: {
      revenue,
      tickets,
      applications,
      sponsorRoi: roi.sponsor,
      vendorRoi: roi.vendor,
      directory,
      email,
      booth,
      advertising,
    },
    generatedAt: new Date().toISOString(),
  })
}
