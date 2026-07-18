import { getDatabase } from '@netlify/database'
import { readSession, requireSession, requireAdmin, isLiveAdmin, newId, requireSameOrigin, recordAudit, readJsonBody } from './lib/session.mjs'
import { sendEmail } from './lib/email.mjs'
import { createCrmActivityForContact } from './crm.mjs'

// Public, self-authored profiles for vendors, sponsors, speakers and attendees.
// Anyone can POST a profile from the site; the public directory lists approved
// profiles and an individual profile can be fetched by id. Backed by Netlify
// Database so profiles are shared across every browser and device. Mirrors the
// shape and conventions of applications.mjs.

const ROLES = new Set(['vendor', 'sponsor', 'speaker', 'dj', 'attendee', 'other'])
const STATUSES = new Set(['pending', 'approved', 'rejected'])

// Detail keys that only an admin may set. Members can never self-assign these:
// `featured` promotes a profile on the homepage, and `tier` is the sponsorship
// level, which the organizers grant based on the sponsor's package for the
// event — a sponsor may not simply pick "Platinum" for themselves.
const ADMIN_DETAIL_KEYS = ['featured', 'tier']

// The fixed sponsorship-tier vocabulary. Any admin-assigned tier is coerced to
// one of these canonical values (case-insensitively); anything else clears it.
const SPONSOR_TIERS = ['Platinum', 'Gold', 'Silver', 'Community']

function normalizeTier(value) {
  const v = String(value == null ? '' : value).trim()
  if (!v) return ''
  const match = SPONSOR_TIERS.find((t) => t.toLowerCase() === v.toLowerCase())
  return match || ''
}

// Apply the tier vocabulary to a details map in place: drop the key when the
// tier is empty or unrecognised, otherwise store the canonical spelling.
function applyTierRules(details) {
  if (details.tier === undefined) return details
  const tier = normalizeTier(details.tier)
  if (tier) details.tier = tier
  else delete details.tier
  return details
}

const MAX_DETAILS = 30
const MAX_FIELD_LEN = 4000
const MAX_KEY_LEN = 60

// Plain text columns and their length caps.
const TEXT_FIELDS = {
  displayName: 200,
  email: 200,
  company: 200,
  tagline: 300,
  bio: 4000,
  website: 500,
  headshotUrl: 1000,
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  })
}

function str(value, max) {
  if (value === null || value === undefined) return ''
  return String(value).slice(0, max)
}

// Light email-format validation: enough to reject typos and obviously malformed
// addresses without the false rejections an over-strict pattern causes. A blank
// email is allowed (a profile can be name-only), so only non-empty values are
// checked. Returns an error string, or null when acceptable.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
function emailError(email) {
  const v = String(email == null ? '' : email).trim()
  if (!v) return null
  if (v.length > 200 || !EMAIL_RE.test(v)) return 'Please enter a valid email address.'
  return null
}

