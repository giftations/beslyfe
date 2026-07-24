import { getDatabase } from '@netlify/database'
import { createHash } from 'node:crypto'
import {
  ensureProfileForAccount,
  requireSession,
  requireSameOrigin,
  newId,
  recordAudit,
  readJsonBody,
  isLiveAdmin,
  json,
} from './lib/session.mjs'

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

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024
// Stay below Netlify's decimal 20 MB streamed-response ceiling with room for
// platform framing. Larger videos belong in an object/CDN store, not Postgres.
export const MAX_VIDEO_BYTES = 18 * 1024 * 1024
export const DIRECT_UPLOAD_MAX_BYTES = 3 * 1024 * 1024
export const MEDIA_CHUNK_BYTES = 2 * 1024 * 1024
export const MEDIA_RESPONSE_BYTES = 4 * 1024 * 1024
export const STREAMED_RESPONSE_BYTES = 18 * 1024 * 1024
const UPLOAD_TTL_MS = 60 * 60 * 1000
const UPLOAD_MAX_LIFETIME_MS = 6 * 60 * 60 * 1000

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

function sizeError(kind, maxBytes) {
  return `${kind === 'video' ? 'Video' : 'Image'} exceeds maximum size of ${maxBytes / 1024 / 1024} MB`
}

export function describeMediaUpload(input = {}) {
  const filename = str(input.filename, 240)
  const contentType = resolveContentType(input.contentType, filename)
  const kind = kindFor(contentType)
  if (!kind) {
    return { ok: false, status: 400, error: `Unsupported file type: ${input.contentType || 'unknown'}` }
  }
  const totalBytes = Number(input.totalBytes)
  if (!Number.isSafeInteger(totalBytes) || totalBytes <= 0) {
    return { ok: false, status: 400, error: 'File size must be a positive whole number.' }
  }
  const maxBytes = kind === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES
  if (totalBytes > maxBytes) {
    return { ok: false, status: 413, error: sizeError(kind, maxBytes) }
  }
  return {
    ok: true,
    value: { filename, contentType, kind, totalBytes, maxBytes },
  }
}

export function parseUploadContentRange(value) {
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(String(value || '').trim())
  if (!match) return null
  const start = Number(match[1])
  const end = Number(match[2])
  const total = Number(match[3])
  if (![start, end, total].every(Number.isSafeInteger) || start < 0 || end < start || total <= end) return null
  return { start, end, total }
}

// Select at most four binary MB for any one response. Video elements normally
// send Range themselves; the bounded no-Range fallback keeps direct navigation
// below the platform response limit too.
export function mediaByteWindow(totalValue, rangeHeader, maxBytes = MEDIA_RESPONSE_BYTES) {
  const total = Number(totalValue)
  if (!Number.isSafeInteger(total) || total <= 0) return null
  const header = String(rangeHeader || '').trim()
  let start = 0
  let end = total - 1

  if (header) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(header)
    if (!match) return null
    if (match[1] === '' && match[2] === '') return null
    if (match[1] === '') {
      const suffix = Number(match[2])
      if (!Number.isSafeInteger(suffix) || suffix <= 0) return null
      const delivered = Math.min(suffix, maxBytes, total)
      start = total - delivered
      end = total - 1
    } else {
      start = Number(match[1])
      end = match[2] === '' ? total - 1 : Number(match[2])
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= total) {
        return null
      }
      end = Math.min(end, total - 1, start + maxBytes - 1)
    }
  } else {
    if (total > maxBytes) return null
    end = total - 1
  }

  return {
    start,
    end,
    length: end - start + 1,
    status: header || start > 0 || end < total - 1 ? 206 : 200,
    total,
  }
}

export function mediaSafetyHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self' data:",
  }
}

function mediaHeaders(contentType, window) {
  const headers = {
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Content-Length': String(window.length),
    ...mediaSafetyHeaders(),
  }
  if (window.status === 206) {
    headers['Content-Range'] = `bytes ${window.start}-${window.end}/${window.total}`
  }
  return headers
}

