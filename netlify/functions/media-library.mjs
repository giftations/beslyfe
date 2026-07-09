import { getDatabase } from '@netlify/database'
import { requireSession, requireSameOrigin, newId, recordAudit, readJsonBody, isLiveAdmin, json } from './lib/session.mjs'

// Per-member media library. Every image or video a member uploads in the studio
// is stored once in the `social_media` table — both the bytes (in the `data`
// bytea column) and the index row (owner, kind, caption, filter) — so they can
// reuse it across posts, reels, stories and group chats with everything kept in
// one place: the database.
//
//   GET  ?owner=ID            → that member's library, newest first
//   GET  ?file=ID             → the bytes (images and video, with Range support)
//   POST { ownerId, filename, contentType, dataBase64, caption, filter }
//   DELETE ?id=ID&owner=ID    → remove an item the member owns

const IMAGE_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/avif',
])
const VIDEO_TYPES = new Set([
  'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
])
const EXT_TYPES = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mov: 'video/quicktime',
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024   // 8 MB
const MAX_VIDEO_BYTES = 40 * 1024 * 1024  // 40 MB

function str(value, max) {
  if (value === null || value === undefined) return ''
  return String(value).slice(0, max)
}

function mediaUrl(id) {
  return `/.netlify/functions/media-library?file=${encodeURIComponent(id)}`
}

function kindFor(contentType) {
  if (VIDEO_TYPES.has(contentType)) return 'video'
  if (IMAGE_TYPES.has(contentType)) return 'image'
  return null
}

function resolveContentType(contentType, filename) {
  const ct = typeof contentType === 'string' ? contentType.trim().toLowerCase() : ''
  if (kindFor(ct)) return ct
  const ext = String(filename || '').toLowerCase().match(/\.([a-z0-9]+)$/)
  if (ext && EXT_TYPES[ext[1]]) return EXT_TYPES[ext[1]]
  return ct
}

function iso(value) {
  return value instanceof Date ? value.toISOString() : value
}

// Serve bytes, honoring a Range request (required for video seeking).
function serveBytes(data, contentType, rangeHeader) {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data)
  const total = buffer.byteLength
  const baseHeaders = {
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=31536000, immutable',
  }
  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim())
    if (match) {
      let start = match[1] === '' ? null : parseInt(match[1], 10)
      let end = match[2] === '' ? null : parseInt(match[2], 10)
      if (start === null && end !== null) {
        start = Math.max(0, total - end)
        end = total - 1
      } else {
        if (start === null) start = 0
        if (end === null || end >= total) end = total - 1
      }
      if (start > end || start >= total) {
        return new Response('Range Not Satisfiable', {
          status: 416,
          headers: { 'Content-Range': `bytes */${total}`, 'Accept-Ranges': 'bytes' },
        })
      }
      const chunk = buffer.subarray(start, end + 1)
      return new Response(chunk, {
        status: 206,
        headers: {
          ...baseHeaders,
          'Content-Range': `bytes ${start}-${end}/${total}`,
          'Content-Length': String(chunk.byteLength),
        },
      })
    }
  }
  return new Response(buffer, {
    headers: { ...baseHeaders, 'Content-Length': String(total) },
  })
}

