import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  ECOSYSTEM_CONFIG_CONTRACT,
  REQUIRED_ECOSYSTEM_SECTIONS,
  ecosystemConfigChecklist,
} from '../platform/ecosystems/config-contract.mjs'

test('ecosystem configuration contract includes the platform core sections', () => {
  assert.deepEqual(REQUIRED_ECOSYSTEM_SECTIONS, [
    'identity',
    'ownership',
    'domains',
    'theme',
    'modules',
    'roles',
    'profiles',
    'intake',
    'marketplace',
    'privacy',
    'consent',
    'ai',
    'analytics',
  ])
})

test('every ecosystem configuration section declares required fields and purpose', () => {
  for (const key of REQUIRED_ECOSYSTEM_SECTIONS) {
    const section = ECOSYSTEM_CONFIG_CONTRACT[key]
    assert.ok(Array.isArray(section.required), `${key}.required must be an array`)
    assert.ok(section.required.length > 0, `${key}.required must not be empty`)
    assert.equal(typeof section.purpose, 'string')
    assert.ok(section.purpose.length > 20)
  }
})

test('ecosystem configuration checklist is serializable and complete', () => {
  const checklist = ecosystemConfigChecklist()
  assert.equal(checklist.length, REQUIRED_ECOSYSTEM_SECTIONS.length)
  assert.doesNotThrow(() => JSON.stringify(checklist))
  for (const item of checklist) {
    assert.ok(REQUIRED_ECOSYSTEM_SECTIONS.includes(item.key))
    assert.ok(Array.isArray(item.required))
    assert.equal(typeof item.purpose, 'string')
  }
})