async function serveStoredMedia(db, fileId, req) {
  const rows = await db.sql`
    SELECT "content_type", "kind", octet_length("data")::int AS total
    FROM social_media WHERE "id" = ${fileId} AND "data" IS NOT NULL LIMIT 1
  `
  if (!rows.length || !Number(rows[0].total)) return new Response('Not found', { status: 404 })

  const rangeHeader = req.headers.get('range')
  const total = Number(rows[0].total)
  const contentType = rows[0].content_type
    || (rows[0].kind === 'video' ? 'video/mp4' : 'application/octet-stream')
  if (req.method === 'HEAD' && !rangeHeader) {
    const full = { start: 0, end: total - 1, length: total, status: 200, total }
    return new Response(null, { status: 200, headers: mediaHeaders(contentType, full) })
  }
  const maxWindow = !rangeHeader && total <= STREAMED_RESPONSE_BYTES
    ? STREAMED_RESPONSE_BYTES
    : MEDIA_RESPONSE_BYTES
  const window = mediaByteWindow(total, rangeHeader, maxWindow)
  if (!window) {
    return new Response('Range Not Satisfiable', {
      status: 416,
      headers: {
        'Content-Range': `bytes */${Number(rows[0].total)}`,
        'Accept-Ranges': 'bytes',
        ...mediaSafetyHeaders(),
      },
    })
  }
  const headers = mediaHeaders(contentType, window)
  if (req.method === 'HEAD') return new Response(null, { status: window.status, headers })

  const chunks = await db.sql`
    SELECT encode(substring("data" from ${window.start + 1} for ${window.length}), 'base64') AS data_b64
    FROM social_media WHERE "id" = ${fileId} LIMIT 1
  `
  if (!chunks.length || !chunks[0].data_b64) return new Response('Not found', { status: 404 })
  const bytes = Buffer.from(chunks[0].data_b64, 'base64')
  const body = bytes.byteLength > MEDIA_RESPONSE_BYTES
    ? new ReadableStream({
        start(controller) {
          controller.enqueue(bytes)
          controller.close()
        },
      })
    : bytes
  return new Response(body, {
    status: window.status,
    headers,
  })
}

async function cleanupExpiredUploads(db) {
  try {
    await db.sql`DELETE FROM social_media_uploads WHERE "expires_at" < ${new Date().toISOString()}`
  } catch {
    // Cleanup is opportunistic. The upload being handled still receives its own
    // expiry check, so a cleanup failure never grants access to stale data.
  }
}

export function isMediaStorageQuotaError(error) {
  let current = error
  for (let depth = 0; current && depth < 5; depth += 1) {
    const message = String(current.message || '').toLowerCase()
    if (
      current.constraint === 'social_media_storage_quota_check'
      || (current.code === '23514' && message.includes('social media storage limit exceeded'))
      || message.includes('social_media_storage_quota_check')
    ) {
      return true
    }
    current = current.cause
  }
  return false
}

function mediaQuotaResponse() {
  return json({ error: 'Your media library has reached its 200 MB storage limit.' }, 413)
}

function chunkSessionPayload(row) {
  return {
    ok: true,
    uploadId: row.id,
    kind: row.kind,
    chunkSize: Number(row.chunk_size),
    totalChunks: Number(row.total_chunks),
    expiresAt: iso(row.expires_at),
  }
}

