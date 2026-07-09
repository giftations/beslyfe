import { test } from 'node:test'
import assert from 'node:assert/strict'

import { MODULES } from '../platform/modules/manifest.mjs'

const REQUIRED_ARRAY_FIELDS = [
  'entities',
  'dataOwned',
  'dataRead',
  'permissions',
  'configuration',
  'events',
  'trustControls',
  'productOverrides',
  'functions',
  'pages',
]

test('platform modules expose the reusable contract shape', () => {
  assert.ok(MODULES.length > 0)
  for (const mod of MODULES) {
    assert.equal(typeof mod.key, 'string')
    assert.equal(typeof mod.label, 'string')
    assert.equal(typeof mod.summary, 'string')
    assert.equal(typeof mod.purpose, 'string')
    assert.equal(typeof mod.aiUse, 'string')
    for (const field of REQUIRED_ARRAY_FIELDS) {
      assert.ok(Array.isArray(mod[field]), `${mod.key}.${field} must be an array`)
    }
  }
})

test('platform module keys are unique and stable-looking', () => {
  const keys = MODULES.map((mod) => mod.key)
  assert.equal(new Set(keys).size, keys.length)
  for (const key of keys) {
    assert.match(key, /^[a-z][a-z0-9-]*$/)
  }
})

test('AI module carries the trust launch gate signals', () => {
  const ai = MODULES.find((mod) => mod.key === 'ai')
  assert.ok(ai)
  assert.ok(ai.trustControls.includes('launch gate'))
  assert.match(ai.aiUse, /TRUST_DATA_AI_FOUNDATION/)
})
