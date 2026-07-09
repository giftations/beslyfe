import { getDatabase } from '@netlify/database'
import {
  json, requireAdmin, newId, clientIp, rateLimit, recordAttempt,
  requireSameOrigin, recordAudit, passwordPolicyError, readSession,
} from './lib/session.mjs'
import { sendEmail } from './lib/email.mjs'
import { createCrmActivityForContact } from './crm.mjs'

// Persistent store of public applications (vendor / sponsor / speaker / etc.).
// The public application forms POST here; the admin dashboard lists them and
// sets each one's status to approved or rejected. Backed by Netlify Database so
// submissions are shared across every browser and device.

const TYPES = new Set(['vendor', 'sponsor', 'speaker', 'dj', 'attendee', 'other'])
// Full application-management workflow. The three original states are kept for
// backward compatibility; the rest drive the review center's kanban lanes.
const STATUSES = new Set(['pending', 'approved', 'rejected', 'needs_followup', 'awaiting_payment', 'paid'])
// How a workflow status maps onto the profile/account moderation state, which
// only understands pending/approved/rejected. Anything payment-related keeps the
// profile approved; follow-ups fall back to pending.
const PROFILE_STATUS_MAP = {
  pending: 'pending', approved: 'approved', rejected: 'rejected',
  needs_followup: 'pending', awaiting_payment: 'approved', paid: 'approved',
}
const MAX_TIMELINE = 200
const MAX_NOTE_LEN = 4000
// Application types that automatically get a public directory profile on
// submission. Vendors, sponsors and speakers additionally create a login
// account (they set a password on the form); DJs / entertainers get a profile
// only — their form collects no password — so a member profile still appears in
// the directory the moment they apply.
const PROFILE_TYPES = new Set(['vendor', 'sponsor', 'speaker', 'dj'])
const ACCOUNT_TYPES = new Set(['vendor', 'sponsor', 'speaker'])
const CONTRACTS = {
  vendor: '/assets/contracts/bakd-on-the-bay-vendor-rules.pdf',
  sponsor: '/assets/contracts/bakd-on-the-bay-sponsor-agreement.pdf',
  speaker: '/assets/contracts/bakd-on-the-bay-speaker-dj-entertainer-agreement.pdf',
  dj: '/assets/contracts/bakd-on-the-bay-speaker-dj-entertainer-agreement.pdf',
}
const PBKDF2_ITERATIONS = 100000

const MAX_FIELDS = 40
const MAX_FIELD_LEN = 4000
const MAX_KEY_LEN = 60

// Reduce arbitrary form input to a bounded, string-only map.
function sanitizeFields(incoming) {
  const out = {}
  if (!incoming || typeof incoming !== 'object') return out
  let count = 0
  for (const key of Object.keys(incoming)) {
    if (count >= MAX_FIELDS) break
    const k = String(key).slice(0, MAX_KEY_LEN)
    if (!k) continue
    const raw = incoming[key]
    if (raw === null || raw === undefined) continue
    let val
    if (typeof raw === 'string') val = raw
    else if (typeof raw === 'number' || typeof raw === 'boolean') val = String(raw)
    else continue
    out[k] = val.slice(0, MAX_FIELD_LEN)
    count++
  }
  return out
}

function firstOf(fields, keys) {
  for (const k of keys) {
    if (fields[k] && String(fields[k]).trim()) return String(fields[k]).trim()
  }
  return ''
}

function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16)
  return out
}

async function derive(password, saltHex) {
  const enc = new TextEncoder()
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16))
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    keyMaterial,
    256,
  )
  return { hash: bytesToHex(new Uint8Array(bits)), salt: bytesToHex(salt) }
}

