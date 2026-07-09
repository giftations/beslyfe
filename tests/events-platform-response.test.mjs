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
  assert.ok(Array.isArray(body.contracts.personIdentity.identityRecords))
  assert.ok(Array.isArray(body.contracts.organizationIdentity.identityRecords))
  assert.ok(Array.isArray(body.contracts.communities.communityTypes))
  assert.ok(Array.isArray(body.contracts.directoryDiscovery.discoverySurfaces))
  assert.ok(Array.isArray(body.contracts.relationships.relationshipTypes))
  assert.ok(Array.isArray(body.contracts.conversations.conversationTypes))
  assert.ok(Array.isArray(body.contracts.experiences.experienceTypes))
  assert.ok(Array.isArray(body.contracts.opportunities.opportunityTypes))
  assert.ok(Array.isArray(body.contracts.knowledge.knowledgeTypes))
  assert.ok(Array.isArray(body.contracts.marketplace.offerTypes))
  assert.ok(Array.isArray(body.contracts.consentAndAi.consentPurposes))
  assert.ok(Array.isArray(body.contracts.aiRecommendations.targets))
  assert.ok(Array.isArray(body.contracts.outcomeAnalytics.outcomes))
  assert.ok(Array.isArray(body.contracts.dataBoundaries.scopes))
  assert.equal(body.contractsSummary.moduleCount, body.contracts.modules.length)
  assert.equal(body.contractsSummary.personIdentityRecordCount, body.contracts.personIdentity.identityRecords.length)
  assert.equal(
    body.contractsSummary.organizationIdentityRecordCount,
    body.contracts.organizationIdentity.identityRecords.length,
  )
  assert.equal(body.contractsSummary.communityTypeCount, body.contracts.communities.communityTypes.length)
  assert.equal(
    body.contractsSummary.discoverySurfaceCount,
    body.contracts.directoryDiscovery.discoverySurfaces.length,
  )
  assert.equal(body.contractsSummary.conversationTypeCount, body.contracts.conversations.conversationTypes.length)
  assert.equal(body.contractsSummary.experienceTypeCount, body.contracts.experiences.experienceTypes.length)
  assert.equal(body.contractsSummary.opportunityTypeCount, body.contracts.opportunities.opportunityTypes.length)
  assert.equal(body.contractsSummary.knowledgeTypeCount, body.contracts.knowledge.knowledgeTypes.length)
  assert.equal(body.contractsSummary.marketplaceOfferTypeCount, body.contracts.marketplace.offerTypes.length)
  assert.equal(body.contractsSummary.aiRecommendationTargetCount, body.contracts.aiRecommendations.targets.length)
  assert.equal(body.contractsSummary.dataBoundaryScopeCount, body.contracts.dataBoundaries.scopes.length)
})
