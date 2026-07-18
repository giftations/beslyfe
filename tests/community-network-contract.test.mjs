import test from 'node:test'
import assert from 'node:assert/strict'

import { communityNetworkContractSummary } from '../platform/communities/network-contract.mjs'
import { salesEngineContractSummary } from '../platform/growth/sales-engine-contract.mjs'

test('the shared network grows across ecosystems without exposing private content', () => {
  const network = communityNetworkContractSummary()
  assert.equal(network.networkId, 'beslyfe-network')
  assert.ok(network.growthRules.includes('every verified Beslyfe account joins the shared network'))
  assert.ok(network.growthRules.includes('a new ecosystem grows the shared network instead of creating a disconnected user silo'))
  assert.ok(network.growthRules.includes('proof-ecosystem members remain members of the shared Beslyfe network'))
  assert.ok(network.growthRules.includes('private posts and messages never leave their chosen audience'))
  assert.ok(network.userControls.includes('choose global, ecosystem, followers, or private visibility'))
})

test('the sales engine supports direct sales, leads, bookings, donations, and optional tickets', () => {
  const sales = salesEngineContractSummary()
  assert.ok(sales.modes.some((item) => item.key === 'product'))
  assert.ok(sales.modes.some((item) => item.key === 'lead'))
  assert.ok(sales.modes.some((item) => item.key === 'booking'))
  assert.ok(sales.modes.some((item) => item.key === 'donation'))
  assert.ok(sales.modes.some((item) => item.key === 'ticket'))
  assert.ok(sales.providers.some((item) => item.key === 'stripe-payment-link'))
  assert.ok(sales.trustControls.includes('ticketing is enabled only when explicitly selected'))
})
