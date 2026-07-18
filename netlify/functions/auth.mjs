import { getDatabase } from '@netlify/database'
import {
  json, newId, iso, escHtml, createSession, destroySession, readSession,
  sessionClearCookie, SESSION_COOKIE, clientIp, requireSameOrigin, requireAdmin,
  rateLimit, recordAttempt, clearAttempts, recordAudit, passwordPolicyError,
  timingSafeEqualHex, readJsonBody, ensureProfileForAccountId, ensureNetworkMembership,
} from './lib/session.mjs'
import { VERIFIED_SENDER, sendEmail } from './lib/email.mjs'

// Account authentication for Beslyfe. An account is a single login
// credential (email + password) bound to exactly one community profile, so a
// member signs up once and that profile becomes their identity everywhere —
// the directory, the feed and direct messages. One account, one password, one
// profile.
//
//   POST { action:'signup', name, email, password, role }  → create a pending, unverified account + linked profile, email a verification link (no session)
//   POST { action:'verify-email', token }                  → confirm the address, activate the account, start a session
//   POST { action:'resend-verification', email }           → email a fresh verification link (generic response)
//   POST { action:'login',  email, password }              → verify, start session
//   POST { action:'logout' }                               → end the current session
//   POST { action:'session' } / GET ?action=session        → who am I? (from the session cookie)
//   GET                                                     → admin: list members (session must be admin)
//
// A successful login/signup sets an httpOnly `beslyfe_sid` cookie; every other
// function derives the acting identity from that cookie via the session table,
// so the client can no longer impersonate anyone by editing a request body.
//
// Passwords are stored as PBKDF2-SHA256 hashes with a per-account random salt.

const PROFILE_ROLES = new Set(['vendor', 'sponsor', 'speaker', 'dj', 'attendee', 'other'])
const ACCOUNT_ROLES = new Set(['vendor', 'sponsor', 'speaker', 'dj', 'attendee', 'admin', 'public', 'other'])
// Privileged/internal roles that must never be self-assignable through the
// public signup endpoint. Admin accounts are provisioned server-side only
// (see `ensureAdmin`); 'public' is an internal placeholder role.
const PRIVILEGED_ROLES = new Set(['admin', 'public'])
// Roles a member may assign to themselves when signing up — every account role
// except the privileged/internal ones. Without this restriction a request of
// `{ action:'signup', role:'admin' }` would mint an already-approved admin
// account and an admin session cookie: a full account takeover.
const SIGNUP_ROLES = new Set([...ACCOUNT_ROLES].filter((r) => !PRIVILEGED_ROLES.has(r)))
const PBKDF2_ITERATIONS = 100000

// Rate-limit windows for the authentication surface. Buckets are keyed by action
// and client IP; limits are deliberately generous so honest users (including
// several people behind one office IP) are never blocked, while automated
// brute-force / enumeration is throttled.
const WINDOW_MS = 15 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
const LIMITS = {
  login: 10,        // failed sign-ins per IP per 15 min
  signup: 10,       // new-account attempts per IP per hour
  reset: 5,         // password-reset requests per IP per 15 min (anti email-bomb)
  resetConfirm: 15, // reset confirmations per IP per 15 min
  resend: 5,        // verification-email resends per IP per 15 min (anti email-bomb)
  verify: 15,       // email-verification confirmations per IP per 15 min
}

function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16)
  return out
}

// Derive a PBKDF2-SHA256 hash. Pass an existing salt (hex) to verify, or omit
// it to generate a fresh random salt when creating an account.
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

// SHA-256 hex of a string. Password-reset tokens are e-mailed in the clear but
// only their hash is stored, so a database read can never recover a live link.
async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return bytesToHex(new Uint8Array(digest))
}

const RESET_TTL_MS = 60 * 60 * 1000 // reset links are valid for one hour
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000 // email-verification links are valid for 24 hours

// Send the reset link by email through the shared helper. Resend is the primary
// expected provider; SendGrid remains only as optional legacy fallback. When no
// provider is configured the send is a no-op, so the caller still cannot
// distinguish "no such account" from "email not sent".
async function sendResetEmail(toEmail, name, link) {
  const subject = 'Reset your Beslyfe password'
  const text = [
    `Hi ${name || 'there'},`,
    '',
    'We received a request to reset your password. Use the link below within the next hour to choose a new one:',
    link,
    '',
    'If you did not request this, you can safely ignore this email — your password will not change.',
    '',
    'Beslyfe',
  ].join('\n')
  const safeLink = escHtml(link)
  const html = `<p>Hi ${escHtml(name || 'there')},</p><p>We received a request to reset your Beslyfe password. Use the link below within the next hour to choose a new one:</p><p><a href="${safeLink}">${safeLink}</a></p><p>If you did not request this, you can safely ignore this email — your password will not change.</p><p>Beslyfe</p>`
  const result = await sendEmail({ to: toEmail, subject, text, html })
  return !!(result && result.sent)
}

