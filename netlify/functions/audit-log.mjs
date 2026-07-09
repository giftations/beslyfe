import { getDatabase } from '@netlify/database'
import { json, requireAdmin, iso } from './lib/session.mjs'

// Admin-only, read-only view over the append-only `audit_log` table. The log is
// written best-effort by the privileged mutations across the platform (see
// recordAudit in lib/session.mjs); this endpoint surfaces it in the Admin OS so
// an administrator can see who changed what, when and from where.
//
//   GET ?limit=&action=&resourceType=&before=
//     limit         page size (default 100, max 200)
//     action        exact action filter (e.g. 'application.update')
//     resourceType  exact resource-type filter (e.g. 'profile')
//     before        ISO timestamp cursor — return rows strictly older than this,
//                   for "load more" pagination (rows are newest-first)
//
// The response resolves each actor's display name from the live account so the
// log reads well even for older rows written before a name was captured. Rows
// are only ever read here — this endpoint has no write path, matching the
// tamper-evident, append-only intent of the table.

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 200

export default async (req) => {
  const db = getDatabase()

  if (req.method !== 'GET') {
    return json({ error: 'Method Not Allowed' }, 405)
  }

  const admin = await requireAdmin(req, db)
  if (admin instanceof Response) return admin

  const url = new URL(req.url)
  let limit = parseInt(url.searchParams.get('limit') || '', 10)
  if (!Number.isFinite(limit) || limit <= 0) limit = DEFAULT_LIMIT
  limit = Math.min(limit, MAX_LIMIT)

  // The distinct values actually present in the log power the filter dropdowns
  // in the admin view — and double as an allowlist. Reading them first lets us
  // reject an arbitrary `action`/`resourceType` filter (a value the log has
  // never contained) rather than passing attacker-controlled text through to the
  // query and back into the filter UI. Bounded so a large log stays manageable.
  const actionRows = await db.sql`SELECT DISTINCT action FROM audit_log WHERE action <> '' ORDER BY action LIMIT 100`
  const typeRows = await db.sql`SELECT DISTINCT resource_type FROM audit_log WHERE resource_type <> '' ORDER BY resource_type LIMIT 100`
  const knownActions = new Set(actionRows.map((r) => r.action))
  const knownTypes = new Set(typeRows.map((r) => r.resource_type))

  // A filter is honoured only when it names a value the allowlist knows; anything
  // else falls back to "no filter" (null) instead of being echoed back verbatim.
  const rawAction = url.searchParams.get('action') || ''
  const rawType = url.searchParams.get('resourceType') || ''
  const action = knownActions.has(rawAction) ? rawAction : null
  const resourceType = knownTypes.has(rawType) ? rawType : null
  const before = url.searchParams.get('before') || null

  const rows = await db.sql`
    SELECT al.*, COALESCE(NULLIF(al.actor_name, ''), a.name, a.email, '') AS resolved_actor
    FROM audit_log al
    LEFT JOIN accounts a ON a.id = al.actor_account_id
    WHERE (${action}::text IS NULL OR al.action = ${action})
      AND (${resourceType}::text IS NULL OR al.resource_type = ${resourceType})
      AND (${before}::timestamptz IS NULL OR al.created_at < ${before}::timestamptz)
    ORDER BY al.created_at DESC
    LIMIT ${limit}
  `

  const items = rows.map((r) => ({
    id: r.id,
    actorAccountId: r.actor_account_id || '',
    actorName: r.resolved_actor || 'System',
    action: r.action || '',
    resourceType: r.resource_type || '',
    resourceId: r.resource_id || '',
    details: r.details || {},
    ip: r.ip || '',
    createdAt: iso(r.created_at),
  }))

  // A full page implies there may be more; expose the oldest row's timestamp as
  // the cursor for the next request.
  const nextBefore = rows.length === limit ? iso(rows[rows.length - 1].created_at) : null

  return json({
    items,
    nextBefore,
    // Echo the filters that were actually applied so the client can reflect when
    // an unknown value was dropped rather than silently showing an empty result.
    applied: { action: action || '', resourceType: resourceType || '' },
    filters: {
      actions: actionRows.map((r) => r.action),
      resourceTypes: typeRows.map((r) => r.resource_type),
    },
  }, 200, { 'Cache-Control': 'no-store' })
}
