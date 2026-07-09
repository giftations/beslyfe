import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  PLATFORM_CONTRACT_REGISTRY,
  platformContractRegistrySummary,
} from '../platform/contracts.mjs'

test('platform contract registry exposes every core contract group', () => {
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.modules))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.ecosystemConfiguration))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.relationships.relationshipTypes))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.consentAndAi.consentPurposes))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.outcomeAnalytics.outcomes))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.dataBoundaries.scopes))
})

test('platform contract registry is serializable', () => {
  assert.doesNotThrow(() => JSON.stringify(PLATFORM_CONTRACT_REGISTRY))
})

test('platform contract registry summary reflects non-empty contracts', () => {
  const summary = platformContractRegistrySummary()
  for (const count of Object.values(summary)) {
    assert.ok(count > 0)
  }
})
