import { getDatabase } from '@netlify/database'

// Shared server-side helpers for every Bak'd On The Bay function.
//
// The single most important thing this module provides is *trustworthy
// identity*. Before this existed, each function read the acting profile id and
// role straight out of the request body or query string, so any caller could
// claim to be anyone. Now identity comes only from a signed-in session:
//
//   • On login, auth.mjs calls `createSession` which mints a random opaque
//     token, stores it in the `sessions` table bound to the account, and returns
//     a `Set-Cookie` header for an httpOnly cookie.
//   • Every other function calls `readSession(req)` (or the `requireSession` /
//     `requireAdmin` guards) to resolve who is calling. The acting id and role
//     are taken from the database row, never from anything the client sent.
//
// Because the token is opaque and server-stored, there is no signing secret to
// manage and a leaked/expired token can be revoked by deleting its row.

export const SESSION_COOKIE = 'bakd_sid'
const SESSION_TTL_DAYS = 30
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
// Sliding-renewal threshold. When a session is used and less than this much of
// its life remains, its expiry is pushed back out to a full TTL. This keeps an
// actively-used session alive indefinitely (an engaged member is never logged
// out on the fixed 30-day boundary) while a token that goes idle still expires
// at its last-renewed deadline. Renewing only in the final third avoids writing
// to the sessions table on every single request.
const SESSION_RENEW_AFTER_MS = SESSION_TTL_MS * (2 / 3)

export function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extraHeaders },
  })
}

// Collision-resistant identifier. `crypto.randomUUID()` replaces the old
// `Date.now()`-plus-`Math.random()` scheme that could collide within a
// millisecond and throw an unhandled primary-key violation on insert.
export function newId(prefix = '') {
  return `${prefix}${crypto.randomUUID()}`
}

export function iso(value) {
  return value instanceof Date ? value.toISOString() : value
}

// Coerce any incoming value to a bounded string. Shared by the functions that
// used to each carry their own copy (events.mjs, …) so the truncation rule can
// never drift between endpoints.
export function str(value, max) {
  if (value === null || value === undefined) return ''
  const s = String(value)
  return max ? s.slice(0, max) : s
}

// Parse a date-ish value to an ISO string, or null. Accepts '' → null and
// rejects unparseable input rather than throwing.
export function toDate(value) {
  if (!value) return null
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

// Best-effort client IP for rate-limiting/audit. Netlify sets
// `x-nf-client-connection-ip`; fall back to the first `x-forwarded-for` hop.
export function clientIp(req) {
  const direct = req.headers.get('x-nf-client-connection-ip')
  if (direct) return direct.trim()
  const fwd = req.headers.get('x-forwarded-for') || ''
  return fwd.split(',')[0].trim() || 'unknown'
}

// Escape the five HTML-significant characters. Used server-side wherever text is
// interpolated into an HTML response (e.g. approval emails, media captions).
export function escHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ── Password policy ──

// Minimum length for an ordinary member credential, and the stricter floor for
// an admin-capable account. Both are enforced only when a password is *set*
// (sign-up, password reset), so existing accounts with older, shorter passwords
// can still sign in — the policy raises the bar going forward without locking
// anyone out.
export const PASSWORD_MIN = 8
export const ADMIN_PASSWORD_MIN = 12

// Validate a proposed password against the policy. Returns a human-readable
// error string when it is too weak, or null when it is acceptable. Admin-capable
// accounts additionally require a mix of character classes so a privileged login
// can't be a long-but-trivial string. Ordinary members only face the length
// floor, keeping sign-up friction low.
export function passwordPolicyError(password, { admin = false } = {}) {
  const value = String(password || '')
  const min = admin ? ADMIN_PASSWORD_MIN : PASSWORD_MIN
  if (value.length < min) {
    return `Password must be at least ${min} characters.`
  }
  if (admin) {
    const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(value)).length
    if (classes < 3) {
      return 'An administrator password must mix at least three of: lowercase, uppercase, numbers and symbols.'
    }
  }
  return null
}

// Constant-time equality of two hex strings (e.g. PBKDF2 hashes). A naive
// `a === b` short-circuits on the first differing character, so the time it
// takes leaks how many leading characters matched — a timing side-channel an
// attacker can walk to recover a hash. This compares every character with a
// fixed amount of work regardless of where (or whether) they differ. Length is
// folded into the accumulator so mismatched lengths also fail without an early
// return.
export function timingSafeEqualHex(a, b) {
  const sa = String(a == null ? '' : a)
  const sb = String(b == null ? '' : b)
  let diff = sa.length ^ sb.length
  const n = Math.max(sa.length, sb.length)
  for (let i = 0; i < n; i++) {
    diff |= (sa.charCodeAt(i) || 0) ^ (sb.charCodeAt(i) || 0)
  }
  return diff === 0
}

