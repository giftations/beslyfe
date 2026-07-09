import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  AI_USE_LEVELS,
  DATA_BOUNDARY_SCOPES,
  PORTABILITY_LEVELS,
  REQUIRED_BOUNDARY_FIELDS,
  RETENTION_CLASSES,
  VISIBILITY_LEVELS,
  dataBoundaryContractSummary,
  dataBoundaryScopeKeys,
} from '../platform/boundaries/data-boundary-contract.mjs'

test('data boundary scopes have unique stable keys and purposes', () => {
  const keys = dataBoundaryScopeKeys()
  assert.equal(new Set(keys).size, keys.length)
  for (const scope of DATA_BOUNDARY_SCOPES) {
    assert.match(scope.key, /^[a-z][a-z0-9-]*$/)
    assert.equal(typeof scope.purpose, 'string')
    assert.ok(scope.purpose.length > 20)
  }
})

test('data boundary fields include ownership, visibility, AI, portability, retention, and outcomes', () => {
  for (const field of ['ownerType', 'ownerId', 'visibility', 'aiUse', 'portability', 'retention', 'outcomeMetric']) {
    assert.ok(REQUIRED_BOUNDARY_FIELDS.includes(field))
  }
})

test('data boundary enums include the safest defaults', () => {
  assert.ok(VISIBILITY_LEVELS.includes('private'))
  assert.ok(AI_USE_LEVELS.includes('prohibited'))
  assert.ok(AI_USE_LEVELS.includes('explicit-consent-required'))
  assert.ok(PORTABILITY_LEVELS.includes('not-portable'))
  assert.ok(RETENTION_CLASSES.includes('delete-on-request'))
})

test('data boundary contract summary is serializable and complete', () => {
  const summary = dataBoundaryContractSummary()
  assert.equal(summary.scopes.length, DATA_BOUNDARY_SCOPES.length)
  assert.equal(summary.requiredFields.length, REQUIRED_BOUNDARY_FIELDS.length)
  assert.doesNotThrow(() => JSON.stringify(summary))
})
