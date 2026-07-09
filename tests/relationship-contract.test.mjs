import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  RELATIONSHIP_ENTITY_TYPES,
  RELATIONSHIP_REQUIRED_FIELDS,
  RELATIONSHIP_STATES,
  RELATIONSHIP_TYPES,
  relationshipContractSummary,
  relationshipTypeKeys,
} from '../platform/relationships/contract.mjs'

test('relationship types use known entity types', () => {
  const known = new Set([...RELATIONSHIP_ENTITY_TYPES, 'relationship'])
  for (const type of RELATIONSHIP_TYPES) {
    assert.equal(typeof type.key, 'string')
    assert.equal(typeof type.label, 'string')
    assert.equal(typeof type.purpose, 'string')
    assert.equal(type.connects.length, 2)
    assert.ok(known.has(type.connects[0]), `${type.key} source type is unknown`)
    assert.ok(known.has(type.connects[1]), `${type.key} target type is unknown`)
  }
})

test('relationship type keys are unique and stable-looking', () => {
  const keys = relationshipTypeKeys()
  assert.equal(new Set(keys).size, keys.length)
  for (const key of keys) {
    assert.match(key, /^[a-z][a-z0-9-]*$/)
  }
})

test('relationship contract includes consent, state, and ecosystem boundaries', () => {
  assert.ok(RELATIONSHIP_STATES.includes('pending-consent'))
  assert.ok(RELATIONSHIP_STATES.includes('active'))
  assert.ok(RELATIONSHIP_REQUIRED_FIELDS.includes('ecosystemId'))
  assert.ok(RELATIONSHIP_REQUIRED_FIELDS.includes('consent'))
  assert.ok(RELATIONSHIP_REQUIRED_FIELDS.includes('visibility'))
})

test('relationship contract summary is serializable and complete', () => {
  const summary = relationshipContractSummary()
  assert.equal(summary.relationshipTypes.length, RELATIONSHIP_TYPES.length)
  assert.equal(summary.requiredFields.length, RELATIONSHIP_REQUIRED_FIELDS.length)
  assert.doesNotThrow(() => JSON.stringify(summary))
})