// ── Request parsing ──

// Parse a JSON request body, returning the object on success or a ready-to-send
// error Response on failure — collapsing the identical parse/try-catch/validate
// block every function used to carry. Usage mirrors the session guards:
//   const body = await readJsonBody(req)
//   if (body instanceof Response) return body
export async function readJsonBody(req) {
  let body
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }
  if (!body || typeof body !== 'object') return json({ error: 'Expected a JSON object' }, 400)
  return body
}

// ── Structured logging ──

// A correlation id for one request, so log lines from the same call can be
// grouped when triaging an incident. Netlify sets `x-nf-request-id`; fall back
// to a generated id when it is absent (local dev, non-Netlify clients).
export function requestId(req) {
  try {
    const id = req && req.headers && req.headers.get('x-nf-request-id')
    if (id) return id
  } catch { /* ignore */ }
  return newId('req_')
}

// Emit one structured (JSON) log line. Server-side logging was previously ad-hoc
// `console.warn(string)` scattered across functions; routing it through here
// gives every line a consistent shape (level, scope, message, request id, and
// any extra fields) that log aggregation can parse and alert on. Never throws —
// logging must not be able to fail the request it is describing.
export function logEvent(level, scope, message, meta = {}) {
  try {
    const line = { level, scope, message, ...meta, at: new Date().toISOString() }
    const text = JSON.stringify(line)
    if (level === 'error') console.error(text)
    else if (level === 'warn') console.warn(text)
    else console.log(text)
  } catch { /* logging must never throw */ }
}

// Convenience wrappers. `error` accepts an Error or string and is reduced to its
// message so a full stack never bloats the log line.
export function logError(scope, message, error, meta = {}) {
  const err = error instanceof Error ? error.message : (error ? String(error) : '')
  logEvent('error', scope, message, err ? { ...meta, error: err } : meta)
}
export function logWarn(scope, message, meta = {}) {
  logEvent('warn', scope, message, meta)
}

// ── Cookies ──

function parseCookies(req) {
  const header = req.headers.get('cookie') || ''
  const out = {}
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const k = part.slice(0, idx).trim()
    if (k) out[k] = decodeURIComponent(part.slice(idx + 1).trim())
  }
  return out
}

function sessionCookie(token, maxAgeSeconds) {
  const attrs = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    // Strict (was Lax): the session cookie is never attached to a request that
    // originates from another site, so a cross-site form or link can't ride an
    // admin's ambient session to perform a state change (CSRF). Every legitimate
    // admin/app request is same-site, so this is transparent to real use.
    'SameSite=Strict',
    `Max-Age=${maxAgeSeconds}`,
  ]
  return attrs.join('; ')
}

// A `Set-Cookie` value that installs a fresh session cookie.
export function sessionSetCookie(token) {
  return sessionCookie(token, Math.floor(SESSION_TTL_MS / 1000))
}

// A `Set-Cookie` value that immediately clears the session cookie.
export function sessionClearCookie() {
  return sessionCookie('', 0)
}

// ── Sessions ──

// Create a session for a freshly authenticated account and return both the
// token and the `Set-Cookie` header to send back. Callers should attach the
// header to their JSON response, e.g. `json(body, 200, { 'Set-Cookie': cookie })`.
export async function createSession(db, account) {
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '')
  const now = new Date()
  const expires = new Date(now.getTime() + SESSION_TTL_MS)
  await db.sql`
    INSERT INTO sessions ("token", "account_id", "profile_id", "role", "created_at", "expires_at")
    VALUES (${token}, ${account.id}, ${account.profile_id || account.profileId || ''}, ${account.role || 'attendee'}, ${now.toISOString()}, ${expires.toISOString()})
  `
  return { token, cookie: sessionSetCookie(token) }
}

// Delete a specific session (logout). Safe to call with a missing/blank token.
export async function destroySession(db, token) {
  if (!token) return
  await db.sql`DELETE FROM sessions WHERE "token" = ${token}`
}