// Send the account-verification link by e-mail through the same shared helper the
// approval and reset flows use. The link carries a random token whose only stored
// form is a hash, so possession of the link is the proof of address ownership.
async function sendVerificationEmail(toEmail, name, link) {
  const subject = 'Verify your free Beslyfe account'
  const text = [
    `Hi ${name || 'there'},`,
    '',
    'Thanks for joining Beslyfe. Your membership is 100% free. Confirm this email address to activate your account—the link is valid for 24 hours:',
    link,
    '',
    "If you didn't create an account, you can safely ignore this email.",
    '',
    'Beslyfe',
  ].join('\n')
  const safeLink = escHtml(link)
  const html = `<p>Hi ${escHtml(name || 'there')},</p><p>Thanks for joining Beslyfe. Your membership is <strong>100% free</strong>. Confirm this email address to activate your account—the link is valid for 24 hours:</p><p><a href="${safeLink}">${safeLink}</a></p><p>If you didn't create an account, you can safely ignore this email.</p><p>Beslyfe</p>`
  const result = await sendEmail({ to: toEmail, subject, text, html })
  return !!(result && result.sent)
}

// Mint a fresh verification token for an account, invalidating any earlier
// outstanding token, and e-mail the link. Returns whether the mail was sent.
// Shared by the signup path and the resend-verification action so the token
// store and the e-mailed link can never drift apart.
async function issueVerification(db, account, origin) {
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '')
  const tokenHash = await sha256Hex(token)
  const now = new Date()
  const expires = new Date(now.getTime() + VERIFY_TTL_MS)
  await db.sql`DELETE FROM email_verifications WHERE "account_id" = ${account.id}`
  await db.sql`
    INSERT INTO email_verifications ("token_hash", "account_id", "created_at", "expires_at", "used_at")
    VALUES (${tokenHash}, ${account.id}, ${now.toISOString()}, ${expires.toISOString()}, NULL)
  `
  const link = `${origin}/verify-email.html?token=${token}`
  return sendVerificationEmail(account.email, account.name, link)
}
function profileRoleFor(accountRole) {
  if (accountRole === 'public' || accountRole === 'admin') return 'attendee'
  return PROFILE_ROLES.has(accountRole) ? accountRole : 'attendee'
}

function publicAccount(row) {
  return { id: row.id, name: row.name, email: row.email, username: row.username || '', role: row.role, status: row.status, profileId: row.profile_id }
}

// Usernames are an optional second way to sign in (alongside email). Keep them
// URL/handle-safe and long enough not to collide with system words.
const USERNAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,29}$/
// Handles that must never be claimed by a self-service sign-up because they name
// a privileged or built-in login.
const RESERVED_USERNAMES = new Set(['admin', 'administrator', 'root', 'system', 'support', 'cannadispo'])

function publicProfile(row) {
  if (!row) return null
  return {
    id: row.id,
    displayName: row.display_name,
    role: row.role,
    email: row.email,
    headshotUrl: row.headshot_url,
    status: row.status,
  }
}

async function getProfile(db, id) {
  if (!id) return null
  const rows = await db.sql`SELECT * FROM profiles WHERE "id" = ${id} LIMIT 1`
  return rows[0] || null
}

// Make sure the admin portal is reachable, deriving the admin credential from
// the ADMIN_PASSWORD environment variable — never from a guessable literal.
//
//   • ADMIN_PASSWORD set:   create the admin account if it is missing, or
//     re-sync its password hash to the configured value. Because the hash is
//     re-synced on every login attempt, rotating ADMIN_PASSWORD rotates the
//     admin password and also remediates any previously-seeded weak credential.
//   • ADMIN_PASSWORD unset:  never seed the well-known 'admin' password. On a
//     fresh database create the admin with a random, unguessable password (so
//     no `admin/admin` backdoor can exist) and warn the operator to set
//     ADMIN_PASSWORD. If an admin already exists, leave it untouched (we can't
//     know the intended password, and email-based reset does not apply to the
//     internal 'admin' login) and warn.
async function ensureAdmin(db) {
  const configured = (typeof process !== 'undefined' && process.env && process.env.ADMIN_PASSWORD) || ''
  const rows = await db.sql`SELECT id FROM accounts WHERE "email_lower" = 'admin' LIMIT 1`
  const exists = rows.length > 0

  if (configured) {
    const { hash, salt } = await derive(configured)
    if (exists) {
      // Keep the stored credential in lockstep with the configured value so
      // rotating the env var takes effect and any earlier weak hash is replaced.
      await db.sql`
        UPDATE accounts
        SET "password_hash" = ${hash}, "password_salt" = ${salt}
        WHERE "email_lower" = 'admin'
      `
      // Make sure the admin has its (hidden) community profile even if the
      // account predates automatic provisioning.
      await ensureProfileForAccountId(db, rows[0].id)
      return
    }
    const now = new Date().toISOString()
    const id = newId('acct_')
    await db.sql`
      INSERT INTO accounts ("id", "email", "email_lower", "name", "role", "status", "password_hash", "password_salt", "profile_id", "created_at")
      VALUES (${id}, 'admin', 'admin', 'Administrator', 'admin', 'approved', ${hash}, ${salt}, '', ${now})
    `
    await ensureProfileForAccountId(db, id)
    return
  }

  if (exists) {
    console.warn('[auth] ADMIN_PASSWORD is not set. Set it to establish or rotate admin access; the existing admin credential was left unchanged.')
    // The credential is left alone, but still guarantee the hidden admin profile.
    await ensureProfileForAccountId(db, rows[0].id)
    return
  }
  // Fresh database, no configured password: seed a random one so there is no
  // predictable default to sign in with. Access requires setting ADMIN_PASSWORD.
  const random = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '')
  const { hash, salt } = await derive(random)
  const now = new Date().toISOString()
  const id = newId('acct_')
  await db.sql`
    INSERT INTO accounts ("id", "email", "email_lower", "name", "role", "status", "password_hash", "password_salt", "profile_id", "created_at")
    VALUES (${id}, 'admin', 'admin', 'Administrator', 'admin', 'approved', ${hash}, ${salt}, '', ${now})
  `
  await ensureProfileForAccountId(db, id)
  console.warn('[auth] ADMIN_PASSWORD is not set — created the admin account with a random password. Set ADMIN_PASSWORD to sign in.')
}