async function beginChunkedUpload(db, ownerId, body) {
  const described = describeMediaUpload({
    filename: body.filename,
    contentType: body.contentType,
    totalBytes: body.totalBytes,
  })
  if (!described.ok) return json({ error: described.error }, described.status)
  const media = described.value
  const suppliedId = str(body.clientUploadId, 120).trim().toLowerCase()
  if (suppliedId && !/^upload_[a-z0-9-]{16,100}$/.test(suppliedId)) {
    return json({ error: 'Upload identifier is invalid.' }, 400)
  }
  await cleanupExpiredUploads(db)
  const id = suppliedId || newId()
  const totalChunks = Math.ceil(media.totalBytes / MEDIA_CHUNK_BYTES)
  const now = new Date()
  const expiresAt = new Date(now.getTime() + UPLOAD_TTL_MS)

  const active = await db.sql`
    SELECT "id", "owner_id", "filename", "content_type", "kind", "total_bytes",
           "chunk_size", "total_chunks", "expires_at"
    FROM social_media_uploads WHERE "id" = ${id} LIMIT 1
  `
  if (active.length) {
    if (active[0].owner_id !== ownerId) {
      return json({ error: 'Upload identifier is already in use.' }, 409)
    }
    const sameUpload = active[0].filename === media.filename
      && active[0].content_type === media.contentType
      && Number(active[0].total_bytes) === media.totalBytes
    if (!sameUpload) return json({ error: 'Upload identifier was already used for a different file.' }, 409)
    return json(chunkSessionPayload(active[0]))
  }

  let inserted
  try {
    inserted = await db.sql`
      INSERT INTO social_media_uploads (
        "id", "owner_id", "filename", "content_type", "kind", "total_bytes",
        "chunk_size", "total_chunks", "created_at", "expires_at"
      ) VALUES (
        ${id}, ${ownerId}, ${media.filename}, ${media.contentType}, ${media.kind}, ${media.totalBytes},
        ${MEDIA_CHUNK_BYTES}, ${totalChunks}, ${now.toISOString()}, ${expiresAt.toISOString()}
      )
      ON CONFLICT ("id") DO NOTHING
      RETURNING "id", "kind", "chunk_size", "total_chunks", "expires_at"
    `
  } catch (error) {
    if (isMediaStorageQuotaError(error)) return mediaQuotaResponse()
    throw error
  }
  if (inserted.length) return json(chunkSessionPayload(inserted[0]), 201)

  const raced = await db.sql`
    SELECT "id", "owner_id", "filename", "content_type", "kind", "total_bytes",
           "chunk_size", "total_chunks", "expires_at"
    FROM social_media_uploads WHERE "id" = ${id} AND "owner_id" = ${ownerId} LIMIT 1
  `
  if (
    raced.length
    && raced[0].filename === media.filename
    && raced[0].content_type === media.contentType
    && Number(raced[0].total_bytes) === media.totalBytes
  ) {
    return json(chunkSessionPayload(raced[0]))
  }
  return json({ error: 'Upload identifier was already used for a different file.' }, 409)
}

async function readOwnedUpload(db, uploadId, ownerId) {
  const rows = await db.sql`
    SELECT "id", "owner_id", "filename", "content_type", "kind", "total_bytes",
           "chunk_size", "total_chunks", "created_at", "expires_at"
    FROM social_media_uploads WHERE "id" = ${uploadId} LIMIT 1
  `
  if (!rows.length) return { error: json({ error: 'Upload session not found or expired.' }, 404) }
  const upload = rows[0]
  if (upload.owner_id !== ownerId) return { error: json({ error: 'You can only continue your own upload.' }, 403) }
  if (Date.parse(iso(upload.expires_at)) <= Date.now()) {
    await db.sql`DELETE FROM social_media_uploads WHERE "id" = ${uploadId}`
    return { error: json({ error: 'Upload session expired. Choose the file again.' }, 410) }
  }
  return { upload }
}