function profileFromApplication(type, fields, fallbackName, fallbackEmail) {
  const displayName = firstOf(fields, ['displayName', 'publicName', 'stageName', 'artistName', 'businessName', 'company', 'name', 'contactName', 'fullName']) || fallbackName
  const company = firstOf(fields, ['businessName', 'company', 'organization'])
  const tagline = firstOf(fields, ['tagline', 'profileTagline', 'topic', 'genre'])
  const bio = firstOf(fields, ['bio', 'description', 'profileBio'])
  const website = firstOf(fields, ['website'])
  const headshotUrl = firstOf(fields, ['headshotUrl', 'logoUrl'])
  const details = {
    applicationType: type,
    contactName: firstOf(fields, ['contactName', 'name', 'fullName']),
    phone: firstOf(fields, ['phone']),
  }
  if (type === 'vendor') {
    details.package = firstOf(fields, ['package'])
    details.requestedBooth = firstOf(fields, ['requestedBooth'])
  }
  if (type === 'sponsor') {
    // The tier a sponsor *requests* on the form is application metadata, not the
    // authoritative sponsorship level. The public `tier` is an admin-only field
    // (see profiles.mjs ADMIN_DETAIL_KEYS) assigned by organizers after review,
    // so store the applicant's choice as `requestedTier` — never as `tier`, which
    // would otherwise publish an unearned "Platinum" badge in the directory.
    details.requestedTier = firstOf(fields, ['tier'])
    details.requestedLocation = firstOf(fields, ['requestedLocation'])
  }
  if (type === 'speaker') {
    details.talkTitle = firstOf(fields, ['topic'])
    details.format = firstOf(fields, ['format'])
    details.preferredTime = firstOf(fields, ['preferredTime'])
  }
  if (type === 'dj') {
    details.actType = firstOf(fields, ['actType'])
    details.genre = firstOf(fields, ['genre'])
    details.setLength = firstOf(fields, ['setLength'])
  }
  return {
    role: PROFILE_TYPES.has(type) ? type : 'other',
    displayName,
    email: fallbackEmail,
    company,
    tagline,
    bio,
    website,
    headshotUrl,
    details,
  }
}

async function createPendingAccountAndProfile(db, type, fields, name, email, password, now, eventId, member) {
  // A signed-in member applying for an additional position (from their hub)
  // reuses their existing login: we never create a second account for them, and
  // a duplicate email can never block the application. Anonymous vendor / sponsor
  // / speaker applicants still get a brand-new pending login account minted from
  // the email + password on the public form.
  const loggedIn = !!(member && member.account)
  if (!PROFILE_TYPES.has(type)) return { accountId: loggedIn ? member.account.id : '', profileId: '' }

  const wantsAccount = !loggedIn && ACCOUNT_TYPES.has(type)

  // Vendors, sponsors and speakers applying anonymously also get a login account,
  // so they must supply an email and a password that clears the same policy floor
  // as sign-up/reset. DJs / entertainers get a directory profile only, with no
  // login, so they are not held to that requirement. Signed-in members skip this
  // entirely — they already have an account.
  let hash = '', salt = '', emailLower = ''
  if (wantsAccount) {
    if (!email || !password) throw new Error('Vendor, sponsor and speaker applications require an email and password.')
    const weak = passwordPolicyError(password, { admin: false })
    if (weak) throw new Error(weak)
    emailLower = email.trim().toLowerCase()
    const existing = await db.sql`SELECT id FROM accounts WHERE "email_lower" = ${emailLower} LIMIT 1`
    if (existing.length) throw new Error('An account with this email already exists. Please sign in or use a different email.')
    const derived = await derive(password)
    hash = derived.hash
    salt = derived.salt
  }

  const profile = profileFromApplication(type, fields, name, email)
  // Fill any blanks from the member's existing profile so an in-profile
  // application inherits their name, photo and bio without re-entering them.
  if (loggedIn && member.profile) {
    const p = member.profile
    profile.displayName = profile.displayName || p.display_name || ''
    profile.email = profile.email || p.email || ''
    profile.company = profile.company || p.company || ''
    profile.tagline = profile.tagline || p.tagline || ''
    profile.bio = profile.bio || p.bio || ''
    profile.website = profile.website || p.website || ''
    profile.headshotUrl = profile.headshotUrl || p.headshot_url || ''
  }

  const profileId = newId('')
  await db.sql`
    INSERT INTO profiles (
      "id", "event_id", "role", "display_name", "email", "company", "tagline", "bio",
      "website", "headshot_url", "status", "details", "created_at", "updated_at"
    ) VALUES (
      ${profileId}, ${eventId}, ${profile.role}, ${profile.displayName}, ${profile.email}, ${profile.company},
      ${profile.tagline}, ${profile.bio}, ${profile.website}, ${profile.headshotUrl},
      'pending', ${JSON.stringify(profile.details)}::jsonb, ${now}, ${now}
    )
  `

  // Signed-in members already have a login; just link this new pending profile to
  // their existing account so an admin can approve or deny it.
  if (loggedIn) return { accountId: member.account.id, profileId }

  let accountId = ''
  if (wantsAccount) {
    accountId = newId('acct_')
    await db.sql`
      INSERT INTO accounts ("id", "email", "email_lower", "name", "role", "status", "password_hash", "password_salt", "profile_id", "created_at")
      VALUES (${accountId}, ${email}, ${emailLower}, ${profile.displayName || name}, ${type}, 'pending', ${hash}, ${salt}, ${profileId}, ${now})
    `
  }
  return { accountId, profileId }
}

