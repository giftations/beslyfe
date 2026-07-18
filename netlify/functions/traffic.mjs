import { getDatabase } from '@netlify/database'

import { json, newId, readJsonBody, requireAdmin, requireSameOrigin, str } from './lib/session.mjs'

function cleanPath(value) {
  const path = str(value || '/', 300)
  return path.startsWith('/') ? path : '/'
}

function cleanTag(value, fallback = '') {
  const text = str(value, 100).trim().toLowerCase()
  return text || fallback
}

function cleanReferrer(value) {
  try {
    const host = new URL(String(value || '')).hostname.toLowerCase()
    return host === 'beslyfe.com' || host === 'www.beslyfe.com' ? '' : host.slice(0, 160)
  } catch { return '' }
}

export function normalizeTrafficEvent(body = {}) {
  return {
    path: cleanPath(body.path),
    source: cleanTag(body.source, 'direct'),
    medium: cleanTag(body.medium),
    campaign: cleanTag(body.campaign),
    referrerHost: cleanReferrer(body.referrer),
  }
}

export default async (req) => {
  const db = getDatabase()
  if (req.method === 'POST') {
    const cross = requireSameOrigin(req)
    if (cross) return cross
    const body = await readJsonBody(req)
    if (body instanceof Response) return body
    const event = normalizeTrafficEvent(body)
    try {
      await db.sql`
        INSERT INTO traffic_events ("id", "path", "source", "medium", "campaign", "referrer_host", "created_at")
        VALUES (${newId('view_')}, ${event.path}, ${event.source}, ${event.medium}, ${event.campaign}, ${event.referrerHost}, ${new Date().toISOString()})
      `
    } catch {
      return json({ ok: false, status: 'measurement_unavailable' }, 202)
    }
    return json({ ok: true }, 202)
  }

  if (req.method === 'GET') {
    const admin = await requireAdmin(req, db)
    if (admin instanceof Response) return admin
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const [totals, sources, campaigns, recent] = await Promise.all([
      db.sql`SELECT COUNT(*)::int AS views FROM traffic_events WHERE "created_at" >= ${since}`,
      db.sql`SELECT "source", COUNT(*)::int AS views FROM traffic_events WHERE "created_at" >= ${since} GROUP BY "source" ORDER BY views DESC LIMIT 12`,
      db.sql`SELECT "campaign", COUNT(*)::int AS views FROM traffic_events WHERE "created_at" >= ${since} AND "campaign" <> '' GROUP BY "campaign" ORDER BY views DESC LIMIT 12`,
      db.sql`SELECT "path", "source", "medium", "campaign", "referrer_host", "created_at" FROM traffic_events ORDER BY "created_at" DESC LIMIT 50`,
    ])
    return json({
      window: '24h',
      views: totals[0]?.views || 0,
      sources,
      campaigns,
      recent,
      generatedAt: new Date().toISOString(),
    })
  }

  return json({ error: 'Method Not Allowed' }, 405, { Allow: 'GET, POST' })
}

