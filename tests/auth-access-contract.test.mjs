import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  AUTH_MUTATION_CONTROLS,
  AUTH_PASSWORD_CONTROLS,
  AUTH_RECORD_TYPES,
  AUTH_ROLE_TYPES,
  AUTH_SESSION_CONTROLS,
  AUTH_TRUST_CONTROLS,
  authAccessControlContractSummary,
  authRecordTypeKeys,
} from '../platform/auth/access-control-contract.mjs'
import { passwordPolicyError, requireSameOrigin } from '../netlify/functions/lib/session.mjs'

test('auth record types map to canonical security tables', () => {
  const tables = new Set(AUTH_RECORD_TYPES.map((type) => type.table))
  for (const table of ['accounts', 'sessions', 'password_resets', 'email_verifications', 'auth_attempts']) {
    assert.ok(tables.has(table))
  }
})

test('auth record type keys are unique and stable-looking', () => {
  const keys = authRecordTypeKeys()
  assert.equal(new Set(keys).size, keys.length)
  for (const key of keys) assert.match(key, /^[a-z][a-z0-9-]*$/)
})

test('auth contract includes roles, session controls, and mutation controls', () => {
  assert.ok(AUTH_ROLE_TYPES.includes('admin'))
  assert.ok(AUTH_ROLE_TYPES.includes('attendee'))
  assert.ok(AUTH_SESSION_CONTROLS.includes('httpOnly cookie'))
  assert.ok(AUTH_SESSION_CONTROLS.includes('SameSite=Strict cookie'))
  assert.ok(AUTH_MUTATION_CONTROLS.includes('state-changing browser requests require same-origin checks'))
  assert.ok(AUTH_MUTATION_CONTROLS.includes('admin authority is revalidated against the live account'))
})

test('auth password contract matches shared password policy behavior', () => {
  assert.ok(AUTH_PASSWORD_CONTROLS.includes('member passwords require at least 8 characters'))
  assert.ok(AUTH_PASSWORD_CONTROLS.includes('admin-capable passwords require at least 12 characters'))
  assert.match(passwordPolicyError('short'), /at least 8/)
  assert.match(passwordPolicyError('aaaaaaaaaaaa', { admin: true }), /three of/)
  assert.equal(passwordPolicyError('Abcdefgh123!', { admin: true }), null)
})

test('auth same-origin contract matches shared request guard behavior', () => {
  const blocked = requireSameOrigin(new Request('https://bak.example/api', {
    method: 'POST',
    headers: { Origin: 'https://evil.example' },
  }))
  assert.equal(blocked.status, 403)
  assert.equal(requireSameOrigin(new Request('https://bak.example/api', {
    method: 'POST',
    headers: { Origin: 'https://bak.example' },
  })), null)
})

test('auth trust controls keep identity server-derived and secret-safe', () => {
  assert.ok(AUTH_TRUST_CONTROLS.includes('identity is derived from session rows only'))
  assert.ok(AUTH_TRUST_CONTROLS.includes('admin sessions lose authority when account role or status changes'))
  assert.ok(AUTH_TRUST_CONTROLS.includes('auth logs never include raw secrets'))
})

test('auth access contract summary is serializable and complete', () => {
  const summary = authAccessControlContractSummary()
  assert.equal(summary.recordTypes.length, AUTH_RECORD_TYPES.length)
  assert.equal(summary.sessionControls.length, AUTH_SESSION_CONTROLS.length)
  assert.doesNotThrow(() => JSON.stringify(summary))
})
