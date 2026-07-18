import { createNotification } from './notify.mjs'

export const COMMUNITY_HOST_PROFILE_ID = 'beslyfe-community-host'
export const COMMUNITY_WELCOME_POST_ID = 'beslyfe-community-welcome-letter-v1'

export const CARE_PERSONALIZATION_SOURCES = Object.freeze([
  'member public profile',
  'member-owned Beslyfe project',
  'recent Beslyfe community activity',
])

export const CARE_EXCLUDED_DATA = Object.freeze([
  'passwords and credentials',
  'email address or private contact details',
  'private messages',
  'sensitive traits',
  'external background checks or covert web research',
])

export const COMMUNITY_WELCOME_LETTER = `Welcome to Beslyfe — you belong here.

This community is for builders, creators, business owners, organizers, dreamers, and people who are still discovering their next step. You do not need a perfect plan before you join the conversation. Share what you are building, what feels stuck, what you learned, or one small win that could help somebody else keep going.

Ask questions. Offer help when you can. Celebrate progress in public. Meet people who understand that meaningful things are rarely built alone.

Beslyfe will keep growing with its members: more useful tools, stronger connections, smarter workflows, and new possibilities shaped by what the community actually needs. Your voice is part of that evolution.

We are genuinely glad you are here. Bring the dream. We will help put the system—and the community around it—together.`

const OUTCOME_IDEAS = Object.freeze({
  'online-sales': 'Choose one offer and make its next action unmistakably clear on every page where a customer may decide.',
  'qualified-leads': 'Write one question your best future customer is already asking, then answer it in a short public post with one helpful next step.',
  bookings: 'Review the path from interest to a confirmed booking and remove one unnecessary handoff.',
  'community-growth': 'Welcome one person, ask one useful question, and make one introduction that helps two members move forward.',
  'publish-content': 'Turn one lesson from this week into a useful post before trying to make it perfect.',
  'grow-audience': 'Publish one specific idea for the exact people you want to reach, then invite a real conversation instead of chasing empty impressions.',
  'book-opportunities': 'Make one recent example of your work easy to understand, then add a direct way to request a conversation or booking.',
  'run-operations': 'Pick the most repeated handoff in your week and write the three steps that would make it dependable.',
  'manage-inventory': 'Identify the one stock or supplier signal that would prevent the most avoidable fire drills and make it visible first.',
  'manage-properties': 'Choose one recurring tenant, owner, or maintenance update and turn it into a clear trackable workflow.',
  'automate-workflows': 'Choose one repetitive task to automate, but keep the first version reviewable until it earns your trust.',
  donations: 'Show one concrete result support can create and make the path to help simple and transparent.',
  'ticket-sales': 'Give people one clear reason to attend now, while keeping every date, location, and policy detail accurate.',
})

function clean(value, max = 240) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max)
}

function parseObject(value) {
  if (value && typeof value === 'object') return value
  if (typeof value !== 'string') return {}
  try { return JSON.parse(value) || {} } catch { return {} }
}

function firstName(value) {
  return clean(value, 80).split(' ')[0] || 'there'
}

export function weekKey(now = new Date()) {
  const date = new Date(now)
  if (Number.isNaN(date.getTime())) return weekKey(new Date())
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
  return date.toISOString().slice(0, 10)
}

export function memberWelcomeBody(displayName) {
  const name = clean(displayName, 100) || 'our newest member'
  return `Please help us welcome ${name} to Beslyfe! 🎉\n\n${name}, you belong here before the plan is perfect. Tell us what you are building, what you need, or the next small win you are working toward. This community grows when people ask honest questions, share useful lessons, and help each other turn ideas into something real.\n\nWe are glad you found us. Welcome to a growing, evolving community built to help you do more of what you love.`
}

export function weeklyCheckInBody(member = {}) {
  const name = firstName(member.display_name || member.displayName)
  const projectName = clean(member.project_name || member.projectName, 120)
  const projectType = clean(member.product_type || member.productType, 60).replace(/-/g, ' ')
  const outcome = clean(member.primary_outcome || member.primaryOutcome, 80)
  const answers = parseObject(member.answers)
  const statedResult = clean(answers.offer, 180)
  const recentPosts = Math.max(0, Number(member.recent_posts || member.recentPosts || 0))
  const projectLine = projectName
    ? `I’m checking in on ${projectName}${projectType ? `, your ${projectType} project` : ''}.`
    : 'I’m checking in on the idea or project you want to move forward next.'
  const resultLine = statedResult ? `You said the useful result should be: “${statedResult}”` : ''
  const idea = OUTCOME_IDEAS[outcome] || 'Choose the smallest useful result you can finish this week, share it, and let the community help you improve the next version.'
  const activityLine = recentPosts > 0
    ? `You have shared ${recentPosts} public contribution${recentPosts === 1 ? '' : 's'} recently—keep letting people see the real progress, not only the finished result.`
    : 'A short feed post about what you are building or where you feel stuck can help the right person find you.'
  return [
    `Hi ${name} — your weekly Beslyfe check-in is here.`,
    projectLine,
    resultLine,
    `One idea for this week: ${idea}`,
    activityLine,
    'What is one thing you want help moving forward? Reply anytime. You are part of this community, and you do not have to build alone.',
  ].filter(Boolean).join('\n\n').slice(0, 2000)
}

export function memberAllowsCare(member = {}) {
  if (member.muted === true) return false
  const prefs = parseObject(member.prefs)
  return prefs.message !== false
}

