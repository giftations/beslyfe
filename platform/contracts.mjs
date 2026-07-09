// platform/contracts.mjs - central registry for Beslyfe platform contracts.
//
// This file gives future implementation work one stable import path for the
// reusable platform contracts. It stays documentation-as-data: no runtime
// behavior is gated here yet.

import { MODULES } from './modules/manifest.mjs'
import { ecosystemConfigChecklist } from './ecosystems/config-contract.mjs'
import { accessApplicationContractSummary } from './access/application-contract.mjs'
import { personIdentityContractSummary } from './identity/person-contract.mjs'
import { organizationIdentityContractSummary } from './identity/organization-contract.mjs'
import { communityContractSummary } from './communities/contract.mjs'
import { directoryDiscoveryContractSummary } from './discovery/directory-contract.mjs'
import { notificationContractSummary } from './notifications/contract.mjs'
import { moderationTrustSafetyContractSummary } from './moderation/trust-safety-contract.mjs'
import { relationshipContractSummary } from './relationships/contract.mjs'
import { crmRelationshipContractSummary } from './crm/relationship-contract.mjs'
import { conversationContractSummary } from './conversations/contract.mjs'
import { experienceContractSummary } from './experiences/contract.mjs'
import { schedulingContractSummary } from './scheduling/contract.mjs'
import { placesMapsContractSummary } from './places/maps-contract.mjs'
import { contentCmsContractSummary } from './content/cms-contract.mjs'
import { opportunityContractSummary } from './opportunities/contract.mjs'
import { knowledgeContractSummary } from './knowledge/contract.mjs'
import { marketplaceContractSummary } from './marketplace/contract.mjs'
import { advertisingSponsorshipContractSummary } from './advertising/sponsorship-contract.mjs'
import { commercePaymentsContractSummary } from './commerce/payments-contract.mjs'
import { integrationsWebhooksContractSummary } from './integrations/webhooks-contract.mjs'
import { operationsAuditContractSummary } from './operations/audit-contract.mjs'
import { consentAiChecklist } from './trust/consent-ai-contract.mjs'
import { aiRecommendationContractSummary } from './ai/recommendation-contract.mjs'
import { analyticsContractSummary } from './analytics/outcome-contract.mjs'
import { dataBoundaryContractSummary } from './boundaries/data-boundary-contract.mjs'
import { themeContractSummary } from './themes/contract.mjs'
import { adminOsContractSummary } from './admin/os-contract.mjs'
import { authAccessControlContractSummary } from './auth/access-control-contract.mjs'
import { dataPortabilityContractSummary } from './data/portability-contract.mjs'
import { importContractSummary } from './lifecycle/import-contract.mjs'
import { migrationContractSummary } from './lifecycle/migration-contract.mjs'
import { releaseGateContractSummary } from './lifecycle/release-gate-contract.mjs'

export const PLATFORM_CONTRACT_REGISTRY = {
  modules: MODULES,
  ecosystemConfiguration: ecosystemConfigChecklist(),
  accessApplications: accessApplicationContractSummary(),
  personIdentity: personIdentityContractSummary(),
  organizationIdentity: organizationIdentityContractSummary(),
  communities: communityContractSummary(),
  directoryDiscovery: directoryDiscoveryContractSummary(),
  notifications: notificationContractSummary(),
  moderationTrustSafety: moderationTrustSafetyContractSummary(),
  relationships: relationshipContractSummary(),
  crmRelationships: crmRelationshipContractSummary(),
  conversations: conversationContractSummary(),
  experiences: experienceContractSummary(),
  scheduling: schedulingContractSummary(),
  placesMaps: placesMapsContractSummary(),
  contentCms: contentCmsContractSummary(),
  opportunities: opportunityContractSummary(),
  knowledge: knowledgeContractSummary(),
  marketplace: marketplaceContractSummary(),
  advertisingSponsorship: advertisingSponsorshipContractSummary(),
  commercePayments: commercePaymentsContractSummary(),
  integrationsWebhooks: integrationsWebhooksContractSummary(),
  operationsAudit: operationsAuditContractSummary(),
  consentAndAi: consentAiChecklist(),
  aiRecommendations: aiRecommendationContractSummary(),
  outcomeAnalytics: analyticsContractSummary(),
  dataBoundaries: dataBoundaryContractSummary(),
  themes: themeContractSummary(),
  adminOs: adminOsContractSummary(),
  authAccessControl: authAccessControlContractSummary(),
  dataPortability: dataPortabilityContractSummary(),
  imports: importContractSummary(),
  migrations: migrationContractSummary(),
  releaseGates: releaseGateContractSummary(),
}