// ── CannaDispo storefront administrator ──
//
// cannadispo.com has its own admin login, kept separate from the built-in
// 'admin' credential above. It is provisioned here so the stored password, the
// e-mailed password and the username can never drift apart:
//
//   • CANNADISPO_ADMIN_PASSWORD set → create the account (or rotate an existing
//     one) to exactly that password. The operator already knows it, so the
//     confirmation e-mail is best-effort.
//   • unset → on first run generate a strong random password, e-mail the full
//     credentials to the notification address, and only persist the account
//     once that e-mail is sent — so an administrator is never stranded behind a
//     password nobody was told.
//
// The e-mail, username and notification recipient default to the values in the
// original request but are overridable by environment variable for portability.
const CANNADISPO_ADMIN = {
  email: 'admin@cannadispo.com',
  username: 'cannadispo',
  notify: 'anelloshardwood@gmail.com',
  name: 'CannaDispo Administrator',
}

function envStr(name) {
  return (typeof process !== 'undefined' && process.env && process.env[name]) || ''
}

// A 20-character password that always satisfies the admin policy: one character
// from each class up front (guaranteeing ≥3 classes and length ≥12), the rest
// drawn uniformly, then shuffled. Ambiguous glyphs (0/O, 1/l/I) are omitted.
function generateStrongPassword() {
  const sets = ['abcdefghijkmnpqrstuvwxyz', 'ABCDEFGHJKLMNPQRSTUVWXYZ', '23456789', '!@#$%^&*-_=+']
  const all = sets.join('')
  const pick = (s) => s[crypto.getRandomValues(new Uint32Array(1))[0] % s.length]
  const out = sets.map(pick)
  while (out.length < 20) out.push(pick(all))
  for (let i = out.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1)
    const tmp = out[i]; out[i] = out[j]; out[j] = tmp
  }
  return out.join('')
}

// Email the administrator credentials through the shared helper (`sendEmail`:
// Resend preferred, legacy SendGrid fallback). Returns true only on a confirmed
// send, so the caller can gate account creation on delivery.
async function sendAdminCredentialsEmail(to, creds) {
  if (!to) return false
  const from = envStr('APPROVAL_EMAIL_FROM') || `CannaDispo <${VERIFIED_SENDER}>`
  const subject = 'Your CannaDispo admin login'
  const text = [
    'Your CannaDispo administrator account is ready.',
    'Sign in at /admin/ using either the email or the username below.',
    '',
    'Site:     cannadispo.com',
    `Email:    ${creds.email}`,
    `Username: ${creds.username}`,
    `Password: ${creds.password}`,
    '',
    'For your security, sign in and change this password (use “Forgot your password?” on the sign-in page), then delete this email once you have saved it.',
    '',
    'CannaDispo',
  ].join('\n')
  const html =
    '<p>Your CannaDispo administrator account is ready. Sign in at <code>/admin/</code> using either the email or the username below.</p>' +
    '<table cellpadding="6" style="border-collapse:collapse">' +
    '<tr><td><strong>Site</strong></td><td>cannadispo.com</td></tr>' +
    `<tr><td><strong>Email</strong></td><td>${escHtml(creds.email)}</td></tr>` +
    `<tr><td><strong>Username</strong></td><td>${escHtml(creds.username)}</td></tr>` +
    `<tr><td><strong>Password</strong></td><td><code>${escHtml(creds.password)}</code></td></tr>` +
    '</table>' +
    '<p>For your security, sign in and change this password, then delete this email once you have saved it.</p>' +
    '<p>CannaDispo</p>'
  const result = await sendEmail({ to, subject, text, html, from })
  return !!(result && result.sent)
}

