import { getDatabase } from '@netlify/database'
import { readSession, requireSession, requireSameOrigin } from './lib/session.mjs'

// Shared locations for the community map. Each member has at most one shared
// place (one row per profile). Visibility controls who sees it on the map:
//   public    → everyone
//   followers → the member's followers (and the member)
//   private   → only the member (a personal pin)
//
//   GET  ?type=map&viewer=ID       → places the viewer is allowed to see
//   GET  ?type=mine&me=ID          → the viewer's own shared place (or null)
//   POST { profileId, lat, lng, label, visibility }   → share / update a place
//   DELETE ?profileId=ID           → stop sharing

const VISIBILITIES = new Set(['public', 'followers', 'private'])

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

function str(value, max) {
  if (value === null || value === undefined) return ''
  return String(value).slice(0, max)
}

function iso(value) {
  return value instanceof Date ? value.toISOString() : value
}

function placeRow(r) {
  return {
    profileId: r.profile_id,
    lat: r.lat,
    lng: r.lng,
    label: r.label,
    visibility: r.visibility,
    updatedAt: iso(r.updated_at),
    profile: {
      id: r.profile_id,
      displayName: r.display_name || 'Member',
      role: r.profile_role || '',
      headshotUrl: r.headshot_url || '',
    },
  }
}

export default async (req) => {
  const db = getDatabase()
  const url = new URL(req.url)

  if (req.method === 'GET') {
    const type = url.searchParams.get('type') || 'map'
    // The viewer is always the signed-in profile, never a client-supplied id, so
    // followers-only pins can't be unlocked by guessing someone else's id.
    const session = await readSession(req, db)
    const viewer = session ? session.profileId : null

    if (type === 'mine') {
      if (!viewer) return json({ item: null })
      const rows = await db.sql`SELECT * FROM social_locations WHERE profile_id = ${viewer} LIMIT 1`
      return json({ item: rows.length ? placeRow({ ...rows[0], display_name: '', profile_role: '', headshot_url: '' }) : null })
    }

    // Map view: public places, plus followers-only places of people the viewer
    // follows, plus the viewer's own place.
    const rows = await db.sql`
      SELECT l.*, p.display_name, p.role AS profile_role, p.headshot_url
      FROM social_locations l
      LEFT JOIN profiles p ON p.id = l.profile_id
      ORDER BY l.updated_at DESC
      LIMIT 500
    `
    let followingSet = null
    const needsFollow = rows.some((r) => r.visibility === 'followers' && r.profile_id !== viewer)
    if (viewer && needsFollow) {
      const f = await db.sql`SELECT followee_id FROM social_follows WHERE follower_id = ${viewer}`
      followingSet = new Set(f.map((r) => r.followee_id))
    }
    const items = rows.filter((r) => {
      if (r.visibility === 'public') return true
      if (r.profile_id === viewer) return true
      if (r.visibility === 'followers') return followingSet ? followingSet.has(r.profile_id) : false
      return false
    }).map(placeRow)
    return json({ items })
  }

  if (req.method === 'POST') {
    const session = await requireSession(req, db)
    if (session instanceof Response) return session
    const cross = requireSameOrigin(req)
    if (cross) return cross
    const profileId = session.profileId
    if (!profileId) return json({ error: 'Your account has no community profile.' }, 400)
    let body
    try {
      body = await req.json()
    } catch {
      return json({ error: 'Invalid JSON' }, 400)
    }
    const lat = str(body.lat, 32)
    const lng = str(body.lng, 32)
    if (!lat || !lng) return json({ error: 'A place needs coordinates.' }, 400)
    const label = str(body.label, 160)
    const visibility = VISIBILITIES.has(body.visibility) ? body.visibility : 'public'
    const now = new Date().toISOString()
    await db.sql`
      INSERT INTO social_locations ("profile_id", "lat", "lng", "label", "visibility", "updated_at")
      VALUES (${profileId}, ${lat}, ${lng}, ${label}, ${visibility}, ${now})
      ON CONFLICT ("profile_id") DO UPDATE SET
        "lat" = ${lat}, "lng" = ${lng}, "label" = ${label}, "visibility" = ${visibility}, "updated_at" = ${now}
    `
    return json({ ok: true })
  }

  if (req.method === 'DELETE') {
    const session = await requireSession(req, db)
    if (session instanceof Response) return session
    const cross = requireSameOrigin(req)
    if (cross) return cross
    if (!session.profileId) return json({ error: 'Your account has no community profile.' }, 400)
    await db.sql`DELETE FROM social_locations WHERE profile_id = ${session.profileId}`
    return json({ ok: true })
  }

  return json({ error: 'Method Not Allowed' }, 405)
}
