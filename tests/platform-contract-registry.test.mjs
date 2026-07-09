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
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.conversations.conversationTypes))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.opportunities.opportunityTypes))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.knowledge.knowledgeTypes))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.marketplace.offerTypes))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.consentAndAi.consentPurposes))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.aiRecommendations.targets))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.outcomeAnalytics.outcomes))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.dataBoundaries.scopes))
})

test('conversation contract requires consent, safety controls, and AI boundaries', () => {
  const conversations = PLATFORM_CONTRACT_REGISTRY.conversations
  assert.ok(conversations.conversationTypes.some((type) => type.key === 'direct-message'))
  assert.ok(conversations.conversationTypes.some((type) => type.key === 'opportunity-followup'))
  assert.ok(conversations.states.includes('pending-consent'))
  assert.ok(conversations.requiredFields.includes('participantIds'))
  assert.ok(conversations.requiredFields.includes('aiUse'))
  assert.ok(conversations.safetyControls.includes('private AI opt-in from all participants'))
})

test('marketplace contract requires disclosure, terms, payment, and audit controls', () => {
  const marketplace = PLATFORM_CONTRACT_REGISTRY.marketplace
  assert.ok(marketplace.offerTypes.some((type) => type.key === 'ticket'))
  assert.ok(marketplace.offerTypes.some((type) => type.key === 'sponsorship'))
  assert.ok(marketplace.requiredFields.includes('disclosure'))
  assert.ok(marketplace.requiredFields.includes('terms'))
  assert.ok(marketplace.priceModels.includes('application-gated'))
  assert.ok(marketplace.trustControls.includes('approval audit trail'))
})

test('knowledge contract preserves source, review, trust, and AI boundaries', () => {
  const knowledge = PLATFORM_CONTRACT_REGISTRY.knowledge
  assert.ok(knowledge.knowledgeTypes.some((type) => type.key === 'guide'))
  assert.ok(knowledge.knowledgeTypes.some((type) => type.key === 'summary'))
  assert.ok(knowledge.requiredFields.includes('provenance'))
  assert.ok(knowledge.requiredFields.includes('aiUse'))
  assert.ok(knowledge.reviewStates.includes('review-needed'))
  assert.ok(knowledge.trustControls.includes('cite source in recommendations'))
})

test('AI recommendation contract requires explanation, controls, and guardrails', () => {
  const recommendations = PLATFORM_CONTRACT_REGISTRY.aiRecommendations
  assert.ok(recommendations.targets.includes('opportunity'))
  assert.ok(recommendations.requiredFields.includes('explanation'))
  assert.ok(recommendations.requiredFields.includes('consentPurposes'))
  assert.ok(recommendations.userControls.includes('why am I seeing this'))
  assert.ok(recommendations.guardrails.includes('no engagement-only ranking'))
})

test('opportunity contract names types, states, required fields, and trust controls', () => {
  const opportunities = PLATFORM_CONTRACT_REGISTRY.opportunities
  assert.ok(opportunities.opportunityTypes.some((type) => type.key === 'introduction'))
  assert.ok(opportunities.opportunityTypes.some((type) => type.key === 'employment'))
  assert.ok(opportunities.opportunityTypes.some((type) => type.key === 'mentorship'))
  assert.ok(opportunities.states.includes('discoverable'))
  assert.ok(opportunities.requiredFields.includes('outcomeMetric'))
  assert.ok(opportunities.trustControls.includes('explain recommendation source'))
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