// Resolve the caller's identity from their session cookie, or null when there
// is no valid, unexpired session. Returns { token, accountId, profileId, role }.
//
// Active use slides the expiry forward: when a valid session is within its final
// third, its `expires_at` is pushed back to a fresh full TTL and a refreshed
// cookie is attached as `renewedCookie` so callers that emit a response (e.g.
// the auth `session` endpoint the shell polls on load) can re-arm the browser
// cookie too. Idle tokens are never touched and still lapse at their deadline.
export async function readSession(req, db = getDatabase()) {
  const token = parseCookies(req)[SESSION_COOKIE]
  if (!token) return null
  const rows = await db.sql`SELECT * FROM sessions WHERE "token" = ${token} LIMIT 1`
  const row = rows[0]
  if (!row) return null
  const expires = row.expires_at instanceof Date ? row.expires_at : new Date(row.expires_at)
  const now = Date.now()
  if (expires.getTime() <= now) {
    // Lazily sweep the expired row so it can't be reused.
    await db.sql`DELETE FROM sessions WHERE "token" = ${token}`
    return null
  }
  const session = { token, accountId: row.account_id, profileId: row.profile_id, role: row.role }
  // Sliding renewal, best-effort: extending the session must never fail the read.
  if (expires.getTime() - now < SESSION_RENEW_AFTER_MS) {
    const nextExpiry = new Date(now + SESSION_TTL_MS)
    try {
      await db.sql`UPDATE sessions SET "expires_at" = ${nextExpiry.toISOString()} WHERE "token" = ${token}`
      session.renewedCookie = sessionSetCookie(token)
    } catch { /* keep the existing deadline on a transient write failure */ }
  }
  return session
}

// Guard: resolve the session or return a 401 Response. Usage:
//   const session = await requireSession(req, db)
//   if (session instanceof Response) return session
export async function requireSession(req, db = getDatabase()) {
  const session = await readSession(req, db)
  if (!session) return json({ error: 'Please sign in to continue.' }, 401)
  return session
}

// Guard: resolve an admin session or return 401/403.
//
// The session row records the role captured at login, but authority is
// re-derived from the *live* account on every call: an admin who has since been
// demoted or whose account was rejected/suspended is refused immediately, even
// though their session cookie is still otherwise valid. This closes the window
// where a revoked admin could keep operating until their 30-day session expired.
export async function requireAdmin(req, db = getDatabase()) {
  const session = await readSession(req, db)
  if (!session) return json({ error: 'Please sign in to continue.' }, 401)
  let account
  try {
    const rows = await db.sql`SELECT "role", "status" FROM accounts WHERE "id" = ${session.accountId} LIMIT 1`
    account = rows[0]
  } catch {
    // If the account can't be read, fall back to the session's captured role
    // rather than locking every admin out on a transient database hiccup.
    if (session.role === 'admin') return session
    return json({ error: 'Admin access required.' }, 403)
  }
  const revoked = !account || account.role !== 'admin' ||
    (account.status && account.status !== 'approved')
  if (revoked) {
    // Retire the now-powerless session so it stops being presented.
    try { await db.sql`DELETE FROM sessions WHERE "token" = ${session.token}` } catch {}
    return json({ error: 'Admin access required.' }, 403)
  }
  return { ...session, role: account.role }
}

// Boolean form of the live-authority check above, for endpoints that serve both
// public and admin callers from one handler (e.g. profiles GET, where a public
// listing is fine but a moderation listing is admin-only). Unlike `requireAdmin`
// this never returns a Response: it resolves the caller's *current* admin status
// from the live account so a since-demoted or suspended admin loses elevated
// access immediately, even while their session cookie is still otherwise valid.
// Returns false for a missing session, and falls back to the session's captured
// role only when the account can't be read (a transient DB hiccup) so a blip
// doesn't strip a real admin mid-session.
export async function isLiveAdmin(session, db = getDatabase()) {
  if (!session || !session.accountId) return false
  try {
    const rows = await db.sql`SELECT "role", "status" FROM accounts WHERE "id" = ${session.accountId} LIMIT 1`
    const account = rows[0]
    if (!account) return false
    return account.role === 'admin' && (!account.status || account.status === 'approved')
  } catch {
    return session.role === 'admin'
  }
}

// ── Community profile provisioning ──

// The community profile roles a member-facing profile may take. Kept in sync
// with auth.mjs / profiles.mjs so an auto-created profile lands in a valid role.
const MEMBER_PROFILE_ROLES = new Set(['vendor', 'sponsor', 'speaker', 'dj', 'attendee', 'other'])