export function platformContractRegistrySummary() {
  return {
    moduleCount: PLATFORM_CONTRACT_REGISTRY.modules.length,
    ecosystemSectionCount: PLATFORM_CONTRACT_REGISTRY.ecosystemConfiguration.length,
    accessRequestTypeCount: PLATFORM_CONTRACT_REGISTRY.accessApplications.requestTypes.length,
    personIdentityRecordCount: PLATFORM_CONTRACT_REGISTRY.personIdentity.identityRecords.length,
    organizationIdentityRecordCount:
      PLATFORM_CONTRACT_REGISTRY.organizationIdentity.identityRecords.length,
    communityTypeCount: PLATFORM_CONTRACT_REGISTRY.communities.communityTypes.length,
    discoverySurfaceCount: PLATFORM_CONTRACT_REGISTRY.directoryDiscovery.discoverySurfaces.length,
    notificationTypeCount: PLATFORM_CONTRACT_REGISTRY.notifications.notificationTypes.length,
    moderationCaseTypeCount: PLATFORM_CONTRACT_REGISTRY.moderationTrustSafety.caseTypes.length,
    relationshipTypeCount: PLATFORM_CONTRACT_REGISTRY.relationships.relationshipTypes.length,
    crmRecordTypeCount: PLATFORM_CONTRACT_REGISTRY.crmRelationships.recordTypes.length,
    crmPipelineStageCount: PLATFORM_CONTRACT_REGISTRY.crmRelationships.pipelineStages.length,
    conversationTypeCount: PLATFORM_CONTRACT_REGISTRY.conversations.conversationTypes.length,
    experienceTypeCount: PLATFORM_CONTRACT_REGISTRY.experiences.experienceTypes.length,
    schedulingEntryTypeCount: PLATFORM_CONTRACT_REGISTRY.scheduling.entryTypes.length,
    placeTypeCount: PLATFORM_CONTRACT_REGISTRY.placesMaps.placeTypes.length,
    contentTypeCount: PLATFORM_CONTRACT_REGISTRY.contentCms.contentTypes.length,
    opportunityTypeCount: PLATFORM_CONTRACT_REGISTRY.opportunities.opportunityTypes.length,
    knowledgeTypeCount: PLATFORM_CONTRACT_REGISTRY.knowledge.knowledgeTypes.length,
    marketplaceOfferTypeCount: PLATFORM_CONTRACT_REGISTRY.marketplace.offerTypes.length,
    advertisingOfferTypeCount:
      PLATFORM_CONTRACT_REGISTRY.advertisingSponsorship.offerTypes.length,
    commerceRecordTypeCount: PLATFORM_CONTRACT_REGISTRY.commercePayments.recordTypes.length,
    integrationTypeCount: PLATFORM_CONTRACT_REGISTRY.integrationsWebhooks.integrationTypes.length,
    operationsRecordTypeCount: PLATFORM_CONTRACT_REGISTRY.operationsAudit.recordTypes.length,
    consentPurposeCount: PLATFORM_CONTRACT_REGISTRY.consentAndAi.consentPurposes.length,
    aiRecommendationTargetCount: PLATFORM_CONTRACT_REGISTRY.aiRecommendations.targets.length,
    outcomeMetricCount: PLATFORM_CONTRACT_REGISTRY.outcomeAnalytics.outcomes.length,
    guardrailMetricCount: PLATFORM_CONTRACT_REGISTRY.outcomeAnalytics.guardrails.length,
    dataBoundaryScopeCount: PLATFORM_CONTRACT_REGISTRY.dataBoundaries.scopes.length,
    themeRecordTypeCount: PLATFORM_CONTRACT_REGISTRY.themes.recordTypes.length,
    adminWorkspaceTypeCount: PLATFORM_CONTRACT_REGISTRY.adminOs.workspaceTypes.length,
    authRecordTypeCount: PLATFORM_CONTRACT_REGISTRY.authAccessControl.recordTypes.length,
    dataPortabilityScopeCount: PLATFORM_CONTRACT_REGISTRY.dataPortability.exportScopes.length,
    importTargetCount: PLATFORM_CONTRACT_REGISTRY.imports.targets.length,
    migrationChangeTypeCount: PLATFORM_CONTRACT_REGISTRY.migrations.changeTypes.length,
    releaseGateAreaCount: PLATFORM_CONTRACT_REGISTRY.releaseGates.gateAreas.length,
  }
}
