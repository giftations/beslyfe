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
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.notifications.notificationTypes))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.moderationTrustSafety.caseTypes))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.relationships.relationshipTypes))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.crmRelationships.recordTypes))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.conversations.conversationTypes))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.experiences.experienceTypes))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.scheduling.entryTypes))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.placesMaps.placeTypes))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.contentCms.contentTypes))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.opportunities.opportunityTypes))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.knowledge.knowledgeTypes))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.marketplace.offerTypes))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.advertisingSponsorship.offerTypes))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.commercePayments.recordTypes))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.integrationsWebhooks.integrationTypes))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.operationsAudit.recordTypes))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.consentAndAi.consentPurposes))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.aiRecommendations.targets))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.outcomeAnalytics.outcomes))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.dataBoundaries.scopes))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.themes.recordTypes))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.adminOs.workspaceTypes))
  assert.ok(Array.isArray(PLATFORM_CONTRACT_REGISTRY.authAccessControl.recordTypes))
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

test('notification contract protects preferences, reasons, and private channels', () => {
  const notifications = PLATFORM_CONTRACT_REGISTRY.notifications
  assert.ok(notifications.notificationTypes.some((type) => type.key === 'status-update'))
  assert.ok(notifications.notificationTypes.some((type) => type.key === 'opportunity'))
  assert.ok(notifications.requiredFields.includes('reason'))
  assert.ok(notifications.requiredFields.includes('deliveryChannels'))
  assert.ok(notifications.deliveryChannels.includes('email'))
  assert.ok(notifications.statusStates.includes('suppressed'))
  assert.ok(notifications.userControls.includes('set quiet hours'))
  assert.ok(notifications.trustControls.includes('marketing requires explicit opt-in'))
  assert.ok(notifications.trustControls.includes('private message content is not exposed in public channels'))
})

