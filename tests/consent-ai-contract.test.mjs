import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  AI_DATA_SCOPES,
  AI_LAUNCH_GATE_FIELDS,
  CONSENT_PURPOSES,
  aiDataScopeKeys,
  consentAiChecklist,
  consentPurposeKeys,
} from '../platform/trust/consent-ai-contract.mjs'

test('consent purposes have unique keys and user controls', () => {
  const keys = consentPurposeKeys()
  assert.equal(new Set(keys).size, keys.length)
  for (const purpose of CONSENT_PURPOSES) {
    assert.match(purpose.key, /^[a-z][a-z0-9-]*$/)
    assert.ok(Array.isArray(purpose.requiredFor))
    assert.ok(purpose.requiredFor.length > 0)
    assert.equal(typeof purpose.userControl, 'string')
  }
})

test('AI data scopes reference known consent purposes', () => {
  const knownPurposes = new Set(consentPurposeKeys())
  const keys = aiDataScopeKeys()
  assert.equal(new Set(keys).size, keys.length)
  for (const scope of AI_DATA_SCOPES) {
    assert.ok(Array.isArray(scope.examples))
    assert.ok(scope.examples.length > 0)
    for (const purpose of scope.consentRequired) {
      assert.ok(knownPurposes.has(purpose), `${scope.key} references unknown consent purpose ${purpose}`)
    }
  }
})

test('AI launch gate requires explanation, controls, outcomes, and guardrails', () => {
  for (const field of ['userExplanation', 'userControls', 'outcomeMetrics', 'guardrailMetrics']) {
    assert.ok(AI_LAUNCH_GATE_FIELDS.includes(field))
  }
})

test('consent and AI checklist is serializable and complete', () => {
  const checklist = consentAiChecklist()
  assert.equal(checklist.consentPurposes.length, CONSENT_PURPOSES.length)
  assert.equal(checklist.aiDataScopes.length, AI_DATA_SCOPES.length)
  assert.equal(checklist.launchGateFields.length, AI_LAUNCH_GATE_FIELDS.length)
  assert.doesNotThrow(() => JSON.stringify(checklist))
})
