import { getDatabase } from '@netlify/database'
import {
  requireAdmin, requireSameOrigin, recordAudit, json, str, iso, newId,
  toDate, logError, logWarn, timingSafeEqualHex,
} from './lib/session.mjs'
import { createCrmActivityForContact } from './crm.mjs'

// ── Ticketing ingestion & reporting ──
//
// The bridge between external ticketing companies (Eventbrite, AXS, Ticketmaster,
// DICE, Universe, …) and the rest of the platform. It does three jobs:
//
//   1. Ingest — a public, token-authenticated webhook (POST) that any ticketing
//      company, relay (Zapier/Make) or CSV export can post orders to. Orders are
//      normalized to one canonical shape and upserted idempotently, so retries
//      and re-sent daily digests never double-count. This is what makes ticket
//      sales "of all kinds" flow into the dashboards, revenue, analytics and
//      finance automatically.
//   2. Configure — admins (PUT/DELETE, session + same-origin) create providers,
//      rotate/reveal their ingest token exactly once, import a batch of orders by
//      hand, and disable an integration.
//   3. Report — admins (GET) read providers and orders and a rolled-up summary
//      the admin UI and executive dashboards render.
//
// Security: the ingest token is a high-entropy secret. Only its SHA-256 hash is
// stored (never the token), so a database read can't recover a live token; the
// plaintext is returned exactly once, when it is minted. The webhook finds its
// provider purely by hashing the presented token and matching the stored hash
// with a constant-time compare, so a wrong token reveals nothing.

const PROVIDERS = new Set(['eventbrite', 'axs', 'ticketmaster', 'dice', 'universe', 'seetickets', 'generic'])
const STATUSES = new Set(['completed', 'pending', 'refunded', 'canceled'])
const LIMIT = 2000
// A single delivery may carry many orders (a daily digest), but is bounded so a
// runaway or hostile payload can't exhaust the function.
const MAX_ORDERS_PER_DELIVERY = 5000