async function storeUploadChunk(db, ownerId, req, url) {
  const uploadId = str(url.searchParams.get('uploadId'), 160)
  const chunkText = String(url.searchParams.get('chunk') || '')
  if (!uploadId || !/^\d+$/.test(chunkText)) return json({ error: 'Missing upload or chunk number.' }, 400)
  const chunkIndex = Number(chunkText)

  const owned = await readOwnedUpload(db, uploadId, ownerId)
  if (owned.error) return owned.error
  const upload = owned.upload
  const totalBytes = Number(upload.total_bytes)
  const chunkSize = Number(upload.chunk_size)
  const totalChunks = Number(upload.total_chunks)
  if (!Number.isSafeInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= totalChunks) {
    return json({ error: 'Chunk number is outside this upload.' }, 400)
  }

  const range = parseUploadContentRange(req.headers.get('content-range'))
  const expectedStart = chunkIndex * chunkSize
  const expectedLength = Math.min(chunkSize, totalBytes - expectedStart)
  const expectedEnd = expectedStart + expectedLength - 1
  if (!range || range.start !== expectedStart || range.end !== expectedEnd || range.total !== totalBytes) {
    return json({ error: 'Chunk range does not match this upload.' }, 409)
  }

  const declaredLength = Number(req.headers.get('content-length') || 0)
  if (declaredLength && declaredLength !== expectedLength) {
    return json({ error: 'Chunk length does not match its range.' }, 409)
  }
  if (declaredLength > MEDIA_CHUNK_BYTES) return json({ error: 'Chunk is too large.' }, 413)

  let bytes
  try {
    bytes = Buffer.from(await req.arrayBuffer())
  } catch {
    return json({ error: 'Could not read upload chunk.' }, 400)
  }
  if (bytes.byteLength !== expectedLength || bytes.byteLength > MEDIA_CHUNK_BYTES) {
    return json({ error: 'Chunk length does not match its range.' }, 409)
  }

  const dataBase64 = bytes.toString('base64')
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const now = new Date().toISOString()
  const inserted = await db.sql`
    INSERT INTO social_media_upload_chunks (
      "upload_id", "chunk_index", "data", "byte_length", "sha256", "created_at"
    )
    VALUES (${uploadId}, ${chunkIndex}, decode(${dataBase64}, 'base64'), ${bytes.byteLength}, ${sha256}, ${now})
    ON CONFLICT ("upload_id", "chunk_index") DO NOTHING
    RETURNING "sha256"
  `
  if (!inserted.length) {
    const existing = await db.sql`
      SELECT "byte_length", "sha256" FROM social_media_upload_chunks
      WHERE "upload_id" = ${uploadId} AND "chunk_index" = ${chunkIndex} LIMIT 1
    `
    if (
      !existing.length
      || Number(existing[0].byte_length) !== bytes.byteLength
      || existing[0].sha256 !== sha256
    ) {
      return json({ error: 'Chunk retry did not match the bytes already received.' }, 409)
    }
  }

  const createdAt = Date.parse(iso(upload.created_at))
  const refreshedExpiry = new Date(Math.min(
    Number.isFinite(createdAt) ? createdAt + UPLOAD_MAX_LIFETIME_MS : Date.now() + UPLOAD_TTL_MS,
    Date.now() + UPLOAD_TTL_MS,
  )).toISOString()
  await db.sql`
    UPDATE social_media_uploads SET "expires_at" = ${refreshedExpiry}
    WHERE "id" = ${uploadId} AND "owner_id" = ${ownerId}
  `
  return json({ ok: true, uploadId, chunkIndex, receivedBytes: bytes.byteLength })
}

async function finishChunkedUpload(db, ownerId, body) {
  const uploadId = str(body.uploadId, 160)
  if (!uploadId) return json({ error: 'Missing upload session.' }, 400)

  // The upload id becomes the media id. That makes finalization idempotent if a
  // client retries after the first successful response was lost.
  const completed = await db.sql`
    SELECT "id", "owner_id", "kind", "url", "caption", "filter"
    FROM social_media WHERE "id" = ${uploadId} LIMIT 1
  `
  if (completed.length) {
    if (completed[0].owner_id !== ownerId) return json({ error: 'You can only finish your own upload.' }, 403)
    return json({
      ok: true,
      id: completed[0].id,
      kind: completed[0].kind,
      url: completed[0].url,
      caption: completed[0].caption,
      filter: completed[0].filter,
    })
  }

  const owned = await readOwnedUpload(db, uploadId, ownerId)
  if (owned.error) return owned.error
  const upload = owned.upload
  const stats = await db.sql`
    SELECT COUNT(*)::int AS count, COALESCE(SUM("byte_length"), 0)::int AS bytes
    FROM social_media_upload_chunks WHERE "upload_id" = ${uploadId}
  `
  if (
    Number(stats[0] && stats[0].count) !== Number(upload.total_chunks)
    || Number(stats[0] && stats[0].bytes) !== Number(upload.total_bytes)
  ) {
    return json({ error: 'Upload is incomplete. Resume the remaining chunks first.' }, 409)
  }

  const url = mediaUrl(uploadId)
  const caption = str(body.caption, 300)
  const filter = str(body.filter, 40)
  const now = new Date().toISOString()
  let inserted
  try {
    inserted = await db.sql`
      INSERT INTO social_media (
        "id", "owner_id", "kind", "url", "caption", "filter", "content_type", "data", "created_at"
      )
      SELECT
        u."id", u."owner_id", u."kind", ${url}, ${caption}, ${filter}, u."content_type",
        string_agg(c."data", ''::bytea ORDER BY c."chunk_index"), ${now}
      FROM social_media_uploads AS u
      JOIN social_media_upload_chunks AS c ON c."upload_id" = u."id"
      WHERE u."id" = ${uploadId} AND u."owner_id" = ${ownerId}
      GROUP BY u."id", u."owner_id", u."kind", u."content_type"
      ON CONFLICT ("id") DO NOTHING
      RETURNING "id", "owner_id", "kind", "url", "caption", "filter"
    `
  } catch (error) {
    if (isMediaStorageQuotaError(error)) return mediaQuotaResponse()
    throw error
  }
  let stored = inserted[0]
  if (!stored) {
    const rows = await db.sql`
      SELECT "id", "owner_id", "kind", "url", "caption", "filter"
      FROM social_media WHERE "id" = ${uploadId} LIMIT 1
    `
    stored = rows[0]
  }
  if (!stored) {
    return json({ error: 'Upload changed before it could be finalized. Choose the file again.' }, 409)
  }
  if (stored.owner_id !== ownerId) return json({ error: 'You can only finish your own upload.' }, 403)
  await db.sql`DELETE FROM social_media_uploads WHERE "id" = ${uploadId}`
  return json({
    ok: true,
    id: stored.id,
    kind: stored.kind,
    url: stored.url,
    filter: stored.filter,
    caption: stored.caption,
  })
}

