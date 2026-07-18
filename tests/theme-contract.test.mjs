import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  THEME_BRANDING_FIELDS,
  THEME_RECORD_TYPES,
  THEME_REQUIRED_FIELDS,
  THEME_RESOLUTION_RULES,
  THEME_TRUST_CONTROLS,
  themeContractSummary,
  themeRecordTypeKeys,
} from '../platform/themes/contract.mjs'
import { listThemes, resolveThemeSettings, DEFAULT_THEME_KEY } from '../platform/themes/registry.mjs'

test('theme record type keys are unique and stable-looking', () => {
  const keys = themeRecordTypeKeys()
  assert.equal(new Set(keys).size, keys.length)
  for (const key of keys) assert.match(key, /^[a-z][a-z0-9-]*$/)
})

test('theme contract names branding and override requirements', () => {
  for (const field of ['key', 'branding', 'modules']) assert.ok(THEME_REQUIRED_FIELDS.includes(field))
  for (const token of ['brand', 'bg', 'accent']) assert.ok(THEME_BRANDING_FIELDS.includes(token))
  assert.ok(THEME_RESOLUTION_RULES.includes('unknown theme keys fall back to the configured default theme'))
  assert.ok(THEME_TRUST_CONTROLS.includes('themes contain no secrets'))
  assert.ok(THEME_TRUST_CONTROLS.includes('branding must preserve readable contrast'))
})

test('registered themes satisfy the reusable theme contract shape', () => {
  const themes = listThemes()
  assert.ok(themes.length >= 1)
  for (const theme of themes) {
    for (const field of THEME_REQUIRED_FIELDS) assert.ok(theme[field] !== undefined, `${theme.key} missing ${field}`)
    for (const token of THEME_BRANDING_FIELDS) assert.equal(typeof theme.branding[token], 'string', `${theme.key} missing branding.${token}`)
    assert.ok(Array.isArray(theme.modules), `${theme.key} modules must be an array`)
  }
})

test('theme resolution falls back to the default theme safely', () => {
  assert.equal(DEFAULT_THEME_KEY, 'beslyfe')
  const resolved = resolveThemeSettings('does-not-exist')
  assert.equal(resolved.theme, DEFAULT_THEME_KEY)
  assert.ok(resolved.branding)
  assert.ok(Array.isArray(resolved.modules))
})

test('theme contract summary is serializable and complete', () => {
  const summary = themeContractSummary()
  assert.equal(summary.recordTypes.length, THEME_RECORD_TYPES.length)
  assert.equal(summary.brandingFields.length, THEME_BRANDING_FIELDS.length)
  assert.doesNotThrow(() => JSON.stringify(summary))
})