export async function ensureCommunityHostProfile(db, now = new Date()) {
  const timestamp = new Date(now).toISOString()
  await db.sql`
    INSERT INTO profiles (
      "id", "role", "display_name", "email", "company", "tagline", "bio",
      "website", "headshot_url", "status", "details", "created_at", "updated_at"
    ) VALUES (
      ${COMMUNITY_HOST_PROFILE_ID}, 'other', 'Beslyfe Community', '', 'Beslyfe', 'Your community host',
      'Welcome, encouragement, useful connections, and help turning ideas into working systems.',
      'https://beslyfe.com/community', '', 'approved',
      ${JSON.stringify({ hidden: 'true', system: 'community-care' })}::jsonb, ${timestamp}, ${timestamp}
    )
    ON CONFLICT ("id") DO UPDATE SET
      "display_name" = 'Beslyfe Community', "company" = 'Beslyfe',
      "tagline" = 'Your community host', "status" = 'approved', "updated_at" = ${timestamp}
  `
  try {
    await db.sql`
      INSERT INTO ecosystem_memberships (ecosystem_id, profile_id, role, source, status, joined_at)
      VALUES ('beslyfe-network', ${COMMUNITY_HOST_PROFILE_ID}, 'host', 'community-care', 'active', ${timestamp})
      ON CONFLICT (ecosystem_id, profile_id) DO UPDATE SET status = 'active'
    `
  } catch { /* Compatibility with a database still applying ecosystem migrations. */ }
  return COMMUNITY_HOST_PROFILE_ID
}

export async function ensureCommunityWelcomeLetter(db, now = new Date()) {
  const timestamp = new Date(now).toISOString()
  await ensureCommunityHostProfile(db, now)
  const rows = await db.sql`
    INSERT INTO social_posts (
      "id", "ecosystem_id", "author_id", "body", "image_url", "video_url", "post_type",
      "filter", "music", "visibility", "location", "expires_at", "created_at"
    ) VALUES (
      ${COMMUNITY_WELCOME_POST_ID}, 'beslyfe-network', ${COMMUNITY_HOST_PROFILE_ID}, ${COMMUNITY_WELCOME_LETTER},
      '', '', 'post', '', '', 'public', '{}'::jsonb, NULL, ${timestamp}
    )
    ON CONFLICT ("id") DO NOTHING
    RETURNING "id"
  `
  return { id: COMMUNITY_WELCOME_POST_ID, created: rows.length > 0 }
}

export async function welcomeVerifiedMember(db, { profileId, displayName, now = new Date() } = {}) {
  if (!profileId || profileId === COMMUNITY_HOST_PROFILE_ID) return { created: false }
  const timestamp = new Date(now).toISOString()
  await ensureCommunityHostProfile(db, now)
  const id = `member-welcome-${String(profileId).slice(0, 120)}`
  const rows = await db.sql`
    INSERT INTO social_posts (
      "id", "ecosystem_id", "author_id", "body", "image_url", "video_url", "post_type",
      "filter", "music", "visibility", "location", "expires_at", "created_at"
    ) VALUES (
      ${id}, 'beslyfe-network', ${COMMUNITY_HOST_PROFILE_ID}, ${memberWelcomeBody(displayName)},
      '', '', 'post', '', '', 'public', '{}'::jsonb, NULL, ${timestamp}
    )
    ON CONFLICT ("id") DO NOTHING
    RETURNING "id"
  `
  return { id, created: rows.length > 0 }
}

export async function runWeeklyCommunityCare(db, now = new Date()) {
  const timestamp = new Date(now).toISOString()
  const since = new Date(new Date(now).getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const key = weekKey(now)
  await ensureCommunityHostProfile(db, now)
  const members = await db.sql`
    SELECT
      p.id, p.display_name,
      care.muted, care.prefs,
      project.name AS project_name, project.product_type, project.primary_outcome, project.answers,
      (SELECT COUNT(*)::int FROM social_posts recent
        WHERE recent.author_id = p.id AND recent.visibility = 'public' AND recent.created_at >= ${since}) AS recent_posts
    FROM profiles p
    LEFT JOIN notification_prefs care ON care.profile_id = p.id
    LEFT JOIN LATERAL (
      SELECT e.name, e.product_type, e.primary_outcome, e.answers
      FROM ecosystems e
      WHERE e.owner_profile_id = p.id AND e.status <> 'archived'
      ORDER BY e.updated_at DESC
      LIMIT 1
    ) project ON TRUE
    WHERE p.status = 'approved'
      AND p.id <> ${COMMUNITY_HOST_PROFILE_ID}
      AND COALESCE(p.details->>'hidden', 'false') <> 'true'
    ORDER BY p.created_at ASC
    LIMIT 250
  `

  let sent = 0
  let optedOut = 0
  for (const member of members) {
    if (!memberAllowsCare(member)) {
      optedOut += 1
      continue
    }
    const id = `care-${key}-${String(member.id).slice(0, 120)}`
    const body = weeklyCheckInBody(member)
    const rows = await db.sql`
      INSERT INTO social_messages (
        "id", "sender_id", "recipient_id", "body", "media_url", "media_kind", "read_at", "created_at"
      ) VALUES (
        ${id}, ${COMMUNITY_HOST_PROFILE_ID}, ${member.id}, ${body}, '', '', NULL, ${timestamp}
      )
      ON CONFLICT ("id") DO NOTHING
      RETURNING "id"
    `
    if (!rows.length) continue
    sent += 1
    await createNotification(db, {
      recipientId: member.id,
      actorId: COMMUNITY_HOST_PROFILE_ID,
      type: 'message',
      messageId: id,
      body,
      link: `/messages?to=${encodeURIComponent(COMMUNITY_HOST_PROFILE_ID)}`,
    })
  }
  return { week: key, eligible: members.length, sent, optedOut }
}