async function uploadDirect(db, ownerId, body) {
  const { filename, contentType, dataBase64 } = body
  if (!dataBase64 || typeof dataBase64 !== 'string') return json({ error: 'Missing file data' }, 400)

  // Reject before allocating a Buffer. The browser automatically uses chunked
  // transport above this threshold.
  if (Math.floor((dataBase64.length * 3) / 4) > DIRECT_UPLOAD_MAX_BYTES) {
    return json({ error: 'Large media must use the chunked upload path.' }, 413)
  }

  let buffer
  try {
    buffer = Buffer.from(dataBase64, 'base64')
  } catch {
    return json({ error: 'Could not decode file data' }, 400)
  }
  if (!buffer.byteLength) return json({ error: 'Empty file' }, 400)

  const described = describeMediaUpload({
    filename,
    contentType,
    totalBytes: buffer.byteLength,
  })
  if (!described.ok) return json({ error: described.error }, described.status)

  const media = described.value
  const id = newId()
  const url = mediaUrl(id)
  const caption = str(body.caption, 300)
  const filter = str(body.filter, 40)
  const cleanBase64 = buffer.toString('base64')
  const now = new Date().toISOString()
  try {
    await db.sql`
      INSERT INTO social_media ("id", "owner_id", "kind", "url", "caption", "filter", "content_type", "data", "created_at")
      VALUES (${id}, ${ownerId}, ${media.kind}, ${url}, ${caption}, ${filter}, ${media.contentType}, decode(${cleanBase64}, 'base64'), ${now})
    `
  } catch (error) {
    if (isMediaStorageQuotaError(error)) return mediaQuotaResponse()
    throw error
  }
  return json({ ok: true, id, kind: media.kind, url, filter, caption })
}

export default async (req) => {
  const db = getDatabase()
  const url = new URL(req.url)
  const fileId = url.searchParams.get('file')

  if ((req.method === 'GET' || req.method === 'HEAD') && fileId) {
    return serveStoredMedia(db, fileId, req)
  }

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

  if (req.method === 'POST' || req.method === 'PUT') {
    const session = await requireSession(req, db)
    if (session instanceof Response) return session
    const cross = requireSameOrigin(req)
    if (cross) return cross
    const ownerId = await ensureProfileForAccount(db, session)
    if (!ownerId) return json({ error: 'Your account has no community profile.' }, 400)
    if (req.method === 'PUT') return storeUploadChunk(db, ownerId, req, url)

    const body = await readJsonBody(req)
    if (body instanceof Response) return body
    if (body.action === 'initUpload') return beginChunkedUpload(db, ownerId, body)
    if (body.action === 'finishUpload') return finishChunkedUpload(db, ownerId, body)
    return uploadDirect(db, ownerId, body)
  }

  // Remove an item (owner only; an admin may remove any).
  if (req.method === 'DELETE') {
    const session = await requireSession(req, db)
    if (session instanceof Response) return session
    const cross = requireSameOrigin(req)
    if (cross) return cross
    const owner = await ensureProfileForAccount(db, session)
    if (!owner) return json({ error: 'Your account has no community profile.' }, 400)
    const uploadId = str(url.searchParams.get('uploadId'), 160)
    if (uploadId) {
      await db.sql`DELETE FROM social_media_uploads WHERE "id" = ${uploadId} AND "owner_id" = ${owner}`
      return json({ ok: true })
    }

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
