// Smoke tests for the security-critical, dependency-free helpers that guard the
// authentication and permission surface. These exercise the exact functions the
// Netlify Functions rely on for constant-time password comparison, the password
// policy, CSRF same-origin enforcement and request-body parsing — the places a
// silent regression would quietly weaken the platform.
//
// Run locally or in CI with:  node --test tests/
// They import only lib/session.mjs (no live database, no network), so they are
// fast and hermetic. The build does not run them; they are for CI / pre-merge.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  timingSafeEqualHex,
  passwordPolicyError,
  isSameOrigin,
  requireSameOrigin,
  readJsonBody,
  requestId,
  logEvent,
} from '../netlify/functions/lib/session.mjs'

test('timingSafeEqualHex matches only identical hashes', () => {
  assert.equal(timingSafeEqualHex('deadbeef', 'deadbeef'), true)
  assert.equal(timingSafeEqualHex('deadbeef', 'deadbee0'), false)
  // Length mismatch must fail without throwing or short-circuiting to true.
  assert.equal(timingSafeEqualHex('deadbeef', 'deadbeefaa'), false)
  assert.equal(timingSafeEqualHex('', ''), true)
  assert.equal(timingSafeEqualHex('a', ''), false)
  // Null/undefined are coerced to '' and never crash.
  assert.equal(timingSafeEqualHex(null, undefined), true)
})

test('passwordPolicyError enforces the member floor', () => {
  assert.equal(passwordPolicyError('longenough'), null) // 10 chars, member ok
  assert.match(passwordPolicyError('short'), /at least 8/)
  assert.match(passwordPolicyError(''), /at least 8/)
})

test('passwordPolicyError enforces the stricter admin floor', () => {
  // Long but single-class → rejected for admin.
  assert.match(passwordPolicyError('aaaaaaaaaaaa', { admin: true }), /three of/)
  // Too short for admin even with class mix.
  assert.match(passwordPolicyError('Ab1!', { admin: true }), /at least 12/)
  // 12+ chars with three classes → accepted.
  assert.equal(passwordPolicyError('Abcdefgh123!', { admin: true }), null)
})

function reqWith(headers, url = 'https://bak.example/api') {
  return new Request(url, { headers })
}

test('isSameOrigin blocks cross-origin browser writes but allows header-less clients', () => {
  assert.equal(isSameOrigin(reqWith({ Origin: 'https://bak.example' })), true)
  assert.equal(isSameOrigin(reqWith({ Origin: 'https://evil.example' })), false)
  // Referer is the fallback source when Origin is absent.
  assert.equal(isSameOrigin(reqWith({ Referer: 'https://bak.example/page' })), true)
  assert.equal(isSameOrigin(reqWith({ Referer: 'https://evil.example/page' })), false)
  // No Origin/Referer (server-to-server, tests) is allowed through.
  assert.equal(isSameOrigin(reqWith({})), true)
})

test('requireSameOrigin returns a 403 Response only on a cross-origin request', async () => {
  assert.equal(requireSameOrigin(reqWith({ Origin: 'https://bak.example' })), null)
  const blocked = requireSameOrigin(reqWith({ Origin: 'https://evil.example' }))
  assert.ok(blocked instanceof Response)
  assert.equal(blocked.status, 403)
})

test('readJsonBody parses objects and rejects malformed input', async () => {
  const good = new Request('https://bak.example/api', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ a: 1 }),
  })
  assert.deepEqual(await readJsonBody(good), { a: 1 })

  const notJson = new Request('https://bak.example/api', { method: 'POST', body: 'not json' })
  const err1 = await readJsonBody(notJson)
  assert.ok(err1 instanceof Response)
  assert.equal(err1.status, 400)

  // A JSON scalar (not an object) is rejected.
  const scalar = new Request('https://bak.example/api', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '42',
  })
  const err2 = await readJsonBody(scalar)
  assert.ok(err2 instanceof Response)
  assert.equal(err2.status, 400)
})

test('requestId prefers the Netlify header and otherwise generates one', () => {
  assert.equal(requestId(reqWith({ 'x-nf-request-id': 'abc-123' })), 'abc-123')
  const generated = requestId(reqWith({}))
  assert.match(generated, /^req_/)
})

test('logEvent never throws, even on circular metadata', () => {
  const circular = {}
  circular.self = circular
  assert.doesNotThrow(() => logEvent('info', 'test', 'circular meta', circular))
})
