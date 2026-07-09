import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  DISALLOWED_NORTH_STAR_METRICS,
  GUARDRAIL_METRICS,
  OUTCOME_METRICS,
  analyticsContractSummary,
  guardrailMetricKeys,
  outcomeMetricKeys,
} from '../platform/analytics/outcome-contract.mjs'

test('outcome metrics have unique stable keys and describe outcomes', () => {
  const keys = outcomeMetricKeys()
  assert.equal(new Set(keys).size, keys.length)
  for (const metric of OUTCOME_METRICS) {
    assert.match(metric.key, /^[a-z][a-z0-9-]*$/)
    assert.equal(typeof metric.label, 'string')
    assert.equal(typeof metric.entity, 'string')
    assert.equal(typeof metric.outcome, 'string')
    assert.ok(metric.outcome.length > 20)
  }
})

test('guardrail metrics have unique stable keys and describe risks', () => {
  const keys = guardrailMetricKeys()
  assert.equal(new Set(keys).size, keys.length)
  for (const metric of GUARDRAIL_METRICS) {
    assert.match(metric.key, /^[a-z][a-z0-9-]*$/)
    assert.equal(typeof metric.risk, 'string')
    assert.ok(metric.risk.length > 10)
  }
})

test('engagement-only metrics are explicitly disallowed as north stars', () => {
  for (const metric of ['time-on-site', 'raw-click-volume', 'rage-engagement']) {
    assert.ok(DISALLOWED_NORTH_STAR_METRICS.includes(metric))
  }
})

test('analytics contract summary is serializable and complete', () => {
  const summary = analyticsContractSummary()
  assert.equal(summary.outcomes.length, OUTCOME_METRICS.length)
  assert.equal(summary.guardrails.length, GUARDRAIL_METRICS.length)
  assert.equal(summary.disallowedNorthStars.length, DISALLOWED_NORTH_STAR_METRICS.length)
  assert.doesNotThrow(() => JSON.stringify(summary))
})