test('moderation trust safety contract protects reporting, appeals, and AI boundaries', () => {
  const moderation = PLATFORM_CONTRACT_REGISTRY.moderationTrustSafety
  assert.ok(moderation.caseTypes.some((type) => type.key === 'content-report'))
  assert.ok(moderation.caseTypes.some((type) => type.key === 'ai-safety-review'))
  assert.ok(moderation.requiredFields.includes('decisionReason'))
  assert.ok(moderation.requiredFields.includes('appealState'))
  assert.ok(moderation.statusStates.includes('appealed'))
  assert.ok(moderation.actionTypes.includes('restore content'))
  assert.ok(moderation.userControls.includes('appeal decision'))
  assert.ok(moderation.trustControls.includes('AI may assist triage but not decide'))
  assert.ok(moderation.trustControls.includes('private reports stay confidential by default'))
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

test('content CMS contract protects publishing, media, revision, and rollback controls', () => {
  const content = PLATFORM_CONTRACT_REGISTRY.contentCms
  assert.ok(content.contentTypes.some((type) => type.key === 'page'))
  assert.ok(content.contentTypes.some((type) => type.key === 'media'))
  assert.ok(content.requiredFields.includes('revisionId'))
  assert.ok(content.requiredFields.includes('changeHistory'))
  assert.ok(content.statusStates.includes('review-needed'))
  assert.ok(content.editorControls.includes('rollback revision'))
  assert.ok(content.trustControls.includes('alt text is required for meaningful images'))
  assert.ok(content.trustControls.includes('private content is excluded from public search'))
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

test('CRM relationship contract keeps pipeline labels configurable and trusted', () => {
  const crm = PLATFORM_CONTRACT_REGISTRY.crmRelationships
  assert.ok(crm.recordTypes.some((type) => type.key === 'person'))
  assert.ok(crm.recordTypes.some((type) => type.key === 'activity'))
  assert.ok(crm.pipelineStages.includes('follow_up_needed'))
  assert.ok(crm.leadSources.includes('sponsor_application'))
  assert.ok(crm.activityKinds.includes('task'))
  assert.ok(crm.trustControls.includes('pipeline labels are configurable per ecosystem'))
  assert.ok(crm.trustControls.includes('admin identity is derived from session only'))
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

test('advertising sponsorship contract protects disclosure, delivery, and guardrails', () => {
  const ads = PLATFORM_CONTRACT_REGISTRY.advertisingSponsorship
  assert.ok(ads.offerTypes.some((type) => type.key === 'sponsorship-package'))
  assert.ok(ads.offerTypes.some((type) => type.key === 'delivery-log'))
  assert.ok(ads.requiredFields.includes('disclosureLabel'))
  assert.ok(ads.requiredFields.includes('guardrailMetrics'))
  assert.ok(ads.placementTypes.includes('directory-feature'))
  assert.ok(ads.operatorControls.includes('cap frequency'))
  assert.ok(ads.trustControls.includes('sponsored visibility is labeled'))
  assert.ok(ads.trustControls.includes('AI optimization cannot use engagement-only metrics'))
})

test('commerce payments contract protects provider references, refunds, and financial exports', () => {
  const commerce = PLATFORM_CONTRACT_REGISTRY.commercePayments
  assert.ok(commerce.recordTypes.some((type) => type.key === 'order'))
  assert.ok(commerce.recordTypes.some((type) => type.key === 'ledger-entry'))
  assert.ok(commerce.requiredFields.includes('providerReference'))
  assert.ok(commerce.requiredFields.includes('netCents'))
  assert.ok(commerce.statusStates.includes('partially-refunded'))
  assert.ok(commerce.providerTypes.includes('eventbrite'))
  assert.ok(commerce.operatorControls.includes('reconcile provider totals'))
  assert.ok(commerce.trustControls.includes('raw payment credentials are never stored'))
  assert.ok(commerce.trustControls.includes('provider errors do not expose secrets'))
})

test('integrations webhooks contract protects signatures, idempotency, and secret-safe sync', () => {
  const integrations = PLATFORM_CONTRACT_REGISTRY.integrationsWebhooks
  assert.ok(integrations.integrationTypes.some((type) => type.key === 'email-provider'))
  assert.ok(integrations.integrationTypes.some((type) => type.key === 'ticketing-provider'))
  assert.ok(integrations.requiredFields.includes('credentialReference'))
  assert.ok(integrations.requiredFields.includes('idempotencyKey'))
  assert.ok(integrations.directions.includes('bidirectional'))
  assert.ok(integrations.webhookDeliveryStates.includes('ignored-duplicate'))
  assert.ok(integrations.operatorControls.includes('rotate credential'))
  assert.ok(integrations.trustControls.includes('webhook signatures are verified'))
  assert.ok(integrations.trustControls.includes('provider errors do not expose secrets'))
})

test('operations audit contract protects audit trails, exports, incidents, and rollback evidence', () => {
  const operations = PLATFORM_CONTRACT_REGISTRY.operationsAudit
  assert.ok(operations.recordTypes.some((type) => type.key === 'audit-event'))
  assert.ok(operations.recordTypes.some((type) => type.key === 'rollback-record'))
  assert.ok(operations.requiredFields.includes('requestId'))
  assert.ok(operations.requiredFields.includes('evidence'))
  assert.ok(operations.statusStates.includes('rolled-back'))
  assert.ok(operations.exportScopes.includes('audit-log'))
  assert.ok(operations.operatorControls.includes('redact sensitive metadata'))
  assert.ok(operations.trustControls.includes('secrets are never logged'))
  assert.ok(operations.trustControls.includes('audit records are append-only by default'))
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

test('theme contract keeps ecosystem presentation configurable', () => {
  const themes = PLATFORM_CONTRACT_REGISTRY.themes
  assert.ok(themes.recordTypes.some((type) => type.key === 'theme-preset'))
  assert.ok(themes.requiredFields.includes('branding'))
  assert.ok(themes.brandingFields.includes('brand'))
  assert.ok(themes.overrideFields.includes('sectionOrder'))
  assert.ok(themes.resolutionRules.includes('event theme is the base presentation layer'))
  assert.ok(themes.trustControls.includes('theme defaults must be overrideable per ecosystem'))
})

test('Admin OS contract keeps operator workspaces reusable and trusted', () => {
  const admin = PLATFORM_CONTRACT_REGISTRY.adminOs
  assert.ok(admin.workspaceTypes.some((type) => type.key === 'operations'))
  assert.ok(admin.workspaceTypes.some((type) => type.key === 'relationships'))
  assert.ok(admin.requiredFields.includes('mutationPolicy'))
  assert.ok(admin.mutationPolicies.includes('same-origin-required'))
  assert.ok(admin.systemSurfaces.includes('platform contract registry'))
  assert.ok(admin.trustControls.includes('no second admin app for a module'))
})

test('auth access contract keeps identity server-derived and guarded', () => {
  const auth = PLATFORM_CONTRACT_REGISTRY.authAccessControl
  assert.ok(auth.recordTypes.some((type) => type.key === 'session'))
  assert.ok(auth.recordTypes.some((type) => type.key === 'auth-attempt'))
  assert.ok(auth.sessionControls.includes('httpOnly cookie'))
  assert.ok(auth.mutationControls.includes('state-changing browser requests require same-origin checks'))
  assert.ok(auth.passwordControls.includes('password hashes compare in constant time'))
  assert.ok(auth.trustControls.includes('identity is derived from session rows only'))
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
