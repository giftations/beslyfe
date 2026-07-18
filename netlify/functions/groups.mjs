import { getDatabase } from '@netlify/database'
import { requireSession, requireSameOrigin, newId, readJsonBody } from './lib/session.mjs'
import { createNotification } from './lib/notify.mjs'

// Member-created chat groups for the Beslyfe community. A group has an
// owner, a roster of member profiles and a stream of messages. Public groups are
// discoverable and anyone can join; private groups are invite-only (the owner
// adds members). Identity is a community profile id, same as the rest of the
// social platform.
//
//   GET  ?type=mine&me=ID                 → groups the member belongs to (+ last message)
//   GET  ?type=discover&me=ID             → public groups the member has not joined
//   GET  ?type=group&id=ID&me=ID          → one group, its members and recent messages
//   POST { kind:'create', ownerId, name, description, isPrivate }
//   POST { kind:'join', groupId, profileId }
//   POST { kind:'leave', groupId, profileId }
//   POST { kind:'add', groupId, ownerId, profileId }       (owner invites a member)
//   POST { kind:'message', groupId, senderId, body, mediaUrl }

const MAX_NAME = 120
const MAX_DESC = 600
const MAX_BODY = 4000
const MAX_URL = 1000

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

async function isMember(db, groupId, profileId) {
  if (!profileId) return false
  const rows = await db.sql`SELECT 1 FROM social_group_members WHERE group_id = ${groupId} AND profile_id = ${profileId} LIMIT 1`
  return rows.length > 0
}

function groupRow(r, memberCount) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    ownerId: r.owner_id,
    avatarUrl: r.avatar_url,
    isPrivate: r.is_private === 'true',
    createdAt: iso(r.created_at),
    memberCount: memberCount != null ? memberCount : (r.member_count || 0),
    lastMessage: r.last_body || '',
    lastAt: iso(r.last_at) || '',
  }
}