export default async (req) => {
  const db = getDatabase()
  const url = new URL(req.url)
  const fileId = url.searchParams.get('file')

  // Serve a single item's bytes.
  if ((req.method === 'GET' || req.method === 'HEAD') && fileId) {
    const rows = await db.sql`
      SELECT encode("data", 'base64') AS data_b64, "content_type", "kind"
      FROM social_media WHERE "id" = ${fileId} LIMIT 1
    `
    if (!rows.length || !rows[0].data_b64) return new Response('Not found', { status: 404 })
    const buffer = Buffer.from(rows[0].data_b64, 'base64')
    const contentType = rows[0].content_type
      || (rows[0].kind === 'video' ? 'video/mp4' : 'application/octet-stream')
    return serveBytes(buffer, contentType, req.headers.get('range'))
  }

  // List a member's own library.
  if (req.method === 'GET') {
    const session = await requireSession(req, db)
    if (session instanceof Response) return session
    const owner = session.profileId
    if (!owner) return json({ error: 'Your account has no community profile.' }, 400)
    const rows = await db.sql`
      SELECT "id", "owner_id", "kind", "url", "caption", "filter", "created_at"
      FROM social_media WHERE owner_id = ${owner} ORDER BY created_at DESC LIMIT 300
    `
    const items = rows.map((r) => ({
      id: r.id,
      ownerId: r.owner_id,
      kind: r.kind,
      url: r.url,
      caption: r.caption,
      filter: r.filter,
      createdAt: iso(r.created_at),
    }))
    return json({ items })
  }

  // Upload a new item to the owner's library.
  if (req.method === 'POST') {
    const session = await requireSession(req, db)
    if (session instanceof Response) return session
    const cross = requireSameOrigin(req)
    if (cross) return cross
    const ownerId = session.profileId
    if (!ownerId) return json({ error: 'Your account has no community profile.' }, 400)
    const body = await readJsonBody(req)
    if (body instanceof Response) return body
    const { filename, contentType, dataBase64 } = body
    if (!dataBase64) return json({ error: 'Missing file data' }, 400)

    const resolvedType = resolveContentType(contentType, filename)
    const kind = kindFor(resolvedType)
    if (!kind) return json({ error: `Unsupported file type: ${contentType || 'unknown'}` }, 400)

    const maxBytes = kind === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES
    // Pre-decode guard: a base64 string of length L decodes to at most ~L×3/4
    // bytes. Reject an oversized payload here, before Buffer.from allocates it, so
    // the worst-case memory a single request can pin is bounded by the ceiling
    // rather than by whatever the client chose to send.
    if (typeof dataBase64 !== 'string') return json({ error: 'Missing file data' }, 400)
    if (Math.floor((dataBase64.length * 3) / 4) > maxBytes) {
      return json({ error: `${kind === 'video' ? 'Video' : 'Image'} exceeds maximum size of ${maxBytes / 1024 / 1024} MB` }, 400)
    }

    let buffer
    try {
      buffer = Buffer.from(dataBase64, 'base64')
    } catch {
      return json({ error: 'Could not decode file data' }, 400)
    }
    if (buffer.byteLength === 0) return json({ error: 'Empty file' }, 400)
    if (buffer.byteLength > maxBytes) {
      return json({ error: `${kind === 'video' ? 'Video' : 'Image'} exceeds maximum size of ${maxBytes / 1024 / 1024} MB` }, 400)
    }

    const id = newId()
    const mediaUrlValue = mediaUrl(id)
    const caption = str(body.caption, 300)
    const filter = str(body.filter, 40)
    const cleanBase64 = buffer.toString('base64')
    const now = new Date().toISOString()
    await db.sql`
      INSERT INTO social_media ("id", "owner_id", "kind", "url", "caption", "filter", "content_type", "data", "created_at")
      VALUES (${id}, ${ownerId}, ${kind}, ${mediaUrlValue}, ${caption}, ${filter}, ${resolvedType}, decode(${cleanBase64}, 'base64'), ${now})
    `
    return json({ ok: true, id, kind, url: mediaUrlValue, filter, caption })
  }

  // Remove an item (owner only; an admin may remove any).
  if (req.method === 'DELETE') {
    const session = await requireSession(req, db)
    if (session instanceof Response) return session
    const cross = requireSameOrigin(req)
    if (cross) return cross
    const owner = session.profileId
    const id = url.searchParams.get('id')
    if (!id) return json({ error: 'Missing id.' }, 400)
    const rows = await db.sql`SELECT owner_id FROM social_media WHERE id = ${id} LIMIT 1`
    if (!rows.length) return json({ ok: true })
    // Re-derive admin status from the live account so a since-demoted admin
    // cannot keep deleting others' media until their session expires.
    const isAdmin = await isLiveAdmin(session, db)
    if (!isAdmin && rows[0].owner_id !== owner) {
      return json({ error: 'You can only delete your own media.' }, 403)
    }
    await db.sql`DELETE FROM social_media WHERE id = ${id}`
    // Record the destructive action so deletions of member media are accountable
    // in the audit trail, mirroring the coverage the admin surfaces already have.
    // Best-effort inside recordAudit — a logging failure never blocks the delete.
    await recordAudit(db, req, session, {
      action: 'media.delete', resourceType: 'social_media', resourceId: id,
      details: { ownerId: rows[0].owner_id, byAdmin: isAdmin && rows[0].owner_id !== owner },
    })
    return json({ ok: true })
  }

  return json({ error: 'Method Not Allowed' }, 405)
}
