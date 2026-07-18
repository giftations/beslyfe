import { getDatabase } from '@netlify/database'
import { readSession, requireSession, requireSameOrigin, newId, isLiveAdmin, ensureProfileForAccount, json } from './lib/session.mjs'
import { createNotification, notifyFollowers } from './lib/notify.mjs'

// Shared Beslyfe social network. Profiles are durable identities across every
// business, website, event, creator, nonprofit, and community ecosystem. Public
// contributions flow into one network feed while preserving their ecosystem
// origin; followers-only, ecosystem-only, and private content keep their bounds.
//
//   GET  ?type=feed[&author=ID][&viewer=ID]   → recent posts and reels (optionally one author's)
//   GET  ?type=reels[&viewer=ID]              → short videos for the reels player
//   GET  ?type=stories                        → non-expired stories (24h)
//   GET  ?type=comments&postId=ID             → comments for a post
//   GET  ?type=stats&profileId=ID[&viewer=ID] → follower / following / post counts
//   POST { kind:'post', authorId, body, imageUrl, videoUrl, postType, filter, music, visibility, location }
//   POST { kind:'comment', postId, authorId, body }
//   POST { kind:'like', postId, profileId }
//   POST { kind:'follow', followerId, followeeId }
//   DELETE ?kind=like&postId=ID&profileId=ID
//   DELETE ?kind=follow&followerId=ID&followeeId=ID
//   DELETE ?kind=post&id=ID&profileId=ID       (author may delete their own post)

const MAX_BODY = 2000
const MAX_URL = 1000

// Allowed enumerations for the widened post model.
const POST_TYPES = new Set(['post', 'reel', 'story'])
const VISIBILITIES = new Set(['public', 'ecosystem', 'followers', 'private'])

// Reduce an arbitrary location payload to a safe { lat, lng, label, visibility }
// map. Coordinates are kept as bounded strings; an empty map means "no place".
function sanitizeLocation(loc) {
  if (!loc || typeof loc !== 'object') return {}
  const lat = String(loc.lat == null ? '' : loc.lat).slice(0, 32)
  const lng = String(loc.lng == null ? '' : loc.lng).slice(0, 32)
  if (!lat || !lng) return {}
  return {
    lat,
    lng,
    label: String(loc.label == null ? '' : loc.label).slice(0, 160),
    visibility: VISIBILITIES.has(loc.visibility) ? loc.visibility : 'public',
  }
}

function str(value, max) {
  if (value === null || value === undefined) return ''
  return String(value).slice(0, max)
}

function iso(value) {
  return value instanceof Date ? value.toISOString() : value
}

function postRow(row) {
  let location = row.location
  if (typeof location === 'string') {
    try { location = JSON.parse(location) } catch { location = {} }
  }
  return {
    id: row.id,
    authorId: row.author_id,
    body: row.body,
    imageUrl: row.image_url,
    postType: row.post_type || 'post',
    videoUrl: row.video_url || '',
    filter: row.filter || '',
    music: row.music || '',
    visibility: row.visibility || 'public',
    ecosystem: {
      id: row.ecosystem_id || 'beslyfe-network',
      name: row.ecosystem_name || 'Beslyfe Community',
      slug: row.ecosystem_slug || 'beslyfe-network',
      proof: row.ecosystem_id === 'proof-bakd-on-the-bay',
    },
    location: location || {},
    expiresAt: iso(row.expires_at),
    createdAt: iso(row.created_at),
    author: {
      id: row.author_id,
      displayName: row.author_name || 'Former member',
      role: row.author_role || '',
      headshotUrl: row.author_avatar || '',
    },
    likeCount: row.like_count || 0,
    commentCount: row.comment_count || 0,
    liked: !!row.liked,
  }
}