// Reduce arbitrary extra input to a bounded, string-only map.
function sanitizeDetails(incoming) {
  const out = {}
  if (!incoming || typeof incoming !== 'object') return out
  let count = 0
  for (const key of Object.keys(incoming)) {
    if (count >= MAX_DETAILS) break
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

function normalizeRow(row) {
  if (!row) return null
  return {
    id: row.id,
    eventId: row.event_id || '',
    role: row.role,
    displayName: row.display_name,
    email: row.email,
    company: row.company,
    tagline: row.tagline,
    bio: row.bio,
    website: row.website,
    headshotUrl: row.headshot_url,
    status: row.status,
    details: row.details || {},
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  }
}

// A profile flagged hidden is a system/admin identity that must never surface to
// members — kept out of the public directory, the "post as" pickers and direct
// profile views. Only an admin (or the owner) ever sees it.
function isHidden(item) {
  return !!(item && item.details && item.details.hidden === 'true')
}

async function getProfile(db, id) {
  const rows = await db.sql`SELECT * FROM profiles WHERE "id" = ${id} LIMIT 1`
  return normalizeRow(rows[0])
}

function siteOrigin(req) {
  const url = new URL(req.url)
  return `${url.protocol}//${url.host}`
}

function escapeEmail(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// The "you're approved" email sent to a member when their profile is approved
// directly through the moderation path (as opposed to through an application,
// which sends its own approval email). Mirrors applications.mjs so a profile
// that never came in through an application form still gets a verification
// email. Best-effort: routed through sendEmail, which is a no-op when no email
// provider is configured, so it never fails the approval it accompanies.
async function sendProfileApprovalEmail(profile, req) {
  if (!profile || !profile.email || !profile.id) return { sent: false }

  const profileUrl = `${siteOrigin(req)}/profile?id=${encodeURIComponent(profile.id)}`
  const name = profile.displayName || 'there'
  const subject = "You're approved for Beslyfe"
  const text = [
    `Hi ${name},`,
    '',
    "Your Beslyfe profile has been approved and is now live in the public directory.",
    `You can view it here: ${profileUrl}`,
    '',
    "Beslyfe",
  ].join('\n')
  const html = `<p>Hi ${escapeEmail(name)},</p>` +
    `<p>Your Beslyfe profile has been approved and is now live in the public directory.</p>` +
    `<p>You can view it here: <a href="${profileUrl}">${profileUrl}</a></p>` +
    `<p>Beslyfe</p>`

  return sendEmail({ to: profile.email, subject, text, html })
}

// Public responses must never leak member email addresses (mass-harvesting
// risk). Only an admin, or the owner viewing their own profile, sees the email.
function publicView(item, canSeeEmail) {
  if (!item) return item
  if (canSeeEmail) return item
  const { email, ...rest } = item
  return { ...rest, email: '' }
}

// The edition a new profile belongs to: the active event. Best-effort so a
// profile is never blocked from being created if the events table is missing.
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

export default async (req) => {
  const db = getDatabase()
  const url = new URL(req.url)
  const id = url.searchParams.get('id')

  // ── Read one or many profiles ──
  if (req.method === 'GET') {
    const session = await readSession(req, db)
    const isAdmin = await isLiveAdmin(session, db)

    if (id) {
      const item = await getProfile(db, id)
      if (!item) return json({ error: 'Not found' }, 404)
      const owner = !!(session && session.profileId === id)
      // Hidden system/admin profiles are invisible to everyone but an admin or
      // the owner — behave as if they don't exist for anyone else.
      if (isHidden(item) && !isAdmin && !owner) return json({ error: 'Not found' }, 404)
      return json({ item: publicView(item, isAdmin || owner) }, 200, { 'Cache-Control': 'no-store' })
    }

    const roleFilter = url.searchParams.get('role')
    const statusParam = url.searchParams.get('status')
    const hasRole = roleFilter && ROLES.has(roleFilter)
    // Public listing only ever exposes approved profiles. Any request for a
    // non-approved or "all" listing is a moderation view and requires admin.
    let status = 'approved'
    if (statusParam === 'all') status = 'all'
    else if (statusParam && STATUSES.has(statusParam)) status = statusParam
    if (status !== 'approved' && !isAdmin) {
      return json({ error: 'Admin access required.' }, session ? 403 : 401)
    }

    let rows
    if (status === 'all') {
      rows = hasRole
        ? await db.sql`SELECT * FROM profiles WHERE "role" = ${roleFilter} ORDER BY "created_at" DESC`
        : await db.sql`SELECT * FROM profiles ORDER BY "created_at" DESC`
    } else if (hasRole) {
      rows = await db.sql`SELECT * FROM profiles WHERE "status" = ${status} AND "role" = ${roleFilter} ORDER BY "created_at" DESC`
    } else {
      rows = await db.sql`SELECT * FROM profiles WHERE "status" = ${status} ORDER BY "created_at" DESC`
    }

    // Hidden system/admin profiles are filtered out of every member-facing
    // listing (directory, "post as" picker). An admin moderation view still
    // sees them so a system profile is never silently unaccounted for.
    let listed = rows.map(normalizeRow).filter(Boolean)
    if (!isAdmin) listed = listed.filter((it) => !isHidden(it))
    const items = listed.map((it) => publicView(it, isAdmin))
    return json({ items }, 200, { 'Cache-Control': 'no-store' })
  }

  // ── Create a profile (signed-in members; admins may pre-approve) ──
  if (req.method === 'POST') {
    const session = await requireSession(req, db)
    if (session instanceof Response) return session
    const isAdmin = await isLiveAdmin(session, db)
    const body = await readJsonBody(req)
    if (body instanceof Response) return body

    const role = ROLES.has(body.role) ? body.role : 'attendee'
    const values = {}
    for (const [key, max] of Object.entries(TEXT_FIELDS)) values[key] = str(body[key], max)
    const details = sanitizeDetails(body.details)
    // Admin-only detail keys (featured, tier) can never be self-assigned at
    // creation. A member creating their own sponsor profile cannot pick a tier;
    // it is granted later by the organizers. An admin's values are normalized.
    if (isAdmin) applyTierRules(details)
    else for (const k of ADMIN_DETAIL_KEYS) delete details[k]

    if (!values.displayName.trim() && !values.email.trim()) {
      return json({ error: 'A profile needs at least a name or an email.' }, 400)
    }
    const createEmailErr = emailError(values.email)
    if (createEmailErr) return json({ error: createEmailErr }, 400)

    const now = new Date().toISOString()
    const id = newId('')
    const eventId = await activeEventId(db)
    // New public profiles are held for moderation; only an admin can create an
    // already-approved profile. Approval otherwise flows through the admin path.
    const status = isAdmin && STATUSES.has(body.status) ? body.status : 'pending'
    await db.sql`
      INSERT INTO profiles (
        "id", "event_id", "role", "display_name", "email", "company", "tagline", "bio",
        "website", "headshot_url", "status", "details", "created_at", "updated_at"
      ) VALUES (
        ${id}, ${eventId}, ${role}, ${values.displayName}, ${values.email}, ${values.company},
        ${values.tagline}, ${values.bio}, ${values.website}, ${values.headshotUrl},
        ${status}, ${JSON.stringify(details)}::jsonb, ${now}, ${now}
      )
    `
    const item = await getProfile(db, id)
    return json({ ok: true, id, item })
  }

  // ── Update a profile (edit or moderation) ──
  if (req.method === 'PUT' || req.method === 'PATCH') {
    const cross = requireSameOrigin(req)
    if (cross) return cross
    const session = await requireSession(req, db)
    if (session instanceof Response) return session
    const isAdmin = await isLiveAdmin(session, db)
    const body = await readJsonBody(req)
    if (body instanceof Response) return body
    const targetId = (body && body.id) || id
    if (!targetId) return json({ error: 'Missing profile id' }, 400)

    const current = await getProfile(db, targetId)
    if (!current) return json({ error: 'Not found' }, 404)

    // Moderation-only update — admin only.
    if (body.status !== undefined && Object.keys(body).filter((k) => k !== 'id' && k !== 'status').length === 0) {
      if (!isAdmin) return json({ error: 'Admin access required.' }, 403)
      if (!STATUSES.has(body.status)) return json({ error: 'Invalid status' }, 400)
      const rows = await db.sql`
        UPDATE profiles SET "status" = ${body.status}, "updated_at" = ${new Date().toISOString()}
        WHERE "id" = ${targetId} RETURNING *
      `
      // A profile approved directly (not via an application) still deserves a
      // verification email, so send one on the pending→approved transition.
      const justApproved = body.status === 'approved' && current.status !== 'approved'
      const email = justApproved ? await sendProfileApprovalEmail(normalizeRow(rows[0]), req) : { sent: false }
      await recordAudit(db, req, session, {
        action: 'profile.status', resourceType: 'profile', resourceId: targetId,
        details: { name: current.displayName, statusBefore: current.status, statusAfter: body.status },
      })
      await createCrmActivityForContact(db, {
        email: current.email,
        companyName: current.company,
        eventId: current.eventId,
        actorAccountId: session.accountId || '',
        kind: 'status_change',
        title: `Profile ${body.status}`,
        body: `${current.status} -> ${body.status}`,
        details: { profileId: targetId, role: current.role, statusBefore: current.status, statusAfter: body.status },
      })
      return json({ ok: true, item: normalizeRow(rows[0]), approvalEmailSent: email.sent })
    }

    // Featured-only update (admin). Toggling whether a vendor/sponsor/speaker is
    // promoted on the homepage. The flag lives in the free-form `details` map so
    // no schema change is needed; merge it onto the existing details rather than
    // replacing them so the rest of the profile is untouched.
    if (body.featured !== undefined && Object.keys(body).filter((k) => k !== 'id' && k !== 'featured').length === 0) {
      if (!isAdmin) return json({ error: 'Admin access required.' }, 403)
      const details = { ...(current.details || {}), featured: body.featured ? 'true' : 'false' }
      const rows = await db.sql`
        UPDATE profiles SET "details" = ${JSON.stringify(details)}::jsonb, "updated_at" = ${new Date().toISOString()}
        WHERE "id" = ${targetId} RETURNING *
      `
      await recordAudit(db, req, session, {
        action: 'profile.featured', resourceType: 'profile', resourceId: targetId,
        details: { name: current.displayName, featured: body.featured ? 'true' : 'false' },
      })
      await createCrmActivityForContact(db, {
        email: current.email,
        companyName: current.company,
        eventId: current.eventId,
        actorAccountId: session.accountId || '',
        kind: 'status_change',
        title: body.featured ? 'Profile featured' : 'Profile unfeatured',
        body: current.displayName || current.company || current.email,
        details: { profileId: targetId, role: current.role, featured: body.featured ? 'true' : 'false' },
      })
      return json({ ok: true, item: normalizeRow(rows[0]) })
    }

    // Content edit — the profile's owner or an admin only. `featured` remains an
    // admin-only flag: a non-admin edit can never set or change it.
    if (!isAdmin && session.profileId !== targetId) {
      return json({ error: 'You can only edit your own profile.' }, 403)
    }
    if (body.email !== undefined) {
      const editEmailErr = emailError(body.email)
      if (editEmailErr) return json({ error: editEmailErr }, 400)
    }
    const role = ROLES.has(body.role) ? body.role : current.role
    let mergedDetails = current.details
    if (body.details !== undefined) {
      mergedDetails = { ...(current.details || {}), ...sanitizeDetails(body.details) }
      if (!isAdmin) {
        // A member editing their own profile can never change an admin-only
        // key (featured, tier) — restore each to its saved value after the merge.
        for (const k of ADMIN_DETAIL_KEYS) mergedDetails[k] = (current.details || {})[k]
      } else {
        applyTierRules(mergedDetails)
      }
    }
    const next = {
      displayName: body.displayName !== undefined ? str(body.displayName, TEXT_FIELDS.displayName) : current.displayName,
      email: body.email !== undefined ? str(body.email, TEXT_FIELDS.email) : current.email,
      company: body.company !== undefined ? str(body.company, TEXT_FIELDS.company) : current.company,
      tagline: body.tagline !== undefined ? str(body.tagline, TEXT_FIELDS.tagline) : current.tagline,
      bio: body.bio !== undefined ? str(body.bio, TEXT_FIELDS.bio) : current.bio,
      website: body.website !== undefined ? str(body.website, TEXT_FIELDS.website) : current.website,
      headshotUrl: body.headshotUrl !== undefined ? str(body.headshotUrl, TEXT_FIELDS.headshotUrl) : current.headshotUrl,
      details: mergedDetails,
    }
    const rows = await db.sql`
      UPDATE profiles SET
        "role" = ${role}, "display_name" = ${next.displayName}, "email" = ${next.email},
        "company" = ${next.company}, "tagline" = ${next.tagline}, "bio" = ${next.bio},
        "website" = ${next.website}, "headshot_url" = ${next.headshotUrl},
        "details" = ${JSON.stringify(next.details)}::jsonb, "updated_at" = ${new Date().toISOString()}
      WHERE "id" = ${targetId} RETURNING *
    `
    // Record only administrative edits of another member's profile; a member
    // editing their own profile is routine and would only add noise.
    if (isAdmin && session.profileId !== targetId) {
      await recordAudit(db, req, session, {
        action: 'profile.update', resourceType: 'profile', resourceId: targetId,
        details: { name: next.displayName || current.displayName, roleBefore: current.role, roleAfter: role },
      })
    }
    return json({ ok: true, item: normalizeRow(rows[0]) })
  }

  // ── Remove a profile (admin) ──
  if (req.method === 'DELETE') {
    const cross = requireSameOrigin(req)
    if (cross) return cross
    const admin = await requireAdmin(req, db)
    if (admin instanceof Response) return admin
    if (!id) return json({ error: 'Missing profile id' }, 400)
    const current = await getProfile(db, id)
    await db.sql`DELETE FROM profiles WHERE "id" = ${id}`
    // Remove the login account tied to this profile too, so deleting an unwanted
    // profile doesn't strand an orphaned account that can still sign in but has
    // no profile. The originating application is a historical record and is left
    // in place (admins delete those from the Applications view).
    const linkedAccounts = await db.sql`DELETE FROM accounts WHERE "profile_id" = ${id} RETURNING "id"`
    // Purge the same person from the back-office CRM so a single delete removes a
    // business/person everywhere it appears — previously an admin had to delete
    // the directory profile AND the CRM person/company separately. The CRM
    // dedupes people by lowercased email, so we match on that. A company left
    // with no people and no event links after this is an empty shell of the same
    // business, so it is removed as well; a company still referenced elsewhere is
    // kept. (The CRM may also hold contacts synced from applications with no
    // profile — those are untouched because they aren't matched by this delete.)
    let crmPeopleRemoved = 0, crmCompaniesRemoved = 0
    const email = current && current.email ? String(current.email).trim().toLowerCase() : ''
    if (email) {
      const people = await db.sql`SELECT "id", "company_id" FROM crm_people WHERE "email_key" = ${email}`
      for (const person of people) {
        await db.sql`DELETE FROM crm_person_roles WHERE "person_id" = ${person.id}`
        await db.sql`DELETE FROM crm_people WHERE "id" = ${person.id}`
        crmPeopleRemoved++
        if (person.company_id) {
          const peopleLeft = await db.sql`SELECT COUNT(*)::int AS n FROM crm_people WHERE "company_id" = ${person.company_id}`
          const eventsLeft = await db.sql`SELECT COUNT(*)::int AS n FROM crm_company_events WHERE "company_id" = ${person.company_id}`
          if ((peopleLeft[0] ? peopleLeft[0].n : 0) === 0 && (eventsLeft[0] ? eventsLeft[0].n : 0) === 0) {
            await db.sql`DELETE FROM crm_companies WHERE "id" = ${person.company_id}`
            crmCompaniesRemoved++
          }
        }
      }
    }
    await recordAudit(db, req, admin, {
      action: 'profile.delete', resourceType: 'profile', resourceId: id,
      details: { name: current ? current.displayName : '', role: current ? current.role : '', accountsRemoved: linkedAccounts.length, crmPeopleRemoved, crmCompaniesRemoved },
    })
    return json({ ok: true, accountsRemoved: linkedAccounts.length, crmPeopleRemoved, crmCompaniesRemoved })
  }

  return json({ error: 'Method Not Allowed' }, 405)
}
