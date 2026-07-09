import { getDatabase } from '@netlify/database'
import { requireSession, requireSameOrigin, readJsonBody, json } from './lib/session.mjs'

// A member's notification inbox — the Facebook/Instagram-style activity feed and
// its preferences. Identity always comes from the signed-in session's profile
// ("me"), never a client-supplied id, so a member can only ever read or clear
// their own notifications and change their own preferences.
//
//   GET  ?type=list            → recent notifications (with the actor's profile), newest first
//   GET  ?type=count           → unread count, for the bell badge
//   GET  ?type=prefs           → this member's preferences ({ muted, prefs })
//   POST { action:'read', id } → mark one notification read
//   POST { action:'readAll' }  → mark every unread notification read
//   POST { action:'prefs', muted, prefs } → save preferences (the opt-out control)

// The categories a member can toggle. Kept in sync with lib/notify.mjs.
const PREF_TYPES = ['message', 'group', 'post', 'like', 'comment', 'follow']

function iso(value) {
  return value instanceof Date ? value.toISOString() : value
}

function actorBrief(row) {
  return {
    id: row.actor_id,
    displayName: row.actor_name || 'Someone',
    role: row.actor_role || '',
    headshotUrl: row.actor_avatar || '',
  }
}

export default async (req) => {
  const db = getDatabase()
  const url = new URL(req.url)

  if (req.method === 'GET') {
    const session = await requireSession(req, db)
    if (session instanceof Response) return session
    const me = session.profileId
    const type = url.searchParams.get('type') || 'list'
    // A signed-in account that has no community profile yet (e.g. an admin who
    // hasn't posted) simply has nothing addressed to it. Answer with empty,
    // well-formed results so the notifications panel loads cleanly instead of
    // erroring — once they take part, a profile is created and this fills in.
    if (!me) {
      if (type === 'count') return json({ unread: 0 })
      if (type === 'prefs') return json({ muted: false, prefs: {} })
      return json({ items: [], unread: 0 })
    }

    if (type === 'count') {
      const rows = await db.sql`
        SELECT COUNT(*)::int AS n FROM notifications WHERE recipient_id = ${me} AND read_at IS NULL
      `
      return json({ unread: rows[0].n })
    }

    if (type === 'prefs') {
      const rows = await db.sql`SELECT "muted", "prefs" FROM notification_prefs WHERE "profile_id" = ${me} LIMIT 1`
      if (!rows.length) return json({ muted: false, prefs: {} })
      let prefs = rows[0].prefs
      if (typeof prefs === 'string') { try { prefs = JSON.parse(prefs) } catch { prefs = {} } }
      return json({ muted: !!rows[0].muted, prefs: prefs || {} })
    }

    // Default: the list. Join the acting profile so the client has a name/avatar.
    const rows = await db.sql`
      SELECT n.*, p.display_name AS actor_name, p.role AS actor_role, p.headshot_url AS actor_avatar
      FROM notifications n
      LEFT JOIN profiles p ON p.id = n.actor_id
      WHERE n.recipient_id = ${me}
      ORDER BY n.created_at DESC
      LIMIT 60
    `
    const items = rows.map((r) => ({
      id: r.id,
      type: r.type,
      postId: r.post_id || '',
      messageId: r.message_id || '',
      body: r.body || '',
      link: r.link || '',
      read: !!r.read_at,
      createdAt: iso(r.created_at),
      actor: actorBrief(r),
    }))
    const unread = items.filter((i) => !i.read).length
    return json({ items, unread })
  }

  if (req.method === 'POST') {
    const session = await requireSession(req, db)
    if (session instanceof Response) return session
    const cross = requireSameOrigin(req)
    if (cross) return cross
    const me = session.profileId
    // No profile means no notifications to touch; treat every write as a no-op
    // success rather than an error, mirroring the read path above.
    if (!me) return json({ ok: true })
    const body = await readJsonBody(req)
    if (body instanceof Response) return body
    const action = body.action

    if (action === 'read') {
      const id = String(body.id || '').slice(0, 100)
      if (!id) return json({ error: 'Missing notification id.' }, 400)
      // Scoped to the caller so a member can only clear their own rows.
      await db.sql`
        UPDATE notifications SET read_at = ${new Date().toISOString()}
        WHERE id = ${id} AND recipient_id = ${me} AND read_at IS NULL
      `
      return json({ ok: true })
    }

    if (action === 'readAll') {
      await db.sql`
        UPDATE notifications SET read_at = ${new Date().toISOString()}
        WHERE recipient_id = ${me} AND read_at IS NULL
      `
      return json({ ok: true })
    }

    if (action === 'prefs') {
      const muted = !!body.muted
      // Keep only known categories, coerced to booleans, so the stored document
      // can't be polluted with arbitrary keys from the client.
      const incoming = (body.prefs && typeof body.prefs === 'object') ? body.prefs : {}
      const prefs = {}
      for (const t of PREF_TYPES) {
        if (Object.prototype.hasOwnProperty.call(incoming, t)) prefs[t] = incoming[t] !== false
      }
      const now = new Date().toISOString()
      await db.sql`
        INSERT INTO notification_prefs ("profile_id", "muted", "prefs", "updated_at")
        VALUES (${me}, ${muted}, ${JSON.stringify(prefs)}::jsonb, ${now})
        ON CONFLICT ("profile_id") DO UPDATE SET
          "muted" = ${muted}, "prefs" = ${JSON.stringify(prefs)}::jsonb, "updated_at" = ${now}
      `
      return json({ ok: true, muted, prefs })
    }

    return json({ error: 'Unknown action' }, 400)
  }

  return json({ error: 'Method Not Allowed' }, 405)
}