export default async (req) => {
  const db = getDatabase()
  const url = new URL(req.url)

  // ── Reads ──
  if (req.method === 'GET') {
    const type = url.searchParams.get('type') || 'feed'
    // "Viewer" — whose like/follow state to reflect — is always the signed-in
    // profile, never a client-supplied id, so nobody can probe another member's
    // followers-only posts by passing their id.
    const session = await readSession(req, db)
    const viewer = session ? session.profileId : null

    if (type === 'comments') {
      const postId = url.searchParams.get('postId')
      if (!postId) return json({ error: 'Missing postId' }, 400)
      const post = await db.sql`
        SELECT author_id, visibility, ecosystem_id
        FROM social_posts WHERE id = ${postId} LIMIT 1
      `
      if (!post.length) return json({ error: 'That post no longer exists.' }, 404)
      const boundary = post[0].visibility || 'public'
      let mayRead = boundary === 'public' || (viewer && viewer === post[0].author_id)
      if (!mayRead && viewer && boundary === 'followers') {
        const follows = await db.sql`
          SELECT 1 FROM social_follows
          WHERE follower_id = ${viewer} AND followee_id = ${post[0].author_id}
          LIMIT 1
        `
        mayRead = follows.length > 0
      }
      if (!mayRead && viewer && boundary === 'ecosystem') {
        const memberships = await db.sql`
          SELECT 1 FROM ecosystem_memberships
          WHERE ecosystem_id = ${post[0].ecosystem_id || 'beslyfe-network'}
            AND profile_id = ${viewer} AND status = 'active'
          LIMIT 1
        `
        mayRead = memberships.length > 0
      }
      if (!mayRead) return json({ error: 'This conversation is not in your audience.' }, 403)
      const rows = await db.sql`
        SELECT c.*, p.display_name AS author_name, p.role AS author_role, p.headshot_url AS author_avatar
        FROM social_comments c
        LEFT JOIN profiles p ON p.id = c.author_id
        WHERE c.post_id = ${postId}
        ORDER BY c.created_at ASC
        LIMIT 200
      `
      const items = rows.map((r) => ({
        id: r.id,
        postId: r.post_id,
        authorId: r.author_id,
        body: r.body,
        createdAt: iso(r.created_at),
        author: {
          id: r.author_id,
          displayName: r.author_name || 'Former member',
          role: r.author_role || '',
          headshotUrl: r.author_avatar || '',
        },
      }))
      return json({ items })
    }

    if (type === 'stats') {
      const profileId = url.searchParams.get('profileId')
      if (!profileId) return json({ error: 'Missing profileId' }, 400)
      const followers = await db.sql`SELECT COUNT(*)::int AS n FROM social_follows WHERE followee_id = ${profileId}`
      const following = await db.sql`SELECT COUNT(*)::int AS n FROM social_follows WHERE follower_id = ${profileId}`
      const posts = await db.sql`SELECT COUNT(*)::int AS n FROM social_posts WHERE author_id = ${profileId}`
      let isFollowing = false
      if (viewer && viewer !== profileId) {
        const rows = await db.sql`SELECT 1 FROM social_follows WHERE follower_id = ${viewer} AND followee_id = ${profileId} LIMIT 1`
        isFollowing = rows.length > 0
      }
      return json({
        followers: followers[0].n,
        following: following[0].n,
        posts: posts[0].n,
        isFollowing,
      })
    }

    // Default: the feed. `type` selects the format:
    //   feed    → regular posts and reels (the home timeline)
    //   reels   → short videos only, for the vertical player
    //   stories → non-expired stories, newest first (grouped by author client-side)
    // An optional ?author=ID narrows to one member's own posts and reels.
    const author = url.searchParams.get('author')
    const nowIso = new Date().toISOString()
    let rows
    // Like and comment counts are pre-aggregated once per table (a grouped
    // subquery joined by post_id) rather than recomputed per row with correlated
    // subqueries, so the feed costs two aggregate scans instead of 2×N.
    if (type === 'reels') {
      rows = await db.sql`
        SELECT p.*, pr.display_name AS author_name, pr.role AS author_role, pr.headshot_url AS author_avatar,
          e.name AS ecosystem_name, e.slug AS ecosystem_slug,
          COALESCE(lc.n, 0) AS like_count, COALESCE(cc.n, 0) AS comment_count
        FROM social_posts p
        LEFT JOIN profiles pr ON pr.id = p.author_id
        LEFT JOIN ecosystems e ON e.id = p.ecosystem_id
        LEFT JOIN (SELECT post_id, COUNT(*)::int AS n FROM social_likes GROUP BY post_id) lc ON lc.post_id = p.id
        LEFT JOIN (SELECT post_id, COUNT(*)::int AS n FROM social_comments GROUP BY post_id) cc ON cc.post_id = p.id
        WHERE p.post_type = 'reel'
        ORDER BY p.created_at DESC
        LIMIT 100
      `
    } else if (type === 'stories') {
      rows = await db.sql`
        SELECT p.*, pr.display_name AS author_name, pr.role AS author_role, pr.headshot_url AS author_avatar,
          e.name AS ecosystem_name, e.slug AS ecosystem_slug,
          0 AS like_count, 0 AS comment_count
        FROM social_posts p
        LEFT JOIN profiles pr ON pr.id = p.author_id
        LEFT JOIN ecosystems e ON e.id = p.ecosystem_id
        WHERE p.post_type = 'story' AND (p.expires_at IS NULL OR p.expires_at > ${nowIso})
        ORDER BY p.created_at DESC
        LIMIT 200
      `
    } else if (author) {
      rows = await db.sql`
        SELECT p.*, pr.display_name AS author_name, pr.role AS author_role, pr.headshot_url AS author_avatar,
          e.name AS ecosystem_name, e.slug AS ecosystem_slug,
          COALESCE(lc.n, 0) AS like_count, COALESCE(cc.n, 0) AS comment_count
        FROM social_posts p
        LEFT JOIN profiles pr ON pr.id = p.author_id
        LEFT JOIN ecosystems e ON e.id = p.ecosystem_id
        LEFT JOIN (SELECT post_id, COUNT(*)::int AS n FROM social_likes GROUP BY post_id) lc ON lc.post_id = p.id
        LEFT JOIN (SELECT post_id, COUNT(*)::int AS n FROM social_comments GROUP BY post_id) cc ON cc.post_id = p.id
        WHERE p.author_id = ${author} AND p.post_type IN ('post', 'reel')
        ORDER BY p.created_at DESC
        LIMIT 100
      `
    } else {
      rows = await db.sql`
        SELECT p.*, pr.display_name AS author_name, pr.role AS author_role, pr.headshot_url AS author_avatar,
          e.name AS ecosystem_name, e.slug AS ecosystem_slug,
          COALESCE(lc.n, 0) AS like_count, COALESCE(cc.n, 0) AS comment_count
        FROM social_posts p
        LEFT JOIN profiles pr ON pr.id = p.author_id
        LEFT JOIN ecosystems e ON e.id = p.ecosystem_id
        LEFT JOIN (SELECT post_id, COUNT(*)::int AS n FROM social_likes GROUP BY post_id) lc ON lc.post_id = p.id
        LEFT JOIN (SELECT post_id, COUNT(*)::int AS n FROM social_comments GROUP BY post_id) cc ON cc.post_id = p.id
        WHERE p.post_type IN ('post', 'reel')
        ORDER BY p.created_at DESC
        LIMIT 100
      `
    }

    // Mark which posts the viewer has liked. Fetch the viewer's likes and
    // intersect in JS to avoid relying on array-parameter binding.
    let likedSet = new Set()
    if (viewer && rows.length) {
      const liked = await db.sql`SELECT post_id FROM social_likes WHERE profile_id = ${viewer}`
      likedSet = new Set(liked.map((r) => r.post_id))
    }

    // Visibility: public posts join the shared network; ecosystem posts stay
    // inside that ecosystem; followers posts follow the social graph; private
    // posts are visible only to their author.
    let followingSet = null
    const needsFollow = rows.some((r) => (r.visibility || 'public') === 'followers' && r.author_id !== viewer)
    if (viewer && needsFollow) {
      const f = await db.sql`SELECT followee_id FROM social_follows WHERE follower_id = ${viewer}`
      followingSet = new Set(f.map((r) => r.followee_id))
    }
    let ecosystemSet = new Set()
    if (viewer && rows.some((r) => (r.visibility || 'public') === 'ecosystem')) {
      const memberships = await db.sql`
        SELECT ecosystem_id FROM ecosystem_memberships
        WHERE profile_id = ${viewer} AND status = 'active'
      `
      ecosystemSet = new Set(memberships.map((r) => r.ecosystem_id))
    }
    const visible = rows.filter((r) => {
      const v = r.visibility || 'public'
      if (v === 'public') return true
      if (r.author_id && r.author_id === viewer) return true
      if (v === 'ecosystem') return ecosystemSet.has(r.ecosystem_id || 'beslyfe-network')
      if (v === 'followers') return followingSet ? followingSet.has(r.author_id) : false
      return false
    })

    const items = visible.map((r) => postRow({ ...r, liked: likedSet.has(r.id) }))
    return json({ items })
  }

  // ── Writes ──
  if (req.method === 'POST') {
    const session = await requireSession(req, db)
    if (session instanceof Response) return session
    const cross = requireSameOrigin(req)
    if (cross) return cross
    // Every signed-in member acts as a community profile. Accounts that don't yet
    // have one (e.g. an admin, or a member whose profile was removed) get one
    // created and linked on the spot, so nobody is turned away with "your account
    // has no community profile" when they try to take part.
    const actingId = await ensureProfileForAccount(db, session)
    if (!actingId) return json({ error: 'Your account has no community profile.' }, 400)
    let body
    try {
      body = await req.json()
    } catch {
      return json({ error: 'Invalid JSON' }, 400)
    }
    if (!body || typeof body !== 'object') return json({ error: 'Expected a JSON object' }, 400)
    const kind = body.kind

    if (kind === 'post') {
      const authorId = actingId
      const text = str(body.body, MAX_BODY).trim()
      const imageUrl = str(body.imageUrl, MAX_URL)
      const videoUrl = str(body.videoUrl, MAX_URL)
      const postType = POST_TYPES.has(body.postType) ? body.postType : 'post'
      const filter = str(body.filter, 40)
      const music = str(body.music, 60)
      const visibility = VISIBILITIES.has(body.visibility) ? body.visibility : 'public'
      const location = sanitizeLocation(body.location)
      let ecosystemId = str(body.ecosystemId, 100) || 'beslyfe-network'
      if (ecosystemId !== 'beslyfe-network') {
        const member = await db.sql`
          SELECT 1 FROM ecosystem_memberships
          WHERE ecosystem_id = ${ecosystemId} AND profile_id = ${actingId} AND status = 'active'
          LIMIT 1
        `
        if (!member.length) ecosystemId = 'beslyfe-network'
      }
      if (!text && !imageUrl && !videoUrl) return json({ error: 'Write something or add a photo or video.' }, 400)
      if (postType === 'reel' && !videoUrl) return json({ error: 'A reel needs a video.' }, 400)
      const id = newId()
      const now = new Date().toISOString()
      // Stories disappear automatically after 24 hours.
      const expiresAt = postType === 'story' ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null
      await db.sql`
        INSERT INTO social_posts (
          "id", "ecosystem_id", "author_id", "body", "image_url", "video_url", "post_type",
          "filter", "music", "visibility", "location", "expires_at", "created_at"
        ) VALUES (
          ${id}, ${ecosystemId}, ${authorId}, ${text}, ${imageUrl}, ${videoUrl}, ${postType},
          ${filter}, ${music}, ${visibility}, ${JSON.stringify(location)}::jsonb, ${expiresAt}, ${now}
        )
      `
      // Tell the author's followers about a new post (not private ones, and not
      // ephemeral stories — those belong in the stories tray, not the inbox).
      if (visibility !== 'private' && postType !== 'story') {
        const link = postType === 'reel' ? '/reels' : '/feed'
        await notifyFollowers(db, { authorId, postId: id, body: text || 'shared a new post', link })
      }
      // Hand back the acting profile so the client can adopt it as the visitor's
      // identity — this is how an account that just had a profile auto-created
      // (e.g. an admin's first post) starts showing the right "posting as".
      const who = await db.sql`SELECT "id", "display_name", "role", "headshot_url" FROM profiles WHERE "id" = ${authorId} LIMIT 1`
      const author = who[0] ? {
        id: who[0].id,
        displayName: who[0].display_name || '',
        role: who[0].role || '',
        headshotUrl: who[0].headshot_url || '',
      } : null
      return json({ ok: true, id, author })
    }

    if (kind === 'comment') {
      const postId = str(body.postId, 100)
      const authorId = actingId
      const text = str(body.body, MAX_BODY).trim()
      if (!postId) return json({ error: 'Missing post.' }, 400)
      if (!text) return json({ error: 'Write a comment first.' }, 400)
      // The post being commented on must exist.
      const exists = await db.sql`SELECT author_id FROM social_posts WHERE id = ${postId} LIMIT 1`
      if (!exists.length) return json({ error: 'That post no longer exists.' }, 404)
      const id = newId()
      const now = new Date().toISOString()
      await db.sql`
        INSERT INTO social_comments ("id", "post_id", "author_id", "body", "created_at")
        VALUES (${id}, ${postId}, ${authorId}, ${text}, ${now})
      `
      // Notify the post's author that someone commented (unless commenting on
      // their own post).
      await createNotification(db, {
        recipientId: exists[0].author_id, actorId: authorId, type: 'comment',
        postId, body: text, link: '/feed',
      })
      return json({ ok: true, id })
    }

    if (kind === 'like') {
      const postId = str(body.postId, 100)
      const profileId = actingId
      if (!postId) return json({ error: 'Missing post.' }, 400)
      const exists = await db.sql`SELECT author_id FROM social_posts WHERE id = ${postId} LIMIT 1`
      if (!exists.length) return json({ error: 'That post no longer exists.' }, 404)
      // Idempotent: a repeat like is ignored. RETURNING tells us whether this call
      // actually created the like, so the author is notified once — not again every
      // time the same person taps like.
      const inserted = await db.sql`
        INSERT INTO social_likes ("post_id", "profile_id", "created_at")
        VALUES (${postId}, ${profileId}, ${new Date().toISOString()})
        ON CONFLICT ("post_id", "profile_id") DO NOTHING
        RETURNING post_id
      `
      if (inserted.length) {
        await createNotification(db, {
          recipientId: exists[0].author_id, actorId: profileId, type: 'like',
          postId, body: 'liked your post', link: '/feed',
        })
      }
      const count = await db.sql`SELECT COUNT(*)::int AS n FROM social_likes WHERE post_id = ${postId}`
      return json({ ok: true, likeCount: count[0].n, liked: true })
    }

    if (kind === 'follow') {
      const followerId = actingId
      const followeeId = str(body.followeeId, 100)
      if (!followeeId) return json({ error: 'Missing profile.' }, 400)
      if (followerId === followeeId) return json({ error: 'You cannot follow yourself.' }, 400)
      const inserted = await db.sql`
        INSERT INTO social_follows ("follower_id", "followee_id", "created_at")
        VALUES (${followerId}, ${followeeId}, ${new Date().toISOString()})
        ON CONFLICT ("follower_id", "followee_id") DO NOTHING
        RETURNING followee_id
      `
      if (inserted.length) {
        await createNotification(db, {
          recipientId: followeeId, actorId: followerId, type: 'follow',
          body: 'started following you', link: `/profile?id=${encodeURIComponent(followerId)}`,
        })
      }
      const count = await db.sql`SELECT COUNT(*)::int AS n FROM social_follows WHERE followee_id = ${followeeId}`
      return json({ ok: true, followers: count[0].n, isFollowing: true })
    }

    return json({ error: 'Unknown action' }, 400)
  }

  // ── Undo actions ──
  if (req.method === 'DELETE') {
    const session = await requireSession(req, db)
    if (session instanceof Response) return session
    const cross = requireSameOrigin(req)
    if (cross) return cross
    const actingId = session.profileId
    const kind = url.searchParams.get('kind')

    if (kind === 'like') {
      const postId = url.searchParams.get('postId')
      if (!postId) return json({ error: 'Missing post.' }, 400)
      await db.sql`DELETE FROM social_likes WHERE post_id = ${postId} AND profile_id = ${actingId}`
      const count = await db.sql`SELECT COUNT(*)::int AS n FROM social_likes WHERE post_id = ${postId}`
      return json({ ok: true, likeCount: count[0].n, liked: false })
    }

    if (kind === 'follow') {
      const followeeId = url.searchParams.get('followeeId')
      if (!followeeId) return json({ error: 'Missing profile.' }, 400)
      await db.sql`DELETE FROM social_follows WHERE follower_id = ${actingId} AND followee_id = ${followeeId}`
      const count = await db.sql`SELECT COUNT(*)::int AS n FROM social_follows WHERE followee_id = ${followeeId}`
      return json({ ok: true, followers: count[0].n, isFollowing: false })
    }

    if (kind === 'post') {
      const id = url.searchParams.get('id')
      if (!id) return json({ error: 'Missing post id.' }, 400)
      // The author may remove their own post; an admin may remove any post.
      // Authority comes from the session, not a client-supplied `admin=1` flag.
      // Comments and likes go with it.
      const rows = await db.sql`SELECT author_id FROM social_posts WHERE id = ${id} LIMIT 1`
      if (!rows.length) return json({ ok: true })
      // Re-derive admin status from the live account so a since-demoted or
      // suspended admin cannot keep deleting others' posts until their session
      // cookie expires. Matches the convention used by profiles/site-settings.
      const isAdmin = await isLiveAdmin(session, db)
      if (!isAdmin && rows[0].author_id !== actingId) return json({ error: 'You can only delete your own posts.' }, 403)
      await db.sql`DELETE FROM social_comments WHERE post_id = ${id}`
      await db.sql`DELETE FROM social_likes WHERE post_id = ${id}`
      await db.sql`DELETE FROM social_posts WHERE id = ${id}`
      return json({ ok: true })
    }

    return json({ error: 'Unknown action' }, 400)
  }

  return json({ error: 'Method Not Allowed' }, 405)
}
