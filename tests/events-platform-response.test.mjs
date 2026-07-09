import { test } from 'node:test'
import assert from 'node:assert/strict'

import events from '../netlify/functions/events.mjs'

test('events platform response exposes the contract registry without database setup', async () => {
  const response = await events(new Request('https://bak.example/.netlify/functions/events?platform'))
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.ok(Array.isArray(body.core))
  assert.ok(Array.isArray(body.modules))
  assert.ok(Array.isArray(body.themes))
  assert.ok(body.contracts)
  assert.ok(body.contractsSummary)
  assert.ok(Array.isArray(body.contracts.modules))
  assert.ok(Array.isArray(body.contracts.ecosystemConfiguration))
  assert.ok(Array.isArray(body.contracts.relationships.relationshipTypes))
  assert.ok(Array.isArray(body.contracts.consentAndAi.consentPurposes))
  assert.ok(Array.isArray(body.contracts.outcomeAnalytics.outcomes))
  assert.ok(Array.isArray(body.contracts.dataBoundaries.scopes))
  assert.equal(body.contractsSummary.moduleCount, body.contracts.modules.length)
  assert.equal(body.contractsSummary.dataBoundaryScopeCount, body.contracts.dataBoundaries.scopes.length)
})