// Decide the community-profile shape for an account. Admin accounts get a hidden
// "system" profile: the admin can post, follow and receive notifications like
// anyone else, but the profile carries `details.hidden = 'true'` so it never
// appears in the public member directory or the "post as" profile pickers.
// Everyone else gets an ordinary, visible profile derived from their account.
export function profileShapeForAccount(account) {
  const isAdmin = !!(account && account.role === 'admin')
  const role = isAdmin ? 'admin' : (MEMBER_PROFILE_ROLES.has(account && account.role) ? account.role : 'attendee')
  const fallbackName = isAdmin ? 'Administrator' : 'Member'
  const displayName = String((account && (account.name || account.email)) || fallbackName).slice(0, 200)
  const email = String((account && account.email) || '').slice(0, 200)
  return { role, displayName, email, status: 'approved', details: isAdmin ? { hidden: 'true' } : {} }
}

// Insert a fresh community profile for an account that has none, link it to the
// account, and repoint the account's sessions at it. Returns the new profile id,
// or '' when the insert failed. The account/session links are best-effort so a
// hiccup there never throws away the created profile.
export async function provisionProfileForAccount(db, account) {
  if (!account || !account.id) return ''
  const shape = profileShapeForAccount(account)
  const id = newId('')
  const now = new Date().toISOString()
  try {
    await db.sql`
      INSERT INTO profiles (
        "id", "role", "display_name", "email", "company", "tagline", "bio",
        "website", "headshot_url", "status", "details", "created_at", "updated_at"
      ) VALUES (
        ${id}, ${shape.role}, ${shape.displayName}, ${shape.email}, '', '', '',
        '', '', ${shape.status}, ${JSON.stringify(shape.details)}::jsonb, ${now}, ${now}
      )
    `
  } catch (error) {
    logWarn('profile', 'could not auto-provision community profile', { accountId: account.id, error: error && error.message })
    return ''
  }
  try { await db.sql`UPDATE accounts SET "profile_id" = ${id} WHERE "id" = ${account.id}` } catch { /* best-effort */ }
  try { await db.sql`UPDATE sessions SET "profile_id" = ${id} WHERE "account_id" = ${account.id}` } catch { /* best-effort */ }
  return id
}

// Ensure the account identified by `accountId` has a linked community profile,
// creating one (see profileShapeForAccount) when it is missing. Returns the
// profile id, or '' when it can't be established. Called at account-creation
// time — signup and admin seeding — so every account has a profile from the
// outset, admins included (theirs hidden).
export async function ensureProfileForAccountId(db, accountId) {
  if (!accountId) return ''
  let account
  try {
    const rows = await db.sql`SELECT "id", "name", "email", "role", "profile_id" FROM accounts WHERE "id" = ${accountId} LIMIT 1`
    account = rows[0]
  } catch { return '' }
  if (!account) return ''
  if (account.profile_id) {
    try {
      const rows = await db.sql`SELECT "id" FROM profiles WHERE "id" = ${account.profile_id} LIMIT 1`
      if (rows.length) return account.profile_id
    } catch { return account.profile_id }
  }
  return provisionProfileForAccount(db, account)
}

// Guarantee that the signed-in account has a usable community profile and return
// its id (or '' if one truly can't be established, e.g. no account row).
//
// Identity across the whole social platform is a community profile: posts,
// likes, comments, follows, direct messages and notifications are all keyed to
// `profiles.id`. Some accounts have no linked profile — most notably the built-in
// admin accounts, but also any account whose profile was removed — and until now
// those members hit a dead end ("Your account has no community profile.") the
// moment they tried to post or open their notifications. This resolves that
// lazily and durably:
//
//   • If the session already names a profile that exists, use it.
//   • Else, if the account links a profile that exists, adopt it and heal the
//     session row so later requests see it.
//   • Else, create a fresh profile from the account (see profileShapeForAccount —
//     a hidden one for admins), link it to the account, and repoint the account's
//     sessions at it — so the identity is stable everywhere from then on.
//
// The freshly resolved id is also written back onto the passed `session` object
// so the current request can use it immediately.
export async function ensureProfileForAccount(db, session) {
  if (!session) return ''

  // Fast path: the session already points at a live profile.
  if (session.profileId) {
    try {
      const rows = await db.sql`SELECT "id" FROM profiles WHERE "id" = ${session.profileId} LIMIT 1`
      if (rows.length) return session.profileId
    } catch { return session.profileId }
  }

  // Resolve the account behind this session.
  let account
  try {
    const rows = await db.sql`SELECT "id", "name", "email", "role", "profile_id" FROM accounts WHERE "id" = ${session.accountId} LIMIT 1`
    account = rows[0]
  } catch {
    return session.profileId || ''
  }
  if (!account) return session.profileId || ''

  // The account already links a real profile the session lost track of: adopt it.
  if (account.profile_id) {
    try {
      const rows = await db.sql`SELECT "id" FROM profiles WHERE "id" = ${account.profile_id} LIMIT 1`
      if (rows.length) {
        if (session.profileId !== account.profile_id) {
          try { await db.sql`UPDATE sessions SET "profile_id" = ${account.profile_id} WHERE "account_id" = ${account.id}` } catch { /* best-effort heal */ }
        }
        session.profileId = account.profile_id
        return account.profile_id
      }
    } catch { /* fall through to creation */ }
  }

  // No profile anywhere: create one from the account so the member can take part.
  const id = await provisionProfileForAccount(db, account)
  if (id) session.profileId = id
  return id || (session.profileId || '')
}

