import { getDatabase } from '@netlify/database'
import { requireSession, requireAdmin, requireSameOrigin, recordAudit } from './lib/session.mjs'

// Persistent media library shared across browsers and visitors. Every item —
// the bytes and its metadata (name, content type, kind, upload time) — lives in
// a single `site_media` row in the database, so the whole site is stored in one
// place. Bytes are kept in the `data` (bytea) column and served with the
// recorded Content-Type and, for video, HTTP Range support so files stream and
// seek anywhere they are used on the site.
//
// Uploads are auto-configured: the content type is detected from the upload (or
// inferred from the file extension) and the right kind (image/video) recorded.

const IMAGE_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/avif',
])
const VIDEO_TYPES = new Set([
  'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
])

// Map common file extensions to a content type so an upload still works when the
// browser does not provide one.
const EXT_TYPES = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mov: 'video/quicktime',
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024   // 5 MB
const MAX_VIDEO_BYTES = 25 * 1024 * 1024  // 25 MB

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function iso(value) {
  return value instanceof Date ? value.toISOString() : (value || '')
}

function mediaUrl(id) {
  return `/.netlify/functions/site-media?file=${encodeURIComponent(id)}`
}

function kindFor(contentType) {
  if (VIDEO_TYPES.has(contentType)) return 'video'
  if (IMAGE_TYPES.has(contentType)) return 'image'
  return null
}

// Resolve the effective content type from the supplied type and/or filename so
// any sensible upload is accepted and auto-configured.
function resolveContentType(contentType, filename) {
  const ct = typeof contentType === 'string' ? contentType.trim().toLowerCase() : ''
  if (kindFor(ct)) return ct
  const ext = String(filename || '').toLowerCase().match(/\.([a-z0-9]+)$/)
  if (ext && EXT_TYPES[ext[1]]) return EXT_TYPES[ext[1]]
  return ct
}

// Serve bytes, honoring a Range request when present (required for video
// seeking and smooth playback in browsers).
function serveBytes(buffer, contentType, rangeHeader) {
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
        // Suffix range: last N bytes.
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

  // Serve a single item's bytes (images and video, with Range support).
  if ((req.method === 'GET' || req.method === 'HEAD') && fileId) {
    const rows = await db.sql`
      SELECT encode("data", 'base64') AS data_b64, "content_type" FROM site_media WHERE "id" = ${fileId} LIMIT 1
    `
    if (!rows.length || !rows[0].data_b64) return new Response('Not found', { status: 404 })
    const buffer = Buffer.from(rows[0].data_b64, 'base64')
    const contentType = rows[0].content_type || 'application/octet-stream'
    return serveBytes(buffer, contentType, req.headers.get('range'))
  }

  // List the library.
  if (req.method === 'GET') {
    const rows = await db.sql`
      SELECT "id", "name", "content_type", "kind", "created_at"
      FROM site_media ORDER BY "created_at" DESC LIMIT 500
    `
    const items = rows.map((r) => ({
      id: r.id,
      name: r.name || r.id,
      contentType: r.content_type || '',
      kind: r.kind || (kindFor(r.content_type) || 'image'),
      addedAt: iso(r.created_at),
      url: mediaUrl(r.id),
    }))
    return json({ items })
  }

  // Upload a new image or video. The upload is auto-configured: type is
  // detected, the kind recorded, and a ready-to-use URL returned. Any signed-in
  // member may upload (e.g. a profile headshot); anonymous callers cannot.
  if (req.method === 'POST') {
    const session = await requireSession(req, db)
    if (session instanceof Response) return session
    let body
    try {
      body = await req.json()
    } catch {
      return json({ error: 'Invalid JSON' }, 400)
    }
    const { filename, contentType, dataBase64 } = body || {}
    if (!dataBase64) return json({ error: 'Missing file data' }, 400)

    const resolvedType = resolveContentType(contentType, filename)
    const kind = kindFor(resolvedType)
    if (!kind) {
      return json({ error: `Unsupported file type: ${contentType || 'unknown'}` }, 400)
    }

    let buffer
    try {
      buffer = Buffer.from(dataBase64, 'base64')
    } catch {
      return json({ error: 'Could not decode file data' }, 400)
    }
    if (buffer.byteLength === 0) return json({ error: 'Empty file' }, 400)

    const maxBytes = kind === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES
    if (buffer.byteLength > maxBytes) {
      return json({ error: `${kind === 'video' ? 'Video' : 'Image'} exceeds maximum size of ${maxBytes / 1024 / 1024} MB` }, 400)
    }

    const safeName = String(filename || kind).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
    // A random suffix keeps the primary key unique even when two files with the
    // same name are uploaded in the same millisecond.
    const id = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeName}`
    const cleanBase64 = buffer.toString('base64')
    const now = new Date().toISOString()
    await db.sql`
      INSERT INTO site_media ("id", "name", "content_type", "kind", "data", "created_at")
      VALUES (${id}, ${safeName}, ${resolvedType}, ${kind}, decode(${cleanBase64}, 'base64'), ${now})
    `

    return json({ ok: true, id, name: safeName, kind, contentType: resolvedType, url: mediaUrl(id) })
  }

  // Remove an item (admin).
  if (req.method === 'DELETE') {
    const cross = requireSameOrigin(req)
    if (cross) return cross
    const admin = await requireAdmin(req, db)
    if (admin instanceof Response) return admin
    if (!fileId) return json({ error: 'Missing file id' }, 400)
    const existing = await db.sql`SELECT "name", "kind" FROM site_media WHERE "id" = ${fileId} LIMIT 1`
    await db.sql`DELETE FROM site_media WHERE "id" = ${fileId}`
    await recordAudit(db, req, admin, {
      action: 'media.delete', resourceType: 'site_media', resourceId: fileId,
      details: existing[0] ? { name: existing[0].name, kind: existing[0].kind } : {},
    })
    return json({ ok: true })
  }

  return json({ error: 'Method Not Allowed' }, 405)
}