function siteOrigin(req) {
  const url = new URL(req.url)
  return `${url.protocol}//${url.host}`
}

// The Eventbrite configuration that unlocks a paid package: the per-package
// purchase links plus the shared access password for the password-protected
// ticket pages. All three live in the homepage settings row (set by an admin) in
// the same database and are only ever handed to an applicant the database
// confirms is approved, so they never ship to the public site. The password
// additionally falls back to the EVENTBRITE_PASSWORD environment variable, so an
// older deployment that configured it there keeps working.
async function getEventbriteConfig(db) {
  let cfg = null
  try {
    const rows = await db.sql`SELECT "data" FROM site_settings WHERE "page" = 'homepage' LIMIT 1`
    cfg = rows.length ? rows[0].data : null
  } catch {
    cfg = null
  }
  const envPassword = (typeof process !== 'undefined' && process.env ? process.env.EVENTBRITE_PASSWORD : '') || ''
  const stored = cfg && typeof cfg.eventbritePassword === 'string' ? cfg.eventbritePassword : ''
  return {
    vendor: cfg && typeof cfg.eventbriteVendorUrl === 'string' ? cfg.eventbriteVendorUrl : '',
    sponsor: cfg && typeof cfg.eventbriteSponsorUrl === 'string' ? cfg.eventbriteSponsorUrl : '',
    password: stored || envPassword,
  }
}

async function sendApprovalEmail(db, app, profileId, req) {
  if (!app.email || !profileId) return { sent: false }

  const profileUrl = `${siteOrigin(req)}/profile?id=${encodeURIComponent(profileId)}`

  // Vendors and sponsors buy their booth/package on Eventbrite, where the ticket
  // is password-protected so only approved applicants can purchase. On approval
  // they get that password plus the direct purchase link for their package.
  const isPaidRole = app.type === 'vendor' || app.type === 'sponsor'
  const cfg = isPaidRole ? await getEventbriteConfig(db) : { vendor: '', sponsor: '', password: '' }
  const password = cfg.password
  const eventbriteUrl = app.type === 'sponsor' ? cfg.sponsor : cfg.vendor
  const showEventbrite = isPaidRole && !!password

  const subject = "You're approved for Bak'd On The Bay"

  const textLines = [
    `Hi ${app.name || 'there'},`,
    '',
    "Your Bak'd On The Bay application has been approved.",
    `You can sign in with the password you created during application and view your profile here: ${profileUrl}`,
  ]
  if (showEventbrite) {
    textLines.push(
      '',
      `To purchase your ${app.type} package, go to the ${app.type} ticket page on Eventbrite and enter this access password when prompted:`,
      '',
      `    ${password}`,
      '',
      eventbriteUrl
        ? `${app.type.charAt(0).toUpperCase() + app.type.slice(1)} tickets: ${eventbriteUrl}`
        : 'The ticket link is on the Bak\'d On The Bay site under your package.',
    )
  }
  textLines.push('', "Bak'd On The Bay")
  const text = textLines.join('\n')

  let html =
    `<p>Hi ${escapeEmail(app.name || 'there')},</p>` +
    `<p>Your Bak'd On The Bay application has been approved.</p>` +
    `<p>You can sign in with the password you created during application and view your profile here: <a href="${profileUrl}">${profileUrl}</a></p>`
  if (showEventbrite) {
    const linkHtml = eventbriteUrl
      ? `<p><a href="${escapeEmail(eventbriteUrl)}">Buy your ${escapeEmail(app.type)} tickets on Eventbrite</a></p>`
      : `<p>The ticket link is on the Bak'd On The Bay site under your package.</p>`
    html +=
      `<p>To purchase your ${escapeEmail(app.type)} package, go to the ${escapeEmail(app.type)} ticket page on Eventbrite and enter this access password when prompted:</p>` +
      `<p style="font-size:18px;font-weight:bold;letter-spacing:1px">${escapeEmail(password)}</p>` +
      linkHtml
  }
  html += `<p>Bak'd On The Bay</p>`

  return sendEmail({ to: app.email, subject, text, html })
}

