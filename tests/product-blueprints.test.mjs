import test from 'node:test'
import assert from 'node:assert/strict'

import {
  PRODUCT_BLUEPRINTS,
  PRODUCT_OUTCOMES,
  recommendCapabilities,
} from '../platform/ecosystems/product-blueprints.mjs'

test('product blueprints cover online work, real-world operations, and custom ideas', () => {
  const keys = PRODUCT_BLUEPRINTS.map((item) => item.key)
  assert.deepEqual(keys, ['business', 'website', 'publisher', 'creator', 'retail', 'property', 'community', 'event', 'nonprofit', 'custom'])
  assert.ok(PRODUCT_OUTCOMES.some((item) => item.key === 'online-sales'))
  assert.ok(PRODUCT_OUTCOMES.some((item) => item.key === 'community-growth'))
  assert.ok(PRODUCT_OUTCOMES.some((item) => item.key === 'automate-workflows'))
  assert.ok(PRODUCT_OUTCOMES.some((item) => item.key === 'manage-properties'))
})

test('ticketing is explicit and never required for ordinary websites or businesses', () => {
  assert.equal(recommendCapabilities({ productType: 'website' }).includes('ticketing'), false)
  assert.equal(recommendCapabilities({ productType: 'business', outcomes: ['online-sales'] }).includes('ticketing'), false)
  assert.equal(recommendCapabilities({ productType: 'event' }).includes('ticketing'), false)
  assert.equal(recommendCapabilities({ productType: 'event', outcomes: ['ticket-sales'] }).includes('ticketing'), true)
})

test('online sales adds commerce, analytics, and CRM without forcing event features', () => {
  const capabilities = recommendCapabilities({ productType: 'business', outcomes: ['online-sales'] })
  assert.ok(capabilities.includes('commerce'))
  assert.ok(capabilities.includes('analytics'))
  assert.ok(capabilities.includes('crm'))
  assert.equal(capabilities.includes('ticketing'), false)
  assert.equal(capabilities.includes('floorplan'), false)
})

test('retail and property plans include the operating capabilities their owners need', () => {
  const retail = recommendCapabilities({ productType: 'retail', outcomes: ['manage-inventory', 'automate-workflows'] })
  for (const capability of ['commerce', 'crm', 'operations', 'inventory', 'automation']) assert.ok(retail.includes(capability))
  assert.equal(retail.includes('ticketing'), false)

  const property = recommendCapabilities({ productType: 'property', outcomes: ['manage-properties'] })
  for (const capability of ['property', 'operations', 'crm', 'scheduling', 'applications', 'automation']) assert.ok(property.includes(capability))
  assert.equal(property.includes('ticketing'), false)
})

test('a custom build starts flexible and automation-ready', () => {
  const capabilities = recommendCapabilities({ productType: 'custom', outcomes: ['automate-workflows'] })
  for (const capability of ['identity', 'cms', 'analytics', 'community-bridge', 'operations', 'automation', 'ai']) assert.ok(capabilities.includes(capability))
})
