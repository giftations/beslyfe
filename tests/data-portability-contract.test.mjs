import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  DATA_EXPORT_FORMATS,
  DATA_EXPORT_SCOPES,
  DATA_EXPORT_STATUS_STATES,
  DATA_PORTABILITY_RECORD_TYPES,
  DATA_PORTABILITY_TRUST_CONTROLS,
  REQUIRED_DATA_PORTABILITY_FIELDS,
  dataPortabilityContractSummary,
  dataPortabilityRecordTypeKeys,
} from '../platform/data/portability-contract.mjs'

test('data portability record type keys are unique and stable-looking', () => {
  const keys = dataPortabilityRecordTypeKeys()
  assert.equal(new Set(keys).size, keys.length)
  for (const recordType of DATA_PORTABILITY_RECORD_TYPES) {
    assert.match(recordType.key, /^[a-z][a-z0-9-]*$/)
    assert.equal(typeof recordType.purpose, 'string')
    assert.ok(recordType.purpose.length > 20)
  }
})

test('data export contract covers core platform scopes and formats', () => {
  for (const scope of ['profile', 'crm', 'messages', 'media', 'audit-log', 'analytics']) {
    assert.ok(DATA_EXPORT_SCOPES.includes(scope))
  }
  assert.ok(DATA_EXPORT_FORMATS.includes('json'))
  assert.ok(DATA_EXPORT_FORMATS.includes('csv'))
  assert.ok(DATA_EXPORT_FORMATS.includes('zip'))
})

test('data export status states include delivery, expiry, and failure paths', () => {
  for (const state of ['requested', 'processing', 'ready', 'downloaded', 'expired', 'failed']) {
    assert.ok(DATA_EXPORT_STATUS_STATES.includes(state))
  }
})

test('data portability required fields preserve ownership, scope, format, and expiry', () => {
  for (const field of ['ecosystemId', 'requesterAccountId', 'subjectType', 'scope', 'format', 'expiresAt']) {
    assert.ok(REQUIRED_DATA_PORTABILITY_FIELDS.includes(field))
  }
})

test('data portability trust controls protect secrets, private content, and boundaries', () => {
  assert.ok(DATA_PORTABILITY_TRUST_CONTROLS.includes('exports require authenticated requester'))
  assert.ok(DATA_PORTABILITY_TRUST_CONTROLS.includes('secrets are redacted'))
  assert.ok(DATA_PORTABILITY_TRUST_CONTROLS.includes('private messages require participant boundary'))
  assert.ok(DATA_PORTABILITY_TRUST_CONTROLS.includes('generated packages expire'))
  assert.ok(DATA_PORTABILITY_TRUST_CONTROLS.includes('export logs avoid raw private content'))
})

test('data portability contract summary is serializable and complete', () => {
  const summary = dataPortabilityContractSummary()
  assert.equal(summary.recordTypes.length, DATA_PORTABILITY_RECORD_TYPES.length)
  assert.equal(summary.exportScopes.length, DATA_EXPORT_SCOPES.length)
  assert.equal(summary.requiredFields.length, REQUIRED_DATA_PORTABILITY_FIELDS.length)
  assert.doesNotThrow(() => JSON.stringify(summary))
})