// A friendly, immediate receipt sent to the applicant's own email the moment
// they submit — separate from the later approval email. Confirms the site
// received the application and, for professional roles, that a profile was
// created (pending review). Also notifies the organizers (PROFILE_NOTIFICATION_TO)
// that a new application arrived. Best-effort: routed through sendEmail, which is
// a no-op when no email provider is configured, so it never fails a submission.
const TYPE_LABELS = {
  vendor: 'vendor', sponsor: 'sponsor', speaker: 'speaker',
  dj: 'DJ / entertainer', attendee: 'attendee', other: '',
}
async function sendConfirmationEmail(app, req) {
  if (!app.email) return { sent: false }

  const label = TYPE_LABELS[app.type] || ''
  const role = label ? `${label} application` : 'application'
  const profileLine = PROFILE_TYPES.has(app.type)
    ? "We've created a profile for you on the site. It's pending review and will appear in the public directory once our team approves it."
    : 'Our team will review your submission and follow up with next steps.'
  const subject = "We received your Bak'd On The Bay application"
  const text = [
    `Hi ${app.name || 'there'},`,
    '',
    `Thanks for submitting your ${role} to Bak'd On The Bay. We've received it.`,
    '',
    profileLine,
    '',
    "We'll be in touch soon.",
    "Bak'd On The Bay",
  ].join('\n')
  const html = `<p>Hi ${escapeEmail(app.name || 'there')},</p>` +
    `<p>Thanks for submitting your ${escapeEmail(role)} to Bak'd On The Bay. We've received it.</p>` +
    `<p>${escapeEmail(profileLine)}</p>` +
    `<p>We'll be in touch soon.<br>Bak'd On The Bay</p>`

  const result = await sendEmail({ to: app.email, subject, text, html })

  // Optional internal heads-up to the organizers so new applications don't sit
  // unseen. Independent of the applicant receipt and equally best-effort.
  const notifyTo = typeof process !== 'undefined' && process.env ? process.env.PROFILE_NOTIFICATION_TO : ''
  if (notifyTo) {
    const adminText = [
      `New ${role} from ${app.name || 'an applicant'} (${app.email}).`,
      PROFILE_TYPES.has(app.type) ? 'A pending profile was created and is awaiting review.' : '',
      `Review it in the admin: ${siteOrigin(req)}/admin`,
    ].filter(Boolean).join('\n')
    await sendEmail({ to: notifyTo, subject: `New ${role}: ${app.name || app.email}`, text: adminText })
  }

  return result
}

