import { newId } from './session.mjs'

// Notification writer for the Bak'd On The Bay community, in the style of
// Facebook/Instagram. Every function that produces something a member should
// know about — a new direct or group message, a followed member's new post, a
// like/comment on their post, a new follower — calls in here to record it.
// These are in-site notifications only. Do not send message/comment email from
// this helper unless an explicit email delivery path and preference model is
// added.
//
// Two invariants make this safe to call from the request path:
//   • Best-effort. A notification write must never fail the action that caused it
//     (sending the message, publishing the post). Every write is wrapped so an
//     error is swallowed.
//   • Opt-out is honored at the source. Before inserting, the recipient's
//     preferences are consulted; a muted member, or one who disabled this
//     category, is simply never written a row — so opting out actually stops the
//     notification rather than just hiding it later.

const TYPES = new Set(['message', 'group', 'post', 'like', 'comment', 'follow'])

// Does this recipient want a notification of this type? Defaults to yes: a member
// with no preferences row (the common case) receives everything. Fails open on a
// read error so a database hiccup never silently drops notifications.
async function wants(db, recipientId, type) {
  try {
    const rows = await db.sql`SELECT "muted", "prefs" FROM notification_prefs WHERE "profile_id" = ${recipientId} LIMIT 1`
    if (!rows.length) return true
    if (rows[0].muted) return false
    let prefs = rows[0].prefs
    if (typeof prefs === 'string') { try { prefs = JSON.parse(prefs) } catch { prefs = {} } }
    // An absent key means the category is on; only an explicit `false` opts out.
    return !prefs || prefs[type] !== false
  } catch {
    return true
  }
}

// Insert a single notification, honoring the recipient's preferences. Never
// notifies a member of their own action (recipient === actor).
export async function createNotification(db, {
  recipientId, actorId, type, postId = '', messageId = '', body = '', link = '',
}) {
  if (!recipientId || !TYPES.has(type)) return
  if (recipientId === actorId) return
  if (!(await wants(db, recipientId, type))) return
  try {
    await db.sql`
      INSERT INTO notifications (
        "id", "recipient_id", "actor_id", "type", "post_id", "message_id", "body", "link", "read_at", "created_at"
      ) VALUES (
        ${newId('ntf_')}, ${recipientId}, ${actorId}, ${type}, ${postId}, ${messageId},
        ${String(body == null ? '' : body).slice(0, 200)}, ${link}, NULL, ${new Date().toISOString()}
      )
    `
  } catch { /* best-effort — a logging failure must not break the caller */ }
}

// Fan a new post out to everyone who follows its author. Capped so an unusually
// well-followed author can't turn one post into an unbounded write storm; the
// whole thing is best-effort and runs after the post itself is already saved.
export async function notifyFollowers(db, { authorId, postId, body = '', link = '' }) {
  if (!authorId) return
  try {
    const followers = await db.sql`
      SELECT "follower_id" FROM social_follows WHERE "followee_id" = ${authorId} LIMIT 500
    `
    for (const f of followers) {
      await createNotification(db, {
        recipientId: f.follower_id, actorId: authorId, type: 'post', postId, body, link,
      })
    }
  } catch { /* best-effort */ }
}