export default async (req) => {
  const db = getDatabase()
  const url = new URL(req.url)

  if (req.method === 'GET') {
    const session = await requireSession(req, db)
    if (session instanceof Response) return session
    const me = session.profileId
    const type = url.searchParams.get('type') || 'mine'
    if (!me) return json({ error: 'Your account has no community profile.' }, 400)

    if (type === 'group') {
      const id = url.searchParams.get('id')
      if (!id) return json({ error: 'Missing group id' }, 400)
      const grows = await db.sql`SELECT * FROM social_groups WHERE id = ${id} LIMIT 1`
      if (!grows.length) return json({ error: 'Group not found' }, 404)
      const group = grows[0]
      // Load the roster once and derive this viewer's membership from it, rather
      // than issuing a separate existence query — the members list is needed for
      // the response anyway, so this removes one round-trip per group open.
      const members = await db.sql`
        SELECT m.profile_id, m.role, m.joined_at, p.display_name, p.role AS profile_role, p.headshot_url
        FROM social_group_members m
        LEFT JOIN profiles p ON p.id = m.profile_id
        WHERE m.group_id = ${id}
        ORDER BY m.joined_at ASC
        LIMIT 500
      `
      const member = members.some((m) => m.profile_id === me)
      // Private groups only reveal their messages to members.
      if (group.is_private === 'true' && !member) {
        return json({ error: 'This is a private group.' }, 403)
      }
      const messages = await db.sql`
        SELECT gm.*, p.display_name AS sender_name, p.role AS sender_role, p.headshot_url AS sender_avatar
        FROM social_group_messages gm
        LEFT JOIN profiles p ON p.id = gm.sender_id
        WHERE gm.group_id = ${id}
        ORDER BY gm.created_at ASC
        LIMIT 500
      `
      return json({
        group: groupRow(group, members.length),
        isMember: member,
        members: members.map((m) => ({
          id: m.profile_id,
          role: m.role,
          displayName: m.display_name || 'Former member',
          profileRole: m.profile_role || '',
          headshotUrl: m.headshot_url || '',
        })),
        messages: messages.map((gm) => ({
          id: gm.id,
          groupId: gm.group_id,
          senderId: gm.sender_id,
          body: gm.body,
          mediaUrl: gm.media_url,
          mine: gm.sender_id === me,
          createdAt: iso(gm.created_at),
          sender: {
            id: gm.sender_id,
            displayName: gm.sender_name || 'Former member',
            role: gm.sender_role || '',
            headshotUrl: gm.sender_avatar || '',
          },
        })),
      })
    }

    if (type === 'discover') {
      // Public groups the member has not already joined.
      const rows = await db.sql`
        SELECT g.*,
          (SELECT COUNT(*)::int FROM social_group_members m WHERE m.group_id = g.id) AS member_count
        FROM social_groups g
        WHERE g.is_private = 'false'
          AND (${me}::text IS NULL OR NOT EXISTS (
            SELECT 1 FROM social_group_members m WHERE m.group_id = g.id AND m.profile_id = ${me}
          ))
        ORDER BY g.created_at DESC
        LIMIT 100
      `
      return json({ items: rows.map((r) => groupRow(r)) })
    }

    // Default: groups the member belongs to, with the latest message preview.
    if (!me) return json({ error: 'Missing profile id' }, 400)
    const rows = await db.sql`
      SELECT g.*,
        (SELECT COUNT(*)::int FROM social_group_members m WHERE m.group_id = g.id) AS member_count,
        (SELECT body FROM social_group_messages gm WHERE gm.group_id = g.id ORDER BY gm.created_at DESC LIMIT 1) AS last_body,
        (SELECT created_at FROM social_group_messages gm WHERE gm.group_id = g.id ORDER BY gm.created_at DESC LIMIT 1) AS last_at
      FROM social_groups g
      WHERE EXISTS (SELECT 1 FROM social_group_members m WHERE m.group_id = g.id AND m.profile_id = ${me})
      ORDER BY COALESCE(
        (SELECT created_at FROM social_group_messages gm WHERE gm.group_id = g.id ORDER BY gm.created_at DESC LIMIT 1),
        g.created_at
      ) DESC
      LIMIT 100
    `
    return json({ items: rows.map((r) => groupRow(r)) })
  }

  if (req.method === 'POST') {
    const session = await requireSession(req, db)
    if (session instanceof Response) return session
    const cross = requireSameOrigin(req)
    if (cross) return cross
    const actingId = session.profileId
    if (!actingId) return json({ error: 'Your account has no community profile.' }, 400)
    const body = await readJsonBody(req)
    if (body instanceof Response) return body
    const kind = body.kind

    if (kind === 'create') {
      const ownerId = actingId
      const name = str(body.name, MAX_NAME).trim()
      if (!name) return json({ error: 'Give your group a name.' }, 400)
      const description = str(body.description, MAX_DESC)
      const isPrivate = body.isPrivate ? 'true' : 'false'
      const id = newId()
      const now = new Date().toISOString()
      await db.sql`
        INSERT INTO social_groups ("id", "name", "description", "owner_id", "avatar_url", "is_private", "created_at")
        VALUES (${id}, ${name}, ${description}, ${ownerId}, ${''}, ${isPrivate}, ${now})
      `
      await db.sql`
        INSERT INTO social_group_members ("group_id", "profile_id", "role", "joined_at")
        VALUES (${id}, ${ownerId}, 'owner', ${now})
        ON CONFLICT ("group_id", "profile_id") DO NOTHING
      `
      return json({ ok: true, id })
    }

    if (kind === 'join') {
      const groupId = str(body.groupId, 100)
      const profileId = actingId
      if (!groupId) return json({ error: 'Missing group.' }, 400)
      const grows = await db.sql`SELECT is_private FROM social_groups WHERE id = ${groupId} LIMIT 1`
      if (!grows.length) return json({ error: 'Group not found.' }, 404)
      if (grows[0].is_private === 'true') return json({ error: 'This group is invite-only.' }, 403)
      await db.sql`
        INSERT INTO social_group_members ("group_id", "profile_id", "role", "joined_at")
        VALUES (${groupId}, ${profileId}, 'member', ${new Date().toISOString()})
        ON CONFLICT ("group_id", "profile_id") DO NOTHING
      `
      return json({ ok: true })
    }

    if (kind === 'add') {
      // The owner adds a member (works for private groups).
      const groupId = str(body.groupId, 100)
      const ownerId = actingId
      const profileId = str(body.profileId, 100)
      if (!groupId || !profileId) return json({ error: 'Missing group or profile.' }, 400)
      const grows = await db.sql`SELECT owner_id FROM social_groups WHERE id = ${groupId} LIMIT 1`
      if (!grows.length) return json({ error: 'Group not found.' }, 404)
      if (grows[0].owner_id !== ownerId) return json({ error: 'Only the group owner can add members.' }, 403)
      const exists = await db.sql`SELECT id FROM profiles WHERE id = ${profileId} LIMIT 1`
      if (!exists.length) return json({ error: 'That profile no longer exists.' }, 404)
      await db.sql`
        INSERT INTO social_group_members ("group_id", "profile_id", "role", "joined_at")
        VALUES (${groupId}, ${profileId}, 'member', ${new Date().toISOString()})
        ON CONFLICT ("group_id", "profile_id") DO NOTHING
      `
      return json({ ok: true })
    }

    if (kind === 'leave') {
      const groupId = str(body.groupId, 100)
      const profileId = actingId
      if (!groupId) return json({ error: 'Missing group.' }, 400)
      // The owner leaving deletes the group and its messages.
      const grows = await db.sql`SELECT owner_id FROM social_groups WHERE id = ${groupId} LIMIT 1`
      if (grows.length && grows[0].owner_id === profileId) {
        // Delete messages, members and the group itself in a single statement so
        // the removal is atomic: a mid-way failure can no longer leave orphaned
        // messages or memberships pointing at a group that is already gone. In
        // Postgres one statement runs in its own implicit transaction, so either
        // every branch of this CTE commits or none of it does.
        await db.sql`
          WITH deleted_messages AS (
            DELETE FROM social_group_messages WHERE group_id = ${groupId}
          ), deleted_members AS (
            DELETE FROM social_group_members WHERE group_id = ${groupId}
          )
          DELETE FROM social_groups WHERE id = ${groupId}
        `
        return json({ ok: true, deleted: true })
      }
      await db.sql`DELETE FROM social_group_members WHERE group_id = ${groupId} AND profile_id = ${profileId}`
      return json({ ok: true })
    }

    if (kind === 'message') {
      const groupId = str(body.groupId, 100)
      const senderId = actingId
      const text = str(body.body, MAX_BODY).trim()
      const mediaUrl = str(body.mediaUrl, MAX_URL)
      if (!groupId) return json({ error: 'Missing group.' }, 400)
      if (!text && !mediaUrl) return json({ error: 'Write a message first.' }, 400)
      if (!(await isMember(db, groupId, senderId))) return json({ error: 'Join the group to send messages.' }, 403)
      const id = newId()
      const now = new Date().toISOString()
      await db.sql`
        INSERT INTO social_group_messages ("id", "group_id", "sender_id", "body", "media_url", "created_at")
        VALUES (${id}, ${groupId}, ${senderId}, ${text}, ${mediaUrl}, ${now})
      `
      // Notify the group's other members (best-effort, honoring their prefs). The
      // group name gives the preview context, and the link opens Groups.
      try {
        const grow = await db.sql`SELECT name FROM social_groups WHERE id = ${groupId} LIMIT 1`
        const groupName = grow.length ? grow[0].name : 'a group'
        const preview = text || (mediaUrl ? '📎 Attachment' : '')
        const members = await db.sql`
          SELECT profile_id FROM social_group_members WHERE group_id = ${groupId} AND profile_id <> ${senderId} LIMIT 500
        `
        for (const m of members) {
          await createNotification(db, {
            recipientId: m.profile_id, actorId: senderId, type: 'group',
            body: `in ${groupName}: ${preview}`, link: '/groups',
          })
        }
      } catch { /* best-effort */ }
      return json({ ok: true, id, createdAt: now })
    }

    return json({ error: 'Unknown action' }, 400)
  }

  return json({ error: 'Method Not Allowed' }, 405)
}