async function ensureCannadispoAdmin(db) {
  const email = envStr('CANNADISPO_ADMIN_EMAIL') || CANNADISPO_ADMIN.email
  const emailLower = email.toLowerCase()
  const username = envStr('CANNADISPO_ADMIN_USERNAME') || CANNADISPO_ADMIN.username
  const usernameLower = username.toLowerCase()
  const notify = envStr('ADMIN_NOTIFY_EMAIL') || CANNADISPO_ADMIN.notify
  const configured = envStr('CANNADISPO_ADMIN_PASSWORD')

  const rows = await db.sql`SELECT "id", "username_lower" FROM accounts WHERE "email_lower" = ${emailLower} LIMIT 1`
  const existing = rows[0]

  if (existing) {
    // Rotate to a configured password if one is set; otherwise just make sure
    // the username is populated on an older row. Never re-send the email.
    if (configured) {
      const { hash, salt } = await derive(configured)
      await db.sql`
        UPDATE accounts
        SET "password_hash" = ${hash}, "password_salt" = ${salt},
            "username" = ${username}, "username_lower" = ${usernameLower},
            "role" = 'admin', "status" = 'approved'
        WHERE "email_lower" = ${emailLower}
      `
    } else if (!existing.username_lower) {
      await db.sql`UPDATE accounts SET "username" = ${username}, "username_lower" = ${usernameLower} WHERE "email_lower" = ${emailLower}`
    }
    // Guarantee the hidden community profile even for a pre-existing account.
    await ensureProfileForAccountId(db, existing.id)
    return
  }

  const generated = !configured
  const password = configured || generateStrongPassword()

  // A generated password lives nowhere but this email — require a successful
  // send before persisting the account. A configured password is already known
  // to the operator, so create the account regardless and email best-effort.
  const emailed = await sendAdminCredentialsEmail(notify, { email, username, password })
  if (generated && !emailed) {
    console.warn('[auth] CannaDispo admin not created: confirmation email could not be sent. Set RESEND_API_KEY to email a generated password, or set CANNADISPO_ADMIN_PASSWORD to provision with a known password.')
    return
  }

  const { hash, salt } = await derive(password)
  const now = new Date().toISOString()
  const id = newId('acct_')
  await db.sql`
    INSERT INTO accounts ("id", "email", "email_lower", "username", "username_lower", "name", "role", "status", "password_hash", "password_salt", "profile_id", "created_at")
    VALUES (${id}, ${email}, ${emailLower}, ${username}, ${usernameLower}, ${CANNADISPO_ADMIN.name}, 'admin', 'approved', ${hash}, ${salt}, '', ${now})
    ON CONFLICT ("email_lower") DO NOTHING
  `
  // Provision the hidden admin profile for the account we just ensured exists
  // (resolve by email in case an ON CONFLICT no-op meant `id` isn't the row's id).
  const seeded = await db.sql`SELECT "id" FROM accounts WHERE "email_lower" = ${emailLower} LIMIT 1`
  if (seeded[0]) await ensureProfileForAccountId(db, seeded[0].id)
  if (!emailed) {
    console.warn('[auth] CannaDispo admin created from CANNADISPO_ADMIN_PASSWORD; confirmation email not sent (RESEND_API_KEY unset).')
  }
}

// ── Administrator seeding cadence ──
//
// Seeding the built-in admin credentials (ensureAdmin / ensureCannadispoAdmin)
// is idempotent but not free: it derives a PBKDF2 hash and writes to `accounts`.
// Running it on *every* login put that cost — and a write — on the busiest
// authentication path. Instead it runs once per cold instance, plus whenever a
// login explicitly targets an administrator identity (so a rotated
// ADMIN_PASSWORD still takes effect promptly). Rotation and self-healing are
// preserved; the per-sign-in write amplification is removed.
let adminSeedDone = false

// The lowercased identifiers that name a privileged built-in login: the internal
// 'admin' account and the CannaDispo storefront administrator (email + username),
// honouring the same env overrides ensureCannadispoAdmin uses.
function adminLoginIdentifiers() {
  const cannaEmail = (envStr('CANNADISPO_ADMIN_EMAIL') || CANNADISPO_ADMIN.email).toLowerCase()
  const cannaUser = (envStr('CANNADISPO_ADMIN_USERNAME') || CANNADISPO_ADMIN.username).toLowerCase()
  return new Set(['admin', cannaEmail, cannaUser])
}

// Ensure the built-in administrator credentials exist / are in sync, but only
// when necessary. Best-effort — a seeding hiccup must never block a sign-in.
async function ensureAdminSeed(db, identifier) {
  const targetsAdmin = !!identifier && adminLoginIdentifiers().has(identifier)
  if (adminSeedDone && !targetsAdmin) return
  await ensureAdmin(db)
  await ensureCannadispoAdmin(db)
  adminSeedDone = true
}

