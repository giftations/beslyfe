import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

import { resolveOwnedGroupMedia } from '../netlify/functions/groups.mjs'
import { resolveOwnedMessageMedia } from '../netlify/functions/messages.mjs'

const schema = fs.readFileSync('db/schema.ts', 'utf8')
const groupsApi = fs.readFileSync('netlify/functions/groups.mjs', 'utf8')
const messagesApi = fs.readFileSync('netlify/functions/messages.mjs', 'utf8')
const groupsClient = fs.readFileSync('groups.js', 'utf8')
const migration = fs.readFileSync(
  'netlify/database/migrations/20260724010000_add_group_message_media_kind/migration.sql',
  'utf8',
)

test('group messages store media kind and backfill existing library attachments', () => {
  assert.match(schema, /mediaKind:\s*text\("media_kind"\)\.notNull\(\)\.default\(""\)/)
  assert.match(
    migration,
    /ALTER TABLE "social_group_messages"\s+ADD COLUMN IF NOT EXISTS "media_kind" text DEFAULT '' NOT NULL;/,
  )
  assert.match(migration, /FROM "social_media" AS sm/)
  assert.match(migration, /CREATE INDEX IF NOT EXISTS "social_media_url_idx"/)
  assert.match(schema, /index\("social_media_url_idx"\)\.on\(t\.url\)/)
  assert.match(migration, /gm\."media_url" = sm\."url"/)
  assert.match(migration, /sm\."kind" IN \('image', 'video'\)/)
})

test('group and direct-message APIs persist authoritative sender-owned media', () => {
  assert.match(groupsApi, /mediaKind: resolveMediaKind\(gm\.media_kind, gm\.media_url\)/)
  assert.match(groupsApi, /const media = await resolveOwnedGroupMedia\(db, mediaUrl, senderId\)/)
  assert.match(
    groupsApi,
    /INSERT INTO social_group_messages \("id", "group_id", "sender_id", "body", "media_url", "media_kind", "created_at"\)/,
  )
  assert.match(messagesApi, /const media = await resolveOwnedMessageMedia\(db, mediaUrl, senderId\)/)
  assert.match(messagesApi, /media\.mediaUrl/)
  assert.match(messagesApi, /media\.mediaKind/)
})

test('opaque video URLs resolve from the sender-owned library row', async () => {
  const opaqueUrl = '/.netlify/functions/media-library?file=media_1'
  const db = {
    async sql(strings, ...values) {
      assert.match(strings.join('?'), /FROM social_media/)
      assert.equal(values[0], opaqueUrl)
      return [{ owner_id: 'profile_1', kind: 'video', url: opaqueUrl }]
    },
  }

  const expected = {
    ok: true,
    mediaUrl: opaqueUrl,
    mediaKind: 'video',
  }
  assert.deepEqual(await resolveOwnedGroupMedia(db, opaqueUrl, 'profile_1'), expected)
  assert.deepEqual(await resolveOwnedMessageMedia(db, opaqueUrl, 'profile_1'), expected)
  assert.equal((await resolveOwnedGroupMedia(db, opaqueUrl, 'profile_2')).status, 403)
  assert.equal((await resolveOwnedMessageMedia(db, opaqueUrl, 'profile_2')).status, 403)
})

test('groups client sends upload kind and renders it before a legacy URL extension', () => {
  assert.match(groupsClient, /mediaKind: d\.kind/)
  assert.match(groupsClient, /mediaKind: media\.mediaKind/)
  assert.match(
    groupsClient,
    /var mediaKind = m\.mediaKind === 'video' \|\| m\.mediaKind === 'image'/,
  )
  assert.match(groupsClient, /media = mediaKind === 'video'/)
  new vm.Script(groupsClient, { filename: 'groups.js' })
})
