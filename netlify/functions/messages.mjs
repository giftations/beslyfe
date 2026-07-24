import { getDatabase } from '@netlify/database'
import { requireSession, requireSameOrigin, newId } from './lib/session.mjs'
import { createNotification } from './lib/notify.mjs'

// Private one-to-one direct messages between two community profiles. A
// conversation is every row where two profile ids appear as sender/recipient in
// either direction. Backed by Netlify Database so threads sync across devices.
//
// Every request requires a signed-in session; the acting profile ("me") is the
// session's profile, never a client-supplied id, so a caller can only ever read
// or send their own messages.
//
//   GET  ?type=threads                  → conversation list (last message + unread count per partner)
//   GET  ?type=thread&with=ID           → full thread (also marks the partner's messages read)
//   GET  ?type=unread                   → total unread message count for badges
//   POST { recipientId, body }           → send a message

const MAX_BODY = 4000
const MAX_URL = 1000
const MEDIA_KINDS = new Set(['image', 'video'])

// Attachments must come from the sender's own media library. The stored row is
// authoritative for kind, so a cached client cannot mislabel a video as an
// image and callers cannot inject arbitrary external URLs.
export async function resolveOwnedMessageMedia(db, mediaUrl, senderId) {
  if (!mediaUrl) return { ok: true, mediaUrl: '', mediaKind: '' }
  const rows = await db.sql`
    SELECT "owner_id", "kind", "url" FROM social_media
    WHERE "url" = ${mediaUrl} LIMIT 1
  `
  if (!rows.length || !MEDIA_KINDS.has(rows[0].kind)) {
    return { ok: false, status: 400, error: 'Choose a photo or video from your media library.' }
  }
  if (rows[0].owner_id !== senderId) {
    return { ok: false, status: 403, error: 'You can only attach media from your own library.' }
  }
  return { ok: true, mediaUrl: rows[0].url, mediaKind: rows[0].kind }
}

// A one-line preview for a conversation list. A media-only message has no text,
// so show what it carried instead of a blank line.
function preview(body, mediaKind) {
  if (body) return body
  if (mediaKind === 'video') return '🎥 Video'
  if (mediaKind === 'image') return '📷 Photo'
  return ''
}

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

function profileBrief(row) {
  return {
    id: row.id,
    displayName: row.display_name || 'Former member',
    role: row.role || '',
    headshotUrl: row.headshot_url || '',
  }
}

