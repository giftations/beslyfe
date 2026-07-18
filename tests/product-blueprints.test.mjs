import test from 'node:test'
import assert from 'node:assert/strict'

import {
  PRODUCT_BLUEPRINTS,
  PRODUCT_OUTCOMES,
  recommendCapabilities,
} from '../platform/ecosystems/product-blueprints.mjs'

test('product blueprints cover business, website, community, event, creator, and nonprofit builds', () => {
  const keys = PRODUCT_BLUEPRINTS.map((item) => item.key)
  assert.deepEqual(keys, ['business', 'website', 'community', 'event', 'creator', 'nonprofit'])
  assert.ok(PRODUCT_OUTCOMES.some((item) => item.key === 'online-sales'))
  assert.ok(PRODUCT_OUTCOMES.some((item) => item.key === 'community-growth'))
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