// ── CSRF: same-origin enforcement ──

// Reject a state-changing request that a browser initiated from another origin.
// Browsers always attach an `Origin` (and usually `Referer`) header to
// cross-site POST/PUT/PATCH/DELETE, so comparing its host to the request host
// blocks classic CSRF. When neither header is present — non-browser API clients,
// server-to-server calls, tests — the check passes so existing integrations keep
// working. Combined with the SameSite=Strict session cookie this is defence in
// depth, not the only line.
export function isSameOrigin(req) {
  const target = (() => { try { return new URL(req.url).host } catch { return '' } })()
  const source = req.headers.get('origin') || req.headers.get('referer') || ''
  if (!source) return true
  try {
    return new URL(source).host === target
  } catch {
    return false
  }
}

// Guard form: return a 403 Response for a cross-origin state change, else null.
export function requireSameOrigin(req) {
  if (isSameOrigin(req)) return null
  return json({ error: 'Cross-origin request blocked.' }, 403)
}

// ── Rate limiting (auth_attempts) ──

// Count how many attempts have landed in `bucket` within the trailing window and,
// as a side effect, sweep rows older than the window so the table stays small.
// Fails open (returns 0) on any database error: throttling must never take down
// the login path itself.
export async function attemptCount(db, bucket, windowMs) {
  const since = new Date(Date.now() - windowMs).toISOString()
  try {
    await db.sql`DELETE FROM auth_attempts WHERE "created_at" < ${since}`
    const rows = await db.sql`SELECT COUNT(*)::int AS count FROM auth_attempts WHERE "bucket" = ${bucket} AND "created_at" >= ${since}`
    return rows[0] ? rows[0].count : 0
  } catch {
    return 0
  }
}

// Record one attempt against `bucket`. Best-effort — a failure here should never
// block the action the caller is about to perform.
export async function recordAttempt(db, bucket) {
  try {
    await db.sql`INSERT INTO auth_attempts ("id", "bucket", "created_at") VALUES (${newId('att_')}, ${bucket}, ${new Date().toISOString()})`
  } catch { /* ignore */ }
}

// Clear a bucket, e.g. after a successful login so honest users never accumulate
// toward the limit.
export async function clearAttempts(db, bucket) {
  try { await db.sql`DELETE FROM auth_attempts WHERE "bucket" = ${bucket}` } catch { /* ignore */ }
}

// Guard: if `bucket` is over `limit` within `windowMs`, return a 429 Response;
// otherwise null. Does not itself record the attempt — callers decide whether a
// given request counts (e.g. only failed logins).
export async function rateLimit(db, bucket, limit, windowMs, message) {
  const count = await attemptCount(db, bucket, windowMs)
  if (count >= limit) {
    return json({ error: message || 'Too many attempts. Please wait a few minutes and try again.' }, 429, {
      'Retry-After': String(Math.ceil(windowMs / 1000)),
    })
  }
  return null
}

// ── Audit log ──

// Append one immutable record of a privileged mutation. Best-effort by design:
// the audit write must never fail the operation it is recording, so any error is
// swallowed after a warning. `details` is a small JSON summary (e.g. a status
// before/after), never the full resource.
export async function recordAudit(db, req, session, { action, resourceType = '', resourceId = '', details = {} }) {
  try {
    await db.sql`
      INSERT INTO audit_log ("id", "actor_account_id", "actor_name", "action", "resource_type", "resource_id", "details", "ip", "created_at")
      VALUES (
        ${newId('audit_')}, ${(session && session.accountId) || ''}, ${(details && details.actorName) || ''},
        ${action}, ${resourceType}, ${resourceId}, ${JSON.stringify(details || {})}::jsonb,
        ${clientIp(req)}, ${new Date().toISOString()}
      )
    `
  } catch (error) {
    logWarn('audit', 'failed to record audit entry', { action, error: error && error.message })
  }
}