export default async (req) => {
  const db = getDatabase()
  const url = new URL(req.url)

  if (req.method === 'GET') {
    const session = await requireSession(req, db)
    if (session instanceof Response) return session
    const me = session.profileId
    const type = url.searchParams.get('type') || 'threads'
    if (!me) return json({ error: 'Your account has no community profile.' }, 400)

    if (type === 'unread') {
      const rows = await db.sql`SELECT COUNT(*)::int AS n FROM social_messages WHERE recipient_id = ${me} AND read_at IS NULL`
      return json({ unread: rows[0].n })
    }

    if (type === 'thread') {
      const other = url.searchParams.get('with')
      if (!other) return json({ error: 'Missing the other profile id' }, 400)

      const rows = await db.sql`
        SELECT * FROM social_messages
        WHERE (sender_id = ${me} AND recipient_id = ${other})
           OR (sender_id = ${other} AND recipient_id = ${me})
        ORDER BY created_at ASC
        LIMIT 500
      `
      // Mark the partner's unread messages to me as read.
      await db.sql`
        UPDATE social_messages SET read_at = ${new Date().toISOString()}
        WHERE recipient_id = ${me} AND sender_id = ${other} AND read_at IS NULL
      `
      const partnerRows = await db.sql`SELECT id, display_name, role, headshot_url FROM profiles WHERE id = ${other} LIMIT 1`
      const partner = partnerRows[0] ? profileBrief(partnerRows[0]) : { id: other, displayName: 'Former member', role: '', headshotUrl: '' }
      const items = rows.map((r) => ({
        id: r.id,
        senderId: r.sender_id,
        recipientId: r.recipient_id,
        body: r.body,
        mediaUrl: r.media_url || '',
        mediaKind: r.media_kind || '',
        mine: r.sender_id === me,
        createdAt: iso(r.created_at),
      }))
      return json({ items, partner })
    }

    // Default: the conversation list.
    const rows = await db.sql`
      SELECT * FROM social_messages
      WHERE sender_id = ${me} OR recipient_id = ${me}
      ORDER BY created_at DESC
      LIMIT 1000
    `
    // Group by the other party; the first row seen per partner is the latest.
    const byPartner = new Map()
    for (const r of rows) {
      const partnerId = r.sender_id === me ? r.recipient_id : r.sender_id
      if (!partnerId) continue
      let entry = byPartner.get(partnerId)
      if (!entry) {
        entry = { partnerId, last: r, unread: 0 }
        byPartner.set(partnerId, entry)
      }
      if (r.recipient_id === me && !r.read_at) entry.unread += 1
    }

    // Resolve every conversation partner's profile in a single batched query
    // (id = ANY(...)) instead of one round-trip per partner, then index them for
    // O(1) lookup. Partners without a surviving profile fall back to "Former member".
    const partnerIds = Array.from(byPartner.keys())
    const partnerById = new Map()
    if (partnerIds.length) {
      const profileRows = await db.sql`
        SELECT id, display_name, role, headshot_url FROM profiles WHERE id = ANY(${partnerIds})
      `
      for (const pr of profileRows) partnerById.set(pr.id, profileBrief(pr))
    }

    const threads = []
    for (const entry of byPartner.values()) {
      const partner = partnerById.get(entry.partnerId)
        || { id: entry.partnerId, displayName: 'Former member', role: '', headshotUrl: '' }
      threads.push({
        partner,
        lastMessage: preview(entry.last.body, entry.last.media_kind),
        lastFromMe: entry.last.sender_id === me,
        lastAt: iso(entry.last.created_at),
        unread: entry.unread,
      })
    }
    threads.sort((a, b) => (b.lastAt || '').localeCompare(a.lastAt || ''))
    return json({ items: threads })
  }

  if (req.method === 'POST') {
    const session = await requireSession(req, db)
    if (session instanceof Response) return session
    const cross = requireSameOrigin(req)
    if (cross) return cross
    const senderId = session.profileId
    if (!senderId) return json({ error: 'Your account has no community profile.' }, 400)
    let body
    try {
      body = await req.json()
    } catch {
      return json({ error: 'Invalid JSON' }, 400)
    }
    const recipientId = str(body.recipientId, 100)
    const text = str(body.body, MAX_BODY).trim()
    const mediaUrl = str(body.mediaUrl, MAX_URL)
    if (!recipientId) return json({ error: 'Missing recipient.' }, 400)
    if (senderId === recipientId) return json({ error: 'You cannot message yourself.' }, 400)
    if (!text && !mediaUrl) return json({ error: 'Write a message or add a photo or video.' }, 400)

    // The recipient must be a real profile.
    const exists = await db.sql`SELECT id FROM profiles WHERE id = ${recipientId} LIMIT 1`
    if (!exists.length) return json({ error: 'That profile no longer exists.' }, 404)
    const media = await resolveOwnedMessageMedia(db, mediaUrl, senderId)
    if (!media.ok) return json({ error: media.error }, media.status)

    const id = newId()
    const now = new Date().toISOString()
    await db.sql`
      INSERT INTO social_messages ("id", "sender_id", "recipient_id", "body", "media_url", "media_kind", "read_at", "created_at")
      VALUES (${id}, ${senderId}, ${recipientId}, ${text}, ${media.mediaUrl}, ${media.mediaKind}, NULL, ${now})
    `
    // Notify the recipient (respects their notification preferences). Best-effort:
    // a failure here never fails the send.
    await createNotification(db, {
      recipientId, actorId: senderId, type: 'message', messageId: id,
      body: preview(text, media.mediaKind), link: `/messages?to=${encodeURIComponent(senderId)}`,
    })
    return json({ ok: true, id, createdAt: now })
  }

  return json({ error: 'Method Not Allowed' }, 405)
}
