import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  PLATFORM_CONTRACT_REGISTRY,
  platformContractRegistrySummary,
} from '../platform/contracts.mjs'

test('platform contract registry exposes every core contract group', () => {
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.modules))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.ecosystemConfiguration))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.accessApplications.requestTypes))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.personIdentity.identityRecords))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.organizationIdentity.identityRecords))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.communities.communityTypes))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.directoryDiscovery.discoverySurfaces))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.relationships.relationshipTypes))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.conversations.conversationTypes))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.experiences.experienceTypes))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.scheduling.entryTypes))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.placesMaps.placeTypes))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.opportunities.opportunityTypes))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.knowledge.knowledgeTypes))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.marketplace.offerTypes))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.consentAndAi.consentPurposes))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.aiRecommendations.targets))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.outcomeAnalytics.outcomes))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.dataBoundaries.scopes))
})

test('access application contract supports reviewable participation gates', () => {
  const access = PLATFORM_CONTRACT_REGISTRY.accessApplications
  assert.ok(access.requestTypes.some((type) => type.key === 'participant-application'))
  assert.ok(access.requestTypes.some((type) => type.key === 'ticket-unlock'))
  assert.ok(access.requiredFields.includes('decisionReason'))
  assert.ok(access.requiredFields.includes('auditTrail'))
  assert.ok(access.statusStates.includes('approved-with-conditions'))
  assert.ok(access.reviewControls.includes('request more information'))
  assert.ok(access.applicantControls.includes('appeal decision'))
  assert.ok(access.trustControls.includes('automated decisions are disallowed'))
})

test('person identity contract protects user-owned identity and data controls', () => {
  const identity = PLATFORM_CONTRACT_REGISTRY.personIdentity
  assert.ok(identity.identityRecords.some((record) => record.key === 'profile'))
  assert.ok(identity.identityRecords.some((record) => record.key === 'consent'))
  assert.ok(identity.requiredFields.includes('consentPurposes'))
  assert.ok(identity.dataControls.includes('export data'))
  assert.ok(identity.dataControls.includes('reset personalization'))
  assert.ok(identity.trustControls.includes('user-owned identity'))
})

test('organization identity contract protects ownership, verification, and member controls', () => {
  const organizations = PLATFORM_CONTRACT_REGISTRY.organizationIdentity
  assert.ok(organizations.identityRecords.some((record) => record.key === 'ownership'))
  assert.ok(organizations.identityRecords.some((record) => record.key === 'verification'))
  assert.ok(organizations.organizationTypes.includes('business'))
  assert.ok(organizations.organizationTypes.includes('nonprofit'))
  assert.ok(organizations.requiredFields.includes('ownerPersonIds'))
  assert.ok(organizations.requiredFields.includes('verificationState'))
  assert.ok(organizations.verificationStates.includes('verified'))
  assert.ok(organizations.memberControls.includes('transfer ownership'))
  assert.ok(organizations.trustControls.includes('sponsored visibility is labeled'))
})

test('community contract connects membership, governance, AI boundaries, and outcomes', () => {
  const communities = PLATFORM_CONTRACT_REGISTRY.communities
  assert.ok(communities.communityTypes.some((type) => type.key === 'event-community'))
  assert.ok(communities.communityTypes.some((type) => type.key === 'local-community'))
  assert.ok(communities.requiredFields.includes('membershipPolicy'))
  assert.ok(communities.requiredFields.includes('aiPolicy'))
  assert.ok(communities.membershipStates.includes('application-required'))
  assert.ok(communities.governanceControls.includes('review reported activity'))
  assert.ok(communities.aiBoundaries.includes('no rage-driven engagement ranking'))
  assert.ok(communities.successOutcomes.includes('meaningful introductions'))
})

test('directory discovery contract protects visibility, explanations, and personalization controls', () => {
  const discovery = PLATFORM_CONTRACT_REGISTRY.directoryDiscovery
  assert.ok(discovery.discoverySurfaces.some((surface) => surface.key === 'people-directory'))
  assert.ok(discovery.discoverySurfaces.some((surface) => surface.key === 'opportunity-discovery'))
  assert.ok(discovery.discoverableEntityTypes.includes('organization'))
  assert.ok(discovery.requiredFields.includes('visibility'))
  assert.ok(discovery.requiredFields.includes('explanation'))
  assert.ok(discovery.visibilityStates.includes('hidden-by-owner'))
  assert.ok(discovery.userControls.includes('why am I seeing this'))
  assert.ok(discovery.userControls.includes('disable discovery personalization'))
  assert.ok(discovery.trustControls.includes('sponsored placement is labeled'))
  assert.ok(discovery.trustControls.includes('engagement-only ranking is disallowed'))
})

test('experience contract requires time, place, ownership, and change controls', () => {
  const experiences = PLATFORM_CONTRACT_REGISTRY.experiences
  assert.ok(experiences.experienceTypes.some((type) => type.key === 'event'))
  assert.ok(experiences.experienceTypes.some((type) => type.key === 'session'))
  assert.ok(experiences.requiredFields.includes('startsAt'))
  assert.ok(experiences.requiredFields.includes('location'))
  assert.ok(experiences.requiredFields.includes('changeHistory'))
  assert.ok(experiences.trustControls.includes('change visibility'))
})

test('scheduling contract requires time, capacity, registration, and change controls', () => {
  const scheduling = PLATFORM_CONTRACT_REGISTRY.scheduling
  assert.ok(scheduling.entryTypes.some((type) => type.key === 'event-session'))
  assert.ok(scheduling.entryTypes.some((type) => type.key === 'appointment'))
  assert.ok(scheduling.requiredFields.includes('timezone'))
  assert.ok(scheduling.requiredFields.includes('capacity'))
  assert.ok(scheduling.requiredFields.includes('changeHistory'))
  assert.ok(scheduling.registrationStates.includes('approval-required'))
  assert.ok(scheduling.changeControls.includes('sync external calendar only with consent'))
  assert.ok(scheduling.userControls.includes('cancel reservation'))
  assert.ok(scheduling.trustControls.includes('calendar sync is opt-in'))
})

test('places and maps contract protects published maps, private locations, and accessibility', () => {
  const places = PLATFORM_CONTRACT_REGISTRY.placesMaps
  assert.ok(places.placeTypes.some((type) => type.key === 'venue'))
  assert.ok(places.placeTypes.some((type) => type.key === 'booth'))
  assert.ok(places.requiredFields.includes('accessibility'))
  assert.ok(places.requiredFields.includes('publishedState'))
  assert.ok(places.mapArtifactTypes.includes('floor-plan'))
  assert.ok(places.visibilityStates.includes('operator-only'))
  assert.ok(places.userControls.includes('request location correction'))
  assert.ok(places.trustControls.includes('private addresses are hidden by default'))
  assert.ok(places.trustControls.includes('AI navigation uses published place data only'))
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