function escapeEmail(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function normalizeRow(row) {
  if (!row) return null
  return {
    id: row.id,
    eventId: row.event_id || '',
    type: row.type,
    name: row.name,
    email: row.email,
    status: row.status,
    fields: row.fields || {},
    internalNotes: typeof row.internal_notes === 'string' ? row.internal_notes : '',
    timeline: Array.isArray(row.timeline) ? row.timeline : [],
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  }
}

async function getApplication(db, id) {
  const rows = await db.sql`SELECT * FROM applications WHERE "id" = ${id} LIMIT 1`
  return normalizeRow(rows[0])
}

// The edition a new public submission belongs to: whichever event is currently
// active. Best-effort — if the events table is unavailable the submission still
// succeeds with an empty event_id (the events function backfills it later).
async function activeEventId(db) {
  try {
    const rows = await db.sql`SELECT "id" FROM events WHERE "is_active" = true ORDER BY "created_at" ASC LIMIT 1`
    if (rows.length) return rows[0].id
    const any = await db.sql`SELECT "id" FROM events ORDER BY "created_at" ASC LIMIT 1`
    return any.length ? any[0].id : ''
  } catch {
    return ''
  }
}

// Given an email, resolve what an approved vendor/sponsor can see on the package
// page. Returns four things, kept deliberately separate so the two very
// different failure modes never get conflated:
//   • approvedTypes — the vendor/sponsor roles an admin has approved for this
//     email. Empty means genuinely not approved (pending / rejected / unknown).
//   • packages — one purchase link per approved type that ALSO has an Eventbrite
//     URL configured. This is what actually unlocks the buy button.
//   • pendingLinks — approved types whose Eventbrite URL the admin hasn't set
//     yet. The applicant IS approved; the organizers just haven't pasted the
//     link. Surfacing this lets the UI say "approved, link coming" instead of
//     the misleading "not approved yet".
//   • password — the shared Eventbrite access password, returned only when the
//     applicant is approved (empty otherwise) so it is never disclosed to an
//     unapproved email.
async function resolvePackageAccess(db, email) {
  const rows = await db.sql`
    SELECT DISTINCT "type" FROM applications
    WHERE "status" = 'approved'
      AND "type" IN ('vendor', 'sponsor')
      AND LOWER(TRIM("email")) = ${email.trim().toLowerCase()}
  `
  const approved = new Set(rows.map((r) => r.type))
  const approvedTypes = ['vendor', 'sponsor'].filter((t) => approved.has(t))
  const cfg = await getEventbriteConfig(db)
  const packages = []
  const pendingLinks = []
  for (const type of approvedTypes) {
    const eventbriteUrl = type === 'sponsor' ? cfg.sponsor : cfg.vendor
    if (eventbriteUrl) packages.push({ type, eventbriteUrl })
    else pendingLinks.push(type)
  }
  const password = approvedTypes.length ? cfg.password : ''
  return { approvedTypes, packages, pendingLinks, password }
}

export default async (req) => {
  const db = getDatabase()
  const url = new URL(req.url)
  const id = url.searchParams.get('id')

  // ── Read one or many applications (admin) ──
  if (req.method === 'GET') {
    // Public, approval-gated access check: an approved vendor/sponsor exchanges
    // their email for the Eventbrite link that lets them buy their package.
    // This is the one GET path that stays public — it returns only links, never
    // applicant records.
    if (url.searchParams.get('access') !== null) {
      // Throttle by IP: the lookup is intentionally public, but without a limit
      // an attacker could enumerate which emails have approved applications (and
      // harvest the unlocked purchase links) by guessing addresses. 20 lookups
      // per 15 minutes is far above any honest applicant's need.
      const ip = clientIp(req)
      const bucket = `app-access:${ip}`
      const limited = await rateLimit(db, bucket, 20, 15 * 60 * 1000, 'Too many lookups. Please wait a few minutes and try again.')
      if (limited) return limited
      await recordAttempt(db, bucket)

      const email = (url.searchParams.get('email') || '').trim()
      if (!email) return json({ error: 'Enter the email you applied with.' }, 400)
      const { approvedTypes, packages, pendingLinks, password } = await resolvePackageAccess(db, email)
      return json(
        { approved: approvedTypes.length > 0, packages, pendingLinks, eventbritePassword: password },
        200,
        { 'Cache-Control': 'no-store' },
      )
    }

    // Everything else exposes applicant PII and staff notes — admin only.
    const admin = await requireAdmin(req, db)
    if (admin instanceof Response) return admin

    if (id) {
      const item = await getApplication(db, id)
      if (!item) return json({ error: 'Not found' }, 404)
      return json({ item }, 200, { 'Cache-Control': 'no-store' })
    }

    const statusFilter = url.searchParams.get('status')
    const typeFilter = url.searchParams.get('type')
    const hasStatus = statusFilter && STATUSES.has(statusFilter)
    const hasType = typeFilter && TYPES.has(typeFilter)
    let rows
    if (hasStatus && hasType) {
      rows = await db.sql`SELECT * FROM applications WHERE "status" = ${statusFilter} AND "type" = ${typeFilter} ORDER BY "created_at" DESC`
    } else if (hasStatus) {
      rows = await db.sql`SELECT * FROM applications WHERE "status" = ${statusFilter} ORDER BY "created_at" DESC`
    } else if (hasType) {
      rows = await db.sql`SELECT * FROM applications WHERE "type" = ${typeFilter} ORDER BY "created_at" DESC`
    } else {
      rows = await db.sql`SELECT * FROM applications ORDER BY "created_at" DESC`
    }

    const list = rows.map(normalizeRow).filter(Boolean)
    const countRows = await db.sql`SELECT "status", COUNT(*)::int AS count FROM applications GROUP BY "status"`
    const counts = { pending: 0, approved: 0, rejected: 0, needs_followup: 0, awaiting_payment: 0, paid: 0, total: 0 }
    for (const row of countRows) {
      counts[row.status] = (counts[row.status] || 0) + row.count
      counts.total += row.count
    }
    return json({ items: list, counts }, 200, { 'Cache-Control': 'no-store' })
  }

  // ── Submit a new application (public) ──
  if (req.method === 'POST') {
    const cross = requireSameOrigin(req)
    if (cross) return cross
    let body
    try {
      body = await req.json()
    } catch {
      return json({ error: 'Invalid JSON' }, 400)
    }
    if (!body || typeof body !== 'object') {
      return json({ error: 'Expected a JSON object' }, 400)
    }

    const type = TYPES.has(body.type) ? body.type : 'other'
    const fields = sanitizeFields(body.fields || body)
    delete fields.type
    delete fields.status

    // A signed-in member can apply for additional positions straight from their
    // hub. Attaching their existing account means no second login is created and
    // a duplicate email never blocks the application — an admin still approves or
    // denies it like any other. Anonymous submissions have no session and follow
    // the original create-account path.
    const session = await readSession(req, db)
    let member = null
    if (session && session.accountId) {
      const acctRows = await db.sql`SELECT * FROM accounts WHERE "id" = ${session.accountId} LIMIT 1`
      const account = acctRows[0]
      if (account) {
        let profileRow = null
        if (account.profile_id) {
          const pr = await db.sql`SELECT * FROM profiles WHERE "id" = ${account.profile_id} LIMIT 1`
          profileRow = pr[0] || null
        }
        member = { account, profile: profileRow }
      }
    }

    let name = firstOf(fields, ['name', 'display_name', 'displayName', 'businessName', 'fullName', 'contactName'])
    let email = firstOf(fields, ['email'])
    // Signed-in members needn't re-type their name or email — inherit both from
    // their account so the "email already exists" dead-end never appears.
    if (member) {
      name = name || member.account.name || (member.profile && member.profile.display_name) || ''
      email = email || member.account.email || ''
    }
    if (!name && !email) {
      return json({ error: 'An application needs at least a name or an email.' }, 400)
    }
    // The full account-field set (email, password, …) is only required when a new
    // login must be created — i.e. an anonymous vendor/sponsor/speaker applicant.
    // A signed-in member already has all of this on their account.
    if (ACCOUNT_TYPES.has(type) && !member) {
      const required = ['email', 'displayName', 'tagline', 'description', 'password']
      for (const key of required) {
        if (!fields[key] || !String(fields[key]).trim()) return json({ error: 'Please complete every required account field.' }, 400)
      }
    }
    if (CONTRACTS[type]) {
      const required = ['contractSignature', 'contractAccepted']
      for (const key of required) {
        if (!fields[key] || !String(fields[key]).trim()) return json({ error: 'Please complete every required contract field.' }, 400)
      }
      if (fields.contractAccepted !== 'yes') return json({ error: 'Please accept the contract before submitting.' }, 400)
    }

    const now = new Date().toISOString()
    const eventId = await activeEventId(db)
    let accountLink = { accountId: '', profileId: '' }
    try {
      accountLink = await createPendingAccountAndProfile(db, type, fields, name, email, fields.password || '', now, eventId, member)
    } catch (error) {
      return json({ error: error.message || 'Could not create the applicant account.' }, 400)
    }
    delete fields.password
    fields.accountId = accountLink.accountId
    fields.profileId = accountLink.profileId
    if (CONTRACTS[type]) {
      fields.contractDocument = CONTRACTS[type]
      fields.contractSignedAt = now
    }

    const applicationId = newId()
    const initialTimeline = JSON.stringify([{ at: now, by: 'System', kind: 'submitted', text: `${type} application submitted` }])
    await db.sql`
      INSERT INTO applications ("id", "event_id", "type", "name", "email", "status", "fields", "timeline", "created_at", "updated_at")
      VALUES (${applicationId}, ${eventId}, ${type}, ${name}, ${email}, 'pending', ${JSON.stringify(fields)}::jsonb, ${initialTimeline}::jsonb, ${now}, ${now})
    `
    const companyName = firstOf(fields, ['businessName', 'company', 'organization'])
    await createCrmActivityForContact(db, {
      email,
      companyName,
      eventId,
      kind: 'application',
      title: `${type} application submitted`,
      body: name || email || companyName,
      details: { applicationId, type, status: 'pending' },
    })
    // Immediate receipt to the applicant's own email. Best-effort — the
    // submission has already succeeded, so a failed/skipped send never errors.
    const confirmation = await sendConfirmationEmail({ type, name, email }, req)
    return json({ ok: true, id: applicationId, profileId: accountLink.profileId, confirmationEmailSent: confirmation.sent })
  }

  // ── Update an application: status, internal notes, and/or a timeline entry
  //    (admin). Any combination of the three may be supplied in one request. ──
  if (req.method === 'PUT' || req.method === 'PATCH') {
    const cross = requireSameOrigin(req)
    if (cross) return cross
    const admin = await requireAdmin(req, db)
    if (admin instanceof Response) return admin
    let body
    try {
      body = await req.json()
    } catch {
      return json({ error: 'Invalid JSON' }, 400)
    }
    const targetId = (body && body.id) || id
    if (!targetId) return json({ error: 'Missing application id' }, 400)

    const hasStatus = body && body.status !== undefined && body.status !== null
    const hasNotes = body && typeof body.internalNotes === 'string'
    const hasEntry = body && typeof body.timelineNote === 'string' && body.timelineNote.trim()
    if (hasStatus && !STATUSES.has(body.status)) return json({ error: 'Invalid status' }, 400)
    if (!hasStatus && !hasNotes && !hasEntry) {
      return json({ error: 'Nothing to update' }, 400)
    }

    const current = await getApplication(db, targetId)
    if (!current) return json({ error: 'Not found' }, 404)

    const updatedAt = new Date().toISOString()
    const actor = String((body && body.actor) || 'Admin').slice(0, 120)
    const timeline = Array.isArray(current.timeline) ? current.timeline.slice() : []
    const pushEvent = (kind, text) => {
      timeline.push({ at: updatedAt, by: actor, kind, text: String(text || '').slice(0, MAX_NOTE_LEN) })
    }
    if (hasStatus && body.status !== current.status) {
      pushEvent('status', `Status changed from ${current.status} to ${body.status}`)
    }
    if (hasEntry) pushEvent(String(body.timelineKind || 'note'), body.timelineNote)
    if (hasNotes && body.internalNotes !== current.internalNotes) pushEvent('note', 'Internal notes updated')
    const trimmed = timeline.slice(-MAX_TIMELINE)

    const nextStatus = hasStatus ? body.status : current.status
    const nextNotes = hasNotes ? body.internalNotes.slice(0, MAX_NOTE_LEN) : current.internalNotes
    const rows = await db.sql`
      UPDATE applications
      SET "status" = ${nextStatus}, "internal_notes" = ${nextNotes},
          "timeline" = ${JSON.stringify(trimmed)}::jsonb, "updated_at" = ${updatedAt}
      WHERE "id" = ${targetId}
      RETURNING *
    `
    const next = normalizeRow(rows[0])
    const profileId = next.fields && next.fields.profileId ? String(next.fields.profileId) : ''
    const accountId = next.fields && next.fields.accountId ? String(next.fields.accountId) : ''
    // Only sync moderation state when the status actually changed. Workflow
    // states are mapped down to the pending/approved/rejected a profile knows.
    if (hasStatus && body.status !== current.status) {
      const profileStatus = PROFILE_STATUS_MAP[nextStatus] || 'pending'
      if (profileId) {
        await db.sql`UPDATE profiles SET "status" = ${profileStatus}, "updated_at" = ${updatedAt} WHERE "id" = ${profileId}`
      }
      if (accountId) {
        // Only move the account that was created *for this application* — its
        // profile_id matches this application's profile. A signed-in member who
        // applied for an extra position reuses their primary login (whose
        // profile_id is their original profile), so denying that application must
        // never reject or suspend their whole account. Scoping the update to a
        // matching profile_id leaves the member's login untouched while still
        // syncing an anonymous applicant's single-purpose account as before.
        await db.sql`UPDATE accounts SET "status" = ${profileStatus} WHERE "id" = ${accountId} AND "profile_id" = ${profileId}`
      }
    }
    const justApproved = hasStatus && body.status === 'approved' && current.status !== 'approved'
    const email = justApproved ? await sendApprovalEmail(db, next, profileId, req) : { sent: false }
    // Accountable trail of the review action (status change, note, or both).
    await recordAudit(db, req, admin, {
      action: 'application.update',
      resourceType: 'application',
      resourceId: targetId,
      details: {
        actorName: actor,
        statusBefore: current.status,
        statusAfter: nextStatus,
        notesChanged: hasNotes && body.internalNotes !== current.internalNotes,
        timelineNoteAdded: !!hasEntry,
      },
    })
    if (hasStatus && body.status !== current.status) {
      const companyName = firstOf(next.fields || {}, ['businessName', 'company', 'organization'])
      await createCrmActivityForContact(db, {
        email: next.email,
        companyName,
        eventId: next.eventId,
        actorAccountId: admin.accountId || '',
        kind: 'status_change',
        title: `Application ${nextStatus}`,
        body: `${current.status} -> ${nextStatus}`,
        details: { applicationId: targetId, type: next.type, statusBefore: current.status, statusAfter: nextStatus },
      })
    }
    return json({ ok: true, item: next, profileId, approvalEmailSent: email.sent })
  }

  // ── Remove an application (admin) ──
  if (req.method === 'DELETE') {
    const cross = requireSameOrigin(req)
    if (cross) return cross
    const admin = await requireAdmin(req, db)
    if (admin instanceof Response) return admin
    if (!id) return json({ error: 'Missing application id' }, 400)
    const existing = await getApplication(db, id)
    await db.sql`DELETE FROM applications WHERE "id" = ${id}`
    await recordAudit(db, req, admin, {
      action: 'application.delete',
      resourceType: 'application',
      resourceId: id,
      details: existing ? { type: existing.type, email: existing.email, status: existing.status } : {},
    })
    return json({ ok: true })
  }

  return json({ error: 'Method Not Allowed' }, 405)
}