// ── Money ──
// Accept money as integer cents (…Cents) or as a decimal amount in the major
// unit (dollars). Everything is stored as integer cents so sums never drift.
export function toCents(centsValue, amountValue) {
  if (centsValue !== undefined && centsValue !== null && centsValue !== '') {
    const n = Number(centsValue)
    return Number.isFinite(n) ? Math.round(n) : 0
  }
  if (amountValue === undefined || amountValue === null || amountValue === '') return 0
  const cleaned = String(amountValue).replace(/[^0-9.\-]/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

// ── Token ──
async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(String(text))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
// A URL-safe, high-entropy token (two UUIDs, dashes stripped → 64 hex chars).
function mintToken() {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '')
}

async function activeEventId(db) {
  try {
    const rows = await db.sql`SELECT "id" FROM events WHERE "is_active" = true ORDER BY "created_at" ASC LIMIT 1`
    if (rows.length) return rows[0].id
    const any = await db.sql`SELECT "id" FROM events ORDER BY "created_at" ASC LIMIT 1`
    return any.length ? any[0].id : ''
  } catch {
    return ''
  }
}

// ── Normalization ──
// Map one incoming order — from our documented contract *or* the common field
// names ticketing companies use — to the canonical column set. Tolerant of
// missing pieces: an order with only an id and a quantity still ingests.
function firstDefined(...vals) {
  for (const v of vals) if (v !== undefined && v !== null && v !== '') return v
  return undefined
}
export function normalizeOrder(raw) {
  const o = raw && typeof raw === 'object' ? raw : {}
  const costs = (o.costs && typeof o.costs === 'object') ? o.costs : {}
  const externalOrderId = str(firstDefined(o.orderId, o.order_id, o.id, o.reference, o.transactionId, o.transaction_id) || '', 200).trim()
  const status = String(firstDefined(o.status, o.state, 'completed')).toLowerCase()
  const qtyRaw = firstDefined(o.quantity, o.qty, o.tickets, o.ticket_count, 1)
  const quantity = Math.max(0, Math.round(Number(qtyRaw) || 0))
  // Providers like Eventbrite report money under `costs.*.value` already in the
  // minor unit (cents), so those feed the cents path; the flat `gross`/`fees`
  // fields are decimal major-unit amounts and feed the amount path.
  const gross = toCents(firstDefined(o.grossCents, o.gross_cents, costs.gross && costs.gross.value), firstDefined(o.gross, o.total, o.amount))
  const fees = toCents(firstDefined(o.feesCents, o.fees_cents, costs.eventbrite_fee && costs.eventbrite_fee.value), firstDefined(o.fees, o.fee))
  let net = toCents(firstDefined(o.netCents, o.net_cents, costs.net && costs.net.value), firstDefined(o.net, o.payout))
  if (!net) net = Math.max(0, gross - fees)
  return {
    externalOrderId,
    buyerName: str(firstDefined(o.buyerName, o.buyer_name, o.name, o.customer, [o.first_name, o.last_name].filter(Boolean).join(' ')) || '', 200).trim(),
    buyerEmail: str(firstDefined(o.buyerEmail, o.buyer_email, o.email) || '', 200).trim().toLowerCase(),
    status: STATUSES.has(status) ? status : (status === 'complete' || status === 'paid' ? 'completed' : (status === 'refund' ? 'refunded' : 'completed')),
    tierName: str(firstDefined(o.tier, o.tierName, o.tier_name, o.ticketType, o.ticket_type, o.ticketClass, o.ticket_class_name, o.category) || 'General', 160).trim(),
    quantity,
    grossCents: gross,
    feesCents: fees,
    netCents: net,
    currency: str(firstDefined(o.currency, costs.gross && costs.gross.currency) || 'USD', 8).trim().toUpperCase(),
    purchasedAt: toDate(firstDefined(o.purchasedAt, o.purchased_at, o.created, o.created_at, o.date, o.timestamp)),
    raw: o,
  }
}

// Pull the list of orders out of whatever envelope the sender used: our
// { orders:[…] }, a bare array, an Eventbrite-ish { order:{…} }, or a single
// order object posted on its own.
export function extractOrders(body) {
  if (Array.isArray(body)) return body
  if (!body || typeof body !== 'object') return []
  if (Array.isArray(body.orders)) return body.orders
  if (Array.isArray(body.data)) return body.data
  if (body.order && typeof body.order === 'object') return [body.order]
  // A single normalized/vendor order posted at the top level.
  if (body.orderId || body.order_id || body.id || body.email || body.buyerEmail) return [body]
  return []
}

function normProvider(row, { includeSecret } = {}) {
  if (!row) return null
  const out = {
    id: row.id,
    eventId: row.event_id || '',
    provider: row.provider || 'generic',
    displayName: row.display_name || '',
    externalEventId: row.external_event_id || '',
    status: row.status || 'active',
    tokenHint: row.ingest_token_hint || '',
    lastSyncAt: iso(row.last_sync_at),
    ordersIngested: row.orders_ingested || 0,
    settings: row.settings || {},
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
  if (includeSecret && row._token) out.ingestToken = row._token
  return out
}
function normOrder(row) {
  if (!row) return null
  return {
    id: row.id,
    provider: row.provider || 'generic',
    providerId: row.provider_id || '',
    externalOrderId: row.external_order_id || '',
    buyerName: row.buyer_name || '',
    buyerEmail: row.buyer_email || '',
    status: row.status || 'completed',
    tierName: row.tier_name || '',
    quantity: row.quantity || 0,
    grossCents: row.gross_cents || 0,
    feesCents: row.fees_cents || 0,
    netCents: row.net_cents || 0,
    currency: row.currency || 'USD',
    purchasedAt: iso(row.purchased_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

// ── POST: public webhook ingest (token auth) ──
async function ingest(req, db) {
  const token = (req.headers.get('x-ingest-token') || new URL(req.url).searchParams.get('token') || '').trim()
  if (!token) return json({ error: 'Missing ingest token.' }, 401)

  let body
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const hash = await sha256Hex(token)
  let provider
  try {
    const rows = await db.sql`SELECT * FROM ticket_providers WHERE "ingest_token_hash" = ${hash} AND "status" = 'active' LIMIT 1`
    provider = rows[0]
  } catch (error) {
    logError('tickets', 'provider lookup failed', error)
    return json({ error: 'Ingestion is temporarily unavailable.' }, 503)
  }
  // Constant-time re-check so a lookup that ever matched loosely still fails safe.
  if (!provider || !timingSafeEqualHex(provider.ingest_token_hash, hash)) {
    return json({ error: 'Invalid or disabled ingest token.' }, 401)
  }

  const orders = extractOrders(body)
  if (!orders.length) {
    return json({ error: 'No orders found. Send { "orders": [ … ] } or a single order object.' }, 400)
  }
  if (orders.length > MAX_ORDERS_PER_DELIVERY) {
    return json({ error: `Too many orders in one delivery (max ${MAX_ORDERS_PER_DELIVERY}). Send in batches.` }, 413)
  }

  const eventId = provider.event_id || (await activeEventId(db))
  let ingested = 0, updated = 0, skipped = 0
  let crmActivities = 0
  const now = new Date().toISOString()
  for (const rawOrder of orders) {
    const o = normalizeOrder(rawOrder)
    const dedupKey = o.externalOrderId ? `${provider.provider}:${o.externalOrderId}` : ''
    const id = newId('tkt_')
    const key = dedupKey || `${provider.provider}:${id}`
    try {
      const res = await db.sql`
        INSERT INTO ticket_orders (
          "id", "event_id", "provider_id", "provider", "external_order_id", "dedup_key",
          "buyer_name", "buyer_email", "status", "tier_name", "quantity",
          "gross_cents", "fees_cents", "net_cents", "currency", "purchased_at", "raw",
          "created_at", "updated_at"
        ) VALUES (
          ${id}, ${eventId}, ${provider.id}, ${provider.provider}, ${o.externalOrderId}, ${key},
          ${o.buyerName}, ${o.buyerEmail}, ${o.status}, ${o.tierName}, ${o.quantity},
          ${o.grossCents}, ${o.feesCents}, ${o.netCents}, ${o.currency}, ${o.purchasedAt}, ${JSON.stringify(o.raw)}::jsonb,
          ${now}, ${now}
        )
        ON CONFLICT ("dedup_key") DO UPDATE SET
          "buyer_name" = EXCLUDED."buyer_name",
          "buyer_email" = EXCLUDED."buyer_email",
          "status" = EXCLUDED."status",
          "tier_name" = EXCLUDED."tier_name",
          "quantity" = EXCLUDED."quantity",
          "gross_cents" = EXCLUDED."gross_cents",
          "fees_cents" = EXCLUDED."fees_cents",
          "net_cents" = EXCLUDED."net_cents",
          "currency" = EXCLUDED."currency",
          "purchased_at" = EXCLUDED."purchased_at",
          "raw" = EXCLUDED."raw",
          "updated_at" = ${now}
        RETURNING (xmax = 0) AS inserted
      `
      if (res[0] && res[0].inserted) ingested += 1
      else updated += 1
      if (crmActivities < 25) {
        const activity = await createCrmActivityForContact(db, {
          email: o.buyerEmail,
          eventId,
          kind: 'payment',
          title: 'Ticket order imported',
          body: `${o.tierName || 'Ticket'} x${o.quantity || 0}`,
          details: { provider: provider.provider, externalOrderId: o.externalOrderId, status: o.status, grossCents: o.grossCents },
        })
        if (activity.created) crmActivities += 1
      }
    } catch (error) {
      skipped += 1
      logWarn('tickets', 'order ingest failed', { provider: provider.id, error: error && error.message })
    }
  }

  try {
    await db.sql`
      UPDATE ticket_providers
      SET "orders_ingested" = "orders_ingested" + ${ingested}, "last_sync_at" = ${now}, "updated_at" = ${now}
      WHERE "id" = ${provider.id}
    `
  } catch { /* health counters are best-effort */ }

  return json({ ok: true, received: orders.length, ingested, updated, skipped })
}

// ── GET: admin reads ──
async function read(req, db) {
  const url = new URL(req.url)
  if (url.searchParams.get('providers') === '1') {
    const rows = await db.sql`SELECT * FROM ticket_providers ORDER BY "created_at" DESC LIMIT 200`
    return json({ items: rows.map((r) => normProvider(r)) })
  }
  if (url.searchParams.get('orders') === '1') {
    const status = url.searchParams.get('status') || ''
    const providerId = url.searchParams.get('providerId') || ''
    let rows
    if (status && providerId) rows = await db.sql`SELECT * FROM ticket_orders WHERE "status" = ${status} AND "provider_id" = ${providerId} ORDER BY "purchased_at" DESC NULLS LAST, "created_at" DESC LIMIT ${LIMIT}`
    else if (status) rows = await db.sql`SELECT * FROM ticket_orders WHERE "status" = ${status} ORDER BY "purchased_at" DESC NULLS LAST, "created_at" DESC LIMIT ${LIMIT}`
    else if (providerId) rows = await db.sql`SELECT * FROM ticket_orders WHERE "provider_id" = ${providerId} ORDER BY "purchased_at" DESC NULLS LAST, "created_at" DESC LIMIT ${LIMIT}`
    else rows = await db.sql`SELECT * FROM ticket_orders ORDER BY "purchased_at" DESC NULLS LAST, "created_at" DESC LIMIT ${LIMIT}`
    return json({ items: rows.map(normOrder) })
  }
  // Default: rolled-up summary the admin dashboard renders.
  return json(await summarize(db))
}

// A live summary: headline totals, breakdowns by tier/provider/status and a
// 30-day daily sales trend. Every aggregate treats refunded/canceled orders as
// non-revenue so the numbers match finance. Exported for the dashboards fn too.
export async function summarize(db) {
  const empty = { totals: {}, byTier: [], byProvider: [], byStatus: {}, daily: [], recent: [], providerCount: 0 }
  try {
    const [totalsRows, tierRows, providerRows, statusRows, dailyRows, recentRows, provCount] = await Promise.all([
      db.sql`SELECT
          COUNT(*)::int AS orders,
          COALESCE(SUM("quantity") FILTER (WHERE "status" = 'completed'),0)::int AS tickets,
          COALESCE(SUM("gross_cents") FILTER (WHERE "status" = 'completed'),0)::int AS gross_cents,
          COALESCE(SUM("fees_cents") FILTER (WHERE "status" = 'completed'),0)::int AS fees_cents,
          COALESCE(SUM("net_cents") FILTER (WHERE "status" = 'completed'),0)::int AS net_cents,
          COALESCE(SUM("net_cents") FILTER (WHERE "status" = 'refunded'),0)::int AS refunded_cents,
          COUNT(*) FILTER (WHERE "status" = 'refunded')::int AS refunded_orders
        FROM ticket_orders`,
      db.sql`SELECT "tier_name" AS tier,
          COALESCE(SUM("quantity"),0)::int AS tickets,
          COALESCE(SUM("net_cents"),0)::int AS net_cents
        FROM ticket_orders WHERE "status" = 'completed' GROUP BY "tier_name" ORDER BY tickets DESC LIMIT 25`,
      db.sql`SELECT "provider",
          COALESCE(SUM("quantity") FILTER (WHERE "status" = 'completed'),0)::int AS tickets,
          COALESCE(SUM("net_cents") FILTER (WHERE "status" = 'completed'),0)::int AS net_cents,
          COUNT(*)::int AS orders
        FROM ticket_orders GROUP BY "provider" ORDER BY tickets DESC LIMIT 25`,
      db.sql`SELECT "status", COUNT(*)::int AS n FROM ticket_orders GROUP BY "status"`,
      db.sql`SELECT to_char(date_trunc('day', COALESCE("purchased_at", "created_at")), 'YYYY-MM-DD') AS day,
          COALESCE(SUM("quantity") FILTER (WHERE "status" = 'completed'),0)::int AS tickets,
          COALESCE(SUM("net_cents") FILTER (WHERE "status" = 'completed'),0)::int AS net_cents
        FROM ticket_orders
        WHERE COALESCE("purchased_at", "created_at") >= now() - interval '30 days'
        GROUP BY 1 ORDER BY 1`,
      db.sql`SELECT * FROM ticket_orders ORDER BY "purchased_at" DESC NULLS LAST, "created_at" DESC LIMIT 15`,
      db.sql`SELECT COUNT(*)::int AS n FROM ticket_providers`,
    ])
    const t = totalsRows[0] || {}
    const byStatus = {}; for (const r of statusRows) byStatus[r.status] = r.n
    return {
      totals: {
        orders: t.orders || 0,
        tickets: t.tickets || 0,
        grossCents: t.gross_cents || 0,
        feesCents: t.fees_cents || 0,
        netCents: t.net_cents || 0,
        refundedCents: t.refunded_cents || 0,
        refundedOrders: t.refunded_orders || 0,
      },
      byTier: tierRows.map((r) => ({ tier: r.tier || 'General', tickets: r.tickets, netCents: r.net_cents })),
      byProvider: providerRows.map((r) => ({ provider: r.provider, tickets: r.tickets, netCents: r.net_cents, orders: r.orders })),
      byStatus,
      daily: dailyRows.map((r) => ({ day: r.day, tickets: r.tickets, cents: r.net_cents })),
      recent: recentRows.map(normOrder),
      providerCount: (provCount[0] && provCount[0].n) || 0,
    }
  } catch (error) {
    logError('tickets', 'summary failed', error)
    return empty
  }
}

// ── PUT: admin provider management + manual import ──
async function adminWrite(req, db, admin) {
  let body
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  const action = String((body && body.action) || '').trim()

  if (action === 'createProvider') {
    const provider = String(body.provider || 'generic').toLowerCase()
    if (!PROVIDERS.has(provider)) return json({ error: 'Unknown provider.' }, 400)
    const token = mintToken()
    const hash = await sha256Hex(token)
    const id = newId('tprov_')
    const now = new Date().toISOString()
    const eventId = await activeEventId(db)
    const rows = await db.sql`
      INSERT INTO ticket_providers (
        "id", "event_id", "provider", "display_name", "external_event_id", "status",
        "ingest_token_hash", "ingest_token_hint", "settings", "created_at", "updated_at"
      ) VALUES (
        ${id}, ${eventId}, ${provider}, ${str(body.displayName, 160)}, ${str(body.externalEventId, 200)}, 'active',
        ${hash}, ${token.slice(-4)}, '{}'::jsonb, ${now}, ${now}
      ) RETURNING *
    `
    await recordAudit(db, req, admin, { action: 'ticket_provider.create', resourceType: 'ticket_provider', resourceId: id, details: { provider, actorName: body.actor || '' } })
    const out = normProvider({ ...rows[0], _token: token }, { includeSecret: true })
    return json({ item: out }, 201)
  }

  if (action === 'rotateToken') {
    const id = str(body.id, 80)
    if (!id) return json({ error: 'Provider id required.' }, 400)
    const token = mintToken()
    const hash = await sha256Hex(token)
    const rows = await db.sql`
      UPDATE ticket_providers SET "ingest_token_hash" = ${hash}, "ingest_token_hint" = ${token.slice(-4)}, "updated_at" = ${new Date().toISOString()}
      WHERE "id" = ${id} RETURNING *
    `
    if (!rows.length) return json({ error: 'Provider not found.' }, 404)
    await recordAudit(db, req, admin, { action: 'ticket_provider.rotate_token', resourceType: 'ticket_provider', resourceId: id, details: { actorName: body.actor || '' } })
    return json({ item: normProvider({ ...rows[0], _token: token }, { includeSecret: true }) })
  }

  if (action === 'updateProvider') {
    const id = str(body.id, 80)
    if (!id) return json({ error: 'Provider id required.' }, 400)
    const status = body.status && ['active', 'disabled'].includes(String(body.status)) ? String(body.status) : null
    const rows = await db.sql`
      UPDATE ticket_providers SET
        "display_name" = COALESCE(${body.displayName !== undefined ? str(body.displayName, 160) : null}, "display_name"),
        "external_event_id" = COALESCE(${body.externalEventId !== undefined ? str(body.externalEventId, 200) : null}, "external_event_id"),
        "status" = COALESCE(${status}, "status"),
        "updated_at" = ${new Date().toISOString()}
      WHERE "id" = ${id} RETURNING *
    `
    if (!rows.length) return json({ error: 'Provider not found.' }, 404)
    await recordAudit(db, req, admin, { action: 'ticket_provider.update', resourceType: 'ticket_provider', resourceId: id, details: { status, actorName: body.actor || '' } })
    return json({ item: normProvider(rows[0]) })
  }

  if (action === 'importOrders') {
    const providerId = str(body.providerId, 80)
    if (!providerId) return json({ error: 'Provider id required.' }, 400)
    const provRows = await db.sql`SELECT * FROM ticket_providers WHERE "id" = ${providerId} LIMIT 1`
    const provider = provRows[0]
    if (!provider) return json({ error: 'Provider not found.' }, 404)
    const orders = extractOrders(body.orders ? { orders: body.orders } : body)
    if (!orders.length) return json({ error: 'No orders to import.' }, 400)
    if (orders.length > MAX_ORDERS_PER_DELIVERY) return json({ error: `Too many orders (max ${MAX_ORDERS_PER_DELIVERY}).` }, 413)
    const eventId = provider.event_id || (await activeEventId(db))
    let ingested = 0, updated = 0, skipped = 0
    let crmActivities = 0
    const now = new Date().toISOString()
    for (const rawOrder of orders) {
      const o = normalizeOrder(rawOrder)
      const id = newId('tkt_')
      const key = o.externalOrderId ? `${provider.provider}:${o.externalOrderId}` : `${provider.provider}:${id}`
      try {
        const res = await db.sql`
          INSERT INTO ticket_orders (
            "id", "event_id", "provider_id", "provider", "external_order_id", "dedup_key",
            "buyer_name", "buyer_email", "status", "tier_name", "quantity",
            "gross_cents", "fees_cents", "net_cents", "currency", "purchased_at", "raw",
            "created_at", "updated_at"
          ) VALUES (
            ${id}, ${eventId}, ${provider.id}, ${provider.provider}, ${o.externalOrderId}, ${key},
            ${o.buyerName}, ${o.buyerEmail}, ${o.status}, ${o.tierName}, ${o.quantity},
            ${o.grossCents}, ${o.feesCents}, ${o.netCents}, ${o.currency}, ${o.purchasedAt}, ${JSON.stringify(o.raw)}::jsonb,
            ${now}, ${now}
          )
          ON CONFLICT ("dedup_key") DO UPDATE SET
            "buyer_name" = EXCLUDED."buyer_name", "buyer_email" = EXCLUDED."buyer_email",
            "status" = EXCLUDED."status", "tier_name" = EXCLUDED."tier_name", "quantity" = EXCLUDED."quantity",
            "gross_cents" = EXCLUDED."gross_cents", "fees_cents" = EXCLUDED."fees_cents", "net_cents" = EXCLUDED."net_cents",
            "currency" = EXCLUDED."currency", "purchased_at" = EXCLUDED."purchased_at", "raw" = EXCLUDED."raw",
            "updated_at" = ${now}
          RETURNING (xmax = 0) AS inserted
        `
        if (res[0] && res[0].inserted) ingested += 1; else updated += 1
        if (crmActivities < 25) {
          const activity = await createCrmActivityForContact(db, {
            email: o.buyerEmail,
            eventId,
            actorAccountId: admin.accountId || '',
            kind: 'payment',
            title: 'Ticket order imported',
            body: `${o.tierName || 'Ticket'} x${o.quantity || 0}`,
            details: { provider: provider.provider, externalOrderId: o.externalOrderId, status: o.status, grossCents: o.grossCents },
          })
          if (activity.created) crmActivities += 1
        }
      } catch (error) {
        skipped += 1
        logWarn('tickets', 'manual import row failed', { error: error && error.message })
      }
    }
    await db.sql`UPDATE ticket_providers SET "orders_ingested" = "orders_ingested" + ${ingested}, "last_sync_at" = ${now}, "updated_at" = ${now} WHERE "id" = ${provider.id}`
    await recordAudit(db, req, admin, { action: 'ticket_orders.import', resourceType: 'ticket_provider', resourceId: providerId, details: { ingested, updated, actorName: body.actor || '' } })
    return json({ ok: true, received: orders.length, ingested, updated, skipped })
  }

  return json({ error: 'Unknown action.' }, 400)
}

export default async (req) => {
  const db = getDatabase()

  // Public webhook ingest: identified by the ingest token (header or query), so
  // it never needs — and never uses — an admin session.
  if (req.method === 'POST') {
    return ingest(req, db)
  }

  // Everything else is admin-only and same-origin.
  if (req.method === 'GET') {
    const admin = await requireAdmin(req, db)
    if (admin instanceof Response) return admin
    try {
      return await read(req, db)
    } catch (error) {
      logError('tickets', 'read failed', error)
      return json({ error: 'Failed to load ticketing data.' }, 500)
    }
  }

  if (req.method === 'PUT') {
    const csrf = requireSameOrigin(req)
    if (csrf) return csrf
    const admin = await requireAdmin(req, db)
    if (admin instanceof Response) return admin
    try {
      return await adminWrite(req, db, admin)
    } catch (error) {
      logError('tickets', 'write failed', error)
      return json({ error: 'Failed to save.' }, 500)
    }
  }

  if (req.method === 'DELETE') {
    const csrf = requireSameOrigin(req)
    if (csrf) return csrf
    const admin = await requireAdmin(req, db)
    if (admin instanceof Response) return admin
    const id = new URL(req.url).searchParams.get('id') || ''
    if (!id) return json({ error: 'Provider id required.' }, 400)
    await db.sql`DELETE FROM ticket_providers WHERE "id" = ${id}`
    await recordAudit(db, req, admin, { action: 'ticket_provider.delete', resourceType: 'ticket_provider', resourceId: id, details: {} })
    return json({ ok: true })
  }

  return json({ error: 'Method Not Allowed' }, 405)
}