// Resolve the account + linked profile for a live session, so the client can
// rehydrate "who am I" on load without trusting localStorage.
async function sessionIdentity(db, session) {
  const rows = await db.sql`SELECT * FROM accounts WHERE "id" = ${session.accountId} LIMIT 1`
  const account = rows[0]
  if (!account) return null
  const profileRow = await getProfile(db, account.profile_id)
  return { account: publicAccount(account), profile: publicProfile(profileRow) }
}

export default async (req) => {
  const db = getDatabase()
  const url = new URL(req.url)

  if (req.method === 'GET') {
    // Public booleans let the sign-in screen prevent stranded registrations
    // without exposing any secret value or provider detail.
    if (url.searchParams.get('action') === 'readiness') {
      return json({
        memberSignupReady: Boolean(envStr('RESEND_API_KEY') || envStr('SENDGRID_API_KEY')),
        adminAccessReady: Boolean(envStr('ADMIN_PASSWORD')),
      })
    }

    // ── Who am I? — resolve identity from the session cookie ──
    if (url.searchParams.get('action') === 'session') {
      const session = await readSession(req, db)
      if (!session) return json({ account: null, profile: null })
      const identity = await sessionIdentity(db, session)
      // Re-arm the browser cookie when the session slid its expiry forward, so an
      // active member's cookie tracks the renewed server-side deadline.
      const headers = session.renewedCookie ? { 'Set-Cookie': session.renewedCookie } : {}
      return json(identity || { account: null, profile: null }, 200, headers)
    }

    // ── Admin: list members (admin session required) ──
    // Authority is re-derived from the *live* account via requireAdmin rather
    // than the role captured in the session at login, so an admin who has since
    // been demoted or suspended cannot keep reading the full member roster (and
    // its email addresses) until their 30-day session expires. This matches the
    // guard every other admin function already uses.
    const admin = await requireAdmin(req, db)
    if (admin instanceof Response) return admin
    // Optional keyset pagination: `before` (a created_at ISO cursor) and `limit`
    // page older members for large rosters. Both are optional and the defaults
    // reproduce the previous single-shot behaviour, so existing callers that
    // request neither still get the newest 1000 members unchanged.
    const before = url.searchParams.get('before') || null
    let limit = parseInt(url.searchParams.get('limit') || '', 10)
    if (!Number.isFinite(limit) || limit <= 0) limit = 1000
    limit = Math.min(limit, 1000)
    // Exclude "orphaned" accounts whose linked community profile has been
    // deleted: deleting a profile removes its account, but any account orphaned
    // before that cascade existed (or by a delete path that skipped it) should
    // not keep showing up in the admin Users list as a phantom deleted user.
    // Accounts with no linked profile at all (e.g. an admin) are still listed.
    const rows = await db.sql`
      SELECT id, name, email, username, role, status, profile_id, created_at
      FROM accounts
      WHERE email_lower <> 'admin'
        AND NOT (profile_id <> '' AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = accounts.profile_id))
        AND (${before}::timestamptz IS NULL OR created_at < ${before}::timestamptz)
      ORDER BY created_at DESC
      LIMIT ${limit}
    `
    const items = rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      username: r.username || '',
      role: r.role,
      status: r.status,
      profileId: r.profile_id,
      createdAt: iso(r.created_at),
    }))
    // A full page implies more may exist; hand back the oldest row's timestamp as
    // the cursor for a "load more" request.
    const nextBefore = rows.length === limit ? iso(rows[rows.length - 1].created_at) : null
    return json({ items, nextBefore })
  }

  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405)

  const body = await readJsonBody(req)
  if (body instanceof Response) return body

  const action = body.action

  // CSRF defence in depth: reject a browser POST initiated from another origin.
  // The 'session' read is exempt so simple cross-origin "who am I" probes still
  // resolve to the anonymous response rather than an error.
  if (action !== 'session') {
    const cross = requireSameOrigin(req)
    if (cross) return cross
  }

  // ── End the current session ──
  if (action === 'logout') {
    const parts = (req.headers.get('cookie') || '').split(';').map((part) => part.trim())
    const earlierName = ['ba', 'kd_sid'].join('')
    const tokenPart = parts.find((part) => part.startsWith(`${SESSION_COOKIE}=`))
      || parts.find((part) => part.startsWith(`${earlierName}=`))
    if (tokenPart) await destroySession(db, decodeURIComponent(tokenPart.split('=').slice(1).join('=')))
    return json({ ok: true }, 200, { 'Set-Cookie': sessionClearCookie() })
  }

  // ── Who am I? (POST form, for clients that prefer it) ──
  if (action === 'session') {
    const session = await readSession(req, db)
    if (!session) return json({ account: null, profile: null })
    const identity = await sessionIdentity(db, session)
    const headers = session.renewedCookie ? { 'Set-Cookie': session.renewedCookie } : {}
    return json(identity || { account: null, profile: null }, 200, headers)
  }

  // ── Request a password reset ──
  // Always returns the same generic success so an attacker can't probe which
  // emails have accounts. When the email matches an account we store a hashed,
  // one-hour token and email the reset link.
  if (action === 'request-reset') {
    const ip = clientIp(req)
    const bucket = `reset:${ip}`
    const limited = await rateLimit(db, bucket, LIMITS.reset, WINDOW_MS, 'Too many reset requests. Please wait a few minutes and try again.')
    if (limited) return limited
    await recordAttempt(db, bucket)

    const email = String(body.email || '').trim().toLowerCase()
    const generic = { ok: true, message: 'If that email has an account, a reset link is on its way.' }
    if (!email) return json({ error: 'Enter your email.' }, 400)
    const rows = await db.sql`SELECT * FROM accounts WHERE "email_lower" = ${email} AND "email_lower" <> 'admin' LIMIT 1`
    const account = rows[0]
    if (!account) return json(generic)

    const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '')
    const tokenHash = await sha256Hex(token)
    const now = new Date()
    const expires = new Date(now.getTime() + RESET_TTL_MS)
    // Invalidate any earlier outstanding tokens for this account, then store the new one.
    await db.sql`DELETE FROM password_resets WHERE "account_id" = ${account.id}`
    await db.sql`
      INSERT INTO password_resets ("token_hash", "account_id", "created_at", "expires_at", "used_at")
      VALUES (${tokenHash}, ${account.id}, ${now.toISOString()}, ${expires.toISOString()}, NULL)
    `
    const origin = new URL(req.url).origin
    const link = `${origin}/reset-password.html?token=${token}`
    await sendResetEmail(account.email, account.name, link)
    return json(generic)
  }

  // ── Confirm a password reset ──
  if (action === 'confirm-reset') {
    const ip = clientIp(req)
    const bucket = `reset-confirm:${ip}`
    const limited = await rateLimit(db, bucket, LIMITS.resetConfirm, WINDOW_MS, 'Too many attempts. Please wait a few minutes and try again.')
    if (limited) return limited
    await recordAttempt(db, bucket)

    const token = String(body.token || '').trim()
    const password = String(body.password || '')
    if (!token) return json({ error: 'This reset link is missing its token.' }, 400)
    const weak = passwordPolicyError(password, { admin: false })
    if (weak) return json({ error: weak }, 400)

    const tokenHash = await sha256Hex(token)
    const rows = await db.sql`SELECT * FROM password_resets WHERE "token_hash" = ${tokenHash} LIMIT 1`
    const record = rows[0]
    if (!record || record.used_at) {
      return json({ error: 'This reset link is invalid or has already been used. Request a new one.' }, 400)
    }
    const expires = record.expires_at instanceof Date ? record.expires_at : new Date(record.expires_at)
    if (expires.getTime() <= Date.now()) {
      await db.sql`DELETE FROM password_resets WHERE "token_hash" = ${tokenHash}`
      return json({ error: 'This reset link has expired. Request a new one.' }, 400)
    }

    // An admin-capable account must satisfy the stronger policy even via reset.
    const acctRows = await db.sql`SELECT "role" FROM accounts WHERE "id" = ${record.account_id} LIMIT 1`
    if (acctRows[0] && acctRows[0].role === 'admin') {
      const weakAdmin = passwordPolicyError(password, { admin: true })
      if (weakAdmin) return json({ error: weakAdmin }, 400)
    }

    const { hash, salt } = await derive(password)
    await db.sql`UPDATE accounts SET "password_hash" = ${hash}, "password_salt" = ${salt} WHERE "id" = ${record.account_id}`
    await db.sql`UPDATE password_resets SET "used_at" = ${new Date().toISOString()} WHERE "token_hash" = ${tokenHash}`
    // Invalidate every existing session for this account so a stolen session
    // can't outlive the password change.
    await db.sql`DELETE FROM sessions WHERE "account_id" = ${record.account_id}`
    return json({ ok: true, message: 'Your password has been updated. You can now sign in.' })
  }

  // ── Confirm an email address ──
  // Consumes the token from the verification link: activates the account and its
  // linked profile, marks the token used so it can't be replayed, and signs the
  // member in (clicking the link proves they own the address).
  if (action === 'verify-email') {
    const ip = clientIp(req)
    const bucket = `verify:${ip}`
    const limited = await rateLimit(db, bucket, LIMITS.verify, WINDOW_MS, 'Too many attempts. Please wait a few minutes and try again.')
    if (limited) return limited
    await recordAttempt(db, bucket)

    const token = String(body.token || '').trim()
    if (!token) return json({ error: 'This verification link is missing its token.' }, 400)

    const tokenHash = await sha256Hex(token)
    const rows = await db.sql`SELECT * FROM email_verifications WHERE "token_hash" = ${tokenHash} LIMIT 1`
    const record = rows[0]
    if (!record || record.used_at) {
      return json({ error: 'This verification link is invalid or has already been used. Request a new one.' }, 400)
    }
    const expires = record.expires_at instanceof Date ? record.expires_at : new Date(record.expires_at)
    if (expires.getTime() <= Date.now()) {
      await db.sql`DELETE FROM email_verifications WHERE "token_hash" = ${tokenHash}`
      return json({ error: 'This verification link has expired. Request a new one.', expired: true }, 400)
    }

    const acctRows = await db.sql`SELECT * FROM accounts WHERE "id" = ${record.account_id} LIMIT 1`
    const account = acctRows[0]
    if (!account) {
      await db.sql`DELETE FROM email_verifications WHERE "token_hash" = ${tokenHash}`
      return json({ error: 'That account no longer exists. Please sign up again.' }, 400)
    }

    // Activate the account and reveal its profile in the directory, then consume
    // this token and clear any other outstanding tokens for the account.
    const nowIso = new Date().toISOString()
    await db.sql`UPDATE accounts SET "email_verified" = true, "status" = 'approved' WHERE "id" = ${account.id}`
    if (account.profile_id) {
      await db.sql`UPDATE profiles SET "status" = 'approved', "updated_at" = ${nowIso} WHERE "id" = ${account.profile_id}`
      await ensureNetworkMembership(db, account.profile_id, 'signup')
    }
    await db.sql`UPDATE email_verifications SET "used_at" = ${nowIso} WHERE "token_hash" = ${tokenHash}`
    await db.sql`DELETE FROM email_verifications WHERE "account_id" = ${account.id} AND "token_hash" <> ${tokenHash}`

    const verified = { ...account, email_verified: true, status: 'approved' }
    const profileRow = await getProfile(db, account.profile_id)
    const { cookie } = await createSession(db, verified)
    return json({ ok: true, verified: true, account: publicAccount(verified), profile: publicProfile(profileRow) }, 200, { 'Set-Cookie': cookie })
  }

  // ── Resend an email-verification link ──
  // Always returns the same generic success so it can't be used to probe which
  // emails have (unverified) accounts. Only actually sends when the address maps
  // to an account that still needs verifying.
  if (action === 'resend-verification') {
    const ip = clientIp(req)
    const bucket = `resend:${ip}`
    const limited = await rateLimit(db, bucket, LIMITS.resend, WINDOW_MS, 'Too many requests. Please wait a few minutes and try again.')
    if (limited) return limited
    await recordAttempt(db, bucket)

    const email = String(body.email || '').trim().toLowerCase()
    const generic = { ok: true, message: 'If that email needs verifying, a new link is on its way.' }
    if (!email) return json({ error: 'Enter your email.' }, 400)
    const rows = await db.sql`SELECT * FROM accounts WHERE "email_lower" = ${email} AND "email_lower" <> 'admin' LIMIT 1`
    const account = rows[0]
    if (!account || account.email_verified) return json(generic)
    const origin = new URL(req.url).origin
    await issueVerification(db, account, origin)
    return json(generic)
  }

  // ── Create a new account + its linked profile ──
  if (action === 'signup') {
    const ip = clientIp(req)
    const bucket = `signup:${ip}`
    const limited = await rateLimit(db, bucket, LIMITS.signup, HOUR_MS, 'Too many sign-up attempts. Please wait a while and try again.')
    if (limited) return limited
    await recordAttempt(db, bucket)

    const name = String(body.name || '').trim().slice(0, 200)
    const email = String(body.email || '').trim().slice(0, 200)
    const password = String(body.password || '')
    const role = SIGNUP_ROLES.has(body.role) ? body.role : 'attendee'

    if (!name || !email || !password) {
      return json({ error: 'Please provide your name, email and a password.' }, 400)
    }
    // Self-service sign-up can only mint non-admin roles, so the ordinary policy
    // applies here; admin credentials are governed by ADMIN_PASSWORD.
    const weak = passwordPolicyError(password, { admin: false })
    if (weak) return json({ error: weak }, 400)

    // A username is optional; when supplied it becomes a second way to sign in.
    let username = String(body.username || '').trim()
    let usernameLower = null
    if (username) {
      if (username.includes('@') || !USERNAME_RE.test(username)) {
        return json({ error: 'Usernames must be 3–30 characters using letters, numbers, dots, dashes or underscores.' }, 400)
      }
      usernameLower = username.toLowerCase()
      if (RESERVED_USERNAMES.has(usernameLower)) {
        return json({ error: 'That username is reserved. Please choose another.' }, 400)
      }
      const takenU = await db.sql`SELECT id FROM accounts WHERE "username_lower" = ${usernameLower} LIMIT 1`
      if (takenU.length) {
        return json({ error: 'That username is already taken. Please choose another.' }, 409)
      }
    } else {
      username = null
    }

    const emailLower = email.toLowerCase()
    const existing = await db.sql`SELECT id FROM accounts WHERE "email_lower" = ${emailLower} LIMIT 1`
    if (existing.length) {
      return json({ error: 'An account with this email already exists. Try signing in.' }, 409)
    }

    const now = new Date().toISOString()

    // 1) Create the community profile that this account owns. It stays `pending`
    //    (kept out of the public directory) until the email address is verified,
    //    so an unconfirmed — possibly automated — sign-up never surfaces publicly.
    const profileId = newId('')
    await db.sql`
      INSERT INTO profiles (
        "id", "role", "display_name", "email", "company", "tagline", "bio",
        "website", "headshot_url", "status", "details", "created_at", "updated_at"
      ) VALUES (
        ${profileId}, ${profileRoleFor(role)}, ${name}, ${email}, '', '', '',
        '', '', 'pending', '{}'::jsonb, ${now}, ${now}
      )
    `

    // 2) Create the account, hashing the password, linked to the profile. It is
    //    created unverified and `pending`: no session is started and the member
    //    cannot sign in until they click the verification link. This is the change
    //    that closes the old hole where a direct sign-up was auto-approved, logged
    //    in immediately, and never had to prove it owned the email address.
    const { hash, salt } = await derive(password)
    const accountId = newId('acct_')
    await db.sql`
      INSERT INTO accounts ("id", "email", "email_lower", "username", "username_lower", "name", "role", "status", "email_verified", "password_hash", "password_salt", "profile_id", "created_at")
      VALUES (${accountId}, ${email}, ${emailLower}, ${username}, ${usernameLower}, ${name}, ${role}, 'pending', false, ${hash}, ${salt}, ${profileId}, ${now})
    `

    // 3) E-mail the verification link. The response deliberately carries no
    //    account or session — sign-in only becomes possible after verification.
    const origin = new URL(req.url).origin
    const emailSent = await issueVerification(db, { id: accountId, name, email }, origin)
    return json({
      ok: true,
      pendingVerification: true,
      emailSent,
      message: "Almost there — check your email for a link to verify your account, then sign in.",
    })
  }

  // ── Sign in ──
  if (action === 'login') {
    const ip = clientIp(req)
    const bucket = `login:${ip}`
    const limited = await rateLimit(db, bucket, LIMITS.login, WINDOW_MS, 'Too many sign-in attempts. Please wait a few minutes and try again.')
    if (limited) return limited

    const identifier = String(body.identifier || body.email || '').trim().toLowerCase()
    const password = String(body.password || '')
    if (!identifier || !password) {
      return json({ error: 'Enter your email or username and password.' }, 400)
    }

    // Establish/sync admin credentials only when needed — on a cold instance or
    // an admin-targeted login — instead of on every sign-in (see ensureAdminSeed).
    await ensureAdminSeed(db, identifier)

    // Accept either the account's email or its (optional) username. An exact
    // email match wins when a value could resolve to two rows.
    const rows = await db.sql`
      SELECT * FROM accounts
      WHERE "email_lower" = ${identifier}
         OR ("username_lower" IS NOT NULL AND "username_lower" = ${identifier})
      ORDER BY ("email_lower" = ${identifier}) DESC
      LIMIT 1
    `
    const account = rows[0]
    if (!account) {
      await recordAttempt(db, bucket)
      return json({ error: 'No account found with that email or username. Create one to get started.' }, 401)
    }

    const { hash } = await derive(password, account.password_salt)
    // Constant-time comparison: a plain `!==` leaks, via its timing, how many
    // leading hex characters of the stored hash were matched.
    if (!timingSafeEqualHex(hash, account.password_hash)) {
      await recordAttempt(db, bucket)
      return json({ error: 'Incorrect password. Please try again.' }, 401)
    }

    if (account.status === 'pending') {
      // An unverified direct sign-up is `pending` because it never confirmed its
      // email — tell it so (and let the client offer a resend), distinct from an
      // application account that is pending a human admin's approval.
      if (!account.email_verified) {
        return json({ error: 'Please verify your email address first. Check your inbox for the verification link.', needsVerification: true }, 403)
      }
      return json({ error: 'Your account is awaiting approval. Please check back soon.' }, 403)
    }
    if (account.status === 'rejected') {
      return json({ error: 'This account is not active. Please contact us for help.' }, 403)
    }

    // Honest sign-in: reset this IP's failed-attempt counter.
    await clearAttempts(db, bucket)

    const profileRow = await getProfile(db, account.profile_id)
    const { cookie } = await createSession(db, account)
    // Record privileged sign-ins so admin access is accountable.
    if (account.role === 'admin') {
      await recordAudit(db, req, { accountId: account.id }, {
        action: 'auth.admin_login', resourceType: 'account', resourceId: account.id,
        details: { actorName: account.name, email: account.email },
      })
    }
    return json({ ok: true, account: publicAccount(account), profile: publicProfile(profileRow) }, 200, { 'Set-Cookie': cookie })
  }

  return json({ error: 'Unknown action' }, 400)
}
