import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import {
  DIRECT_UPLOAD_MAX_BYTES,
  MAX_VIDEO_BYTES,
  MEDIA_CHUNK_BYTES,
  STREAMED_RESPONSE_BYTES,
  describeMediaUpload,
  isMediaStorageQuotaError,
  mediaByteWindow,
  parseUploadContentRange,
} from '../netlify/functions/media-library.mjs'

const source = fs.readFileSync('netlify/functions/media-library.mjs', 'utf8')
const schema = fs.readFileSync('db/schema.ts', 'utf8')
const migration = fs.readFileSync(
  'netlify/database/migrations/20260724020000_create_social_media_uploads/migration.sql',
  'utf8',
)
const cleanupSource = fs.readFileSync('netlify/functions/media-upload-cleanup.mjs', 'utf8')

test('chunked upload descriptors allow supported videos without an image', () => {
  const video = describeMediaUpload({
    filename: 'reel.mp4',
    contentType: 'video/mp4',
    totalBytes: 12 * 1024 * 1024,
  })
  assert.equal(video.ok, true)
  assert.equal(video.value.kind, 'video')

  assert.equal(describeMediaUpload({
    filename: 'reel.mp4',
    contentType: 'video/mp4',
    totalBytes: MAX_VIDEO_BYTES + 1,
  }).status, 413)
  assert.equal(describeMediaUpload({
    filename: 'payload.html',
    contentType: 'text/html',
    totalBytes: 100,
  }).ok, false)
  assert.ok(DIRECT_UPLOAD_MAX_BYTES < MAX_VIDEO_BYTES)
})

test('chunk ranges are strict and remain below the host request ceiling', () => {
  assert.equal(MEDIA_CHUNK_BYTES, 2 * 1024 * 1024)
  assert.deepEqual(parseUploadContentRange('bytes 0-99/200'), { start: 0, end: 99, total: 200 })
  assert.equal(parseUploadContentRange('bytes 0-200/200'), null)
  assert.equal(parseUploadContentRange('not-a-range'), null)
})

test('media responses are bounded and preserve range semantics', () => {
  assert.deepEqual(mediaByteWindow(100, 'bytes=10-19'), {
    start: 10,
    end: 19,
    length: 10,
    status: 206,
    total: 100,
  })
  const bounded = mediaByteWindow(12 * 1024 * 1024, '')
  assert.equal(bounded, null)
  const streamed = mediaByteWindow(8 * 1024 * 1024, '', STREAMED_RESPONSE_BYTES)
  assert.equal(streamed.status, 200)
  assert.equal(streamed.length, 8 * 1024 * 1024)
  assert.equal(mediaByteWindow(100, 'bytes=200-300'), null)
})

test('chunk staging is session-owned, expiring, idempotent, and assembled in the database', () => {
  assert.match(source, /requireSession\(req, db\)/)
  assert.match(source, /ensureProfileForAccount\(db, session\)/)
  assert.match(source, /requireSameOrigin\(req\)/)
  assert.match(source, /"expires_at" < /)
  assert.match(source, /"owner_id" = \$\{ownerId\}/)
  assert.match(source, /createHash\('sha256'\)/)
  assert.match(source, /ON CONFLICT \("upload_id", "chunk_index"\) DO NOTHING/)
  assert.match(source, /string_agg\(c\."data", ''::bytea ORDER BY c\."chunk_index"\)/)
  assert.match(source, /Large media must use the chunked upload path/)
  assert.match(source, /RETURNING "id", "owner_id", "kind", "url", "caption", "filter"/)
})

test('chunked upload tables cascade temporary chunks and carry cleanup indexes', () => {
  assert.match(schema, /socialMediaUploads = pgTable\("social_media_uploads"/)
  assert.match(schema, /socialMediaUploadChunks = pgTable\("social_media_upload_chunks"/)
  assert.match(schema, /socialMediaStorageUsage = pgTable\("social_media_storage_usage"/)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "social_media_uploads"/)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "social_media_upload_chunks"/)
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "social_media_storage_usage"/)
  assert.match(migration, /ON DELETE CASCADE/)
  assert.match(migration, /social_media_uploads_owner_idx/)
  assert.doesNotMatch(migration, /social_media_uploads_owner_unique/)
  assert.match(migration, /social_media_uploads_expires_idx/)
  assert.match(migration, /"sha256" text DEFAULT '' NOT NULL/)
  assert.match(cleanupSource, /schedule: '@hourly'/)
  assert.match(cleanupSource, /DELETE FROM social_media_uploads/)
})

test('owner quota is atomically reserved and released by database triggers', () => {
  assert.doesNotMatch(source, /ownerStoredMediaBytes/)
  assert.match(migration, /LOCK TABLE "social_media", "social_media_uploads" IN SHARE ROW EXCLUSIVE MODE/)
  assert.match(migration, /"used_bytes" \+ "reserved_bytes" <= "quota_bytes"/)
  assert.match(migration, /CREATE TRIGGER "social_media_upload_storage_reserve"[\s\S]*AFTER INSERT ON "social_media_uploads"/)
  assert.match(migration, /CREATE TRIGGER "social_media_upload_storage_release"[\s\S]*AFTER DELETE ON "social_media_uploads"/)
  assert.match(migration, /CREATE TRIGGER "social_media_storage_account"[\s\S]*AFTER INSERT ON "social_media"/)
  assert.match(migration, /DELETE FROM "social_media_uploads"[\s\S]*WHERE "id" = NEW\."id"/)
  assert.match(migration, /RAISE EXCEPTION 'social media storage limit exceeded'/)
})

test('parallel uploads from one owner do not delete or replace each other', () => {
  assert.match(source, /FROM social_media_uploads WHERE "id" = \$\{id\} LIMIT 1/)
  assert.match(source, /ON CONFLICT \("id"\) DO NOTHING/)
  assert.doesNotMatch(source, /DELETE FROM social_media_uploads WHERE "owner_id" = \$\{ownerId\}/)
})

test('database quota violations map to a safe 413 response path', () => {
  assert.equal(isMediaStorageQuotaError({
    code: '23514',
    message: 'social media storage limit exceeded',
  }), true)
  assert.equal(isMediaStorageQuotaError({
    cause: { constraint: 'social_media_storage_quota_check' },
  }), true)
  assert.equal(isMediaStorageQuotaError(new Error('database unavailable')), false)
})
