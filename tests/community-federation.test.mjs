import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  COMMUNITY_FEDERATION_PROTOCOL,
  FEDERATION_GUARDRAILS,
  communityBridgeDefaults,
} from '../platform/communities/federation-contract.mjs'
import { COMMUNITY_SOURCES, ageConfirmed, buildSourceUrl, sourceById } from '../netlify/functions/community-network.mjs'
import { publicProfileView } from '../netlify/functions/profiles.mjs'

test('every future build starts connected to the Beslyfe network', () => {
  const bridge = communityBridgeDefaults({ ecosystemId: 'eco_123' })
  assert.equal(bridge.enabled, true)
  assert.equal(bridge.networkId, 'beslyfe-network')
  assert.equal(bridge.ecosystemId, 'eco_123')
  assert.equal(bridge.protocolVersion, COMMUNITY_FEDERATION_PROTOCOL)
  assert.equal(bridge.accountLinkRequiredForWrites, true)
  assert.ok(FEDERATION_GUARDRAILS.includes('private profile fields never cross an ecosystem boundary'))
})

test('Cannadispo is an allowlisted age-gated community source', () => {
  assert.equal(COMMUNITY_SOURCES.length, 1)
  assert.equal(sourceById('cannadispo').minimumAge, 18)
  assert.equal(sourceById('not-real'), null)
  assert.equal(ageConfirmed(new URL('https://beslyfe.com/api?ageConfirmed=1')), true)
  assert.equal(ageConfirmed(new URL('https://beslyfe.com/api')), false)
  assert.match(buildSourceUrl(sourceById('cannadispo'), 'feed', { ageConfirmed: 1 }), /^https:\/\/cannadispo\.com\//)
})

test('Beslyfe public profiles redact private details too', () => {
  const view = publicProfileView({ email: 'private@example.com', details: { phone: '555', products: 'Design' } })
  assert.equal(view.email, '')
  assert.deepEqual(view.details, { products: 'Design' })
})

test('community copy distinguishes public federation from explicit account linking', () => {
  const community = readFileSync(new URL('../community.html', import.meta.url), 'utf8')
  assert.match(community, /One network identity/)
  assert.match(community, /Account linking is explicit, never assumed\./)
  assert.doesNotMatch(community, /One account and profile/)
})
