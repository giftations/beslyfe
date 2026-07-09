// platform/contracts.mjs - central registry for Beslyfe platform contracts.
//
// This file gives future implementation work one stable import path for the
// reusable platform contracts. It stays documentation-as-data: no runtime
// behavior is gated here yet.

import { MODULES } from './modules/manifest.mjs'
import { ecosystemConfigChecklist } from './ecosystems/config-contract.mjs'
import { personIdentityContractSummary } from './identity/person-contract.mjs'
import { organizationIdentityContractSummary } from './identity/organization-contract.mjs'
import { communityContractSummary } from './communities/contract.mjs'
import { relationshipContractSummary } from './relationships/contract.mjs'
import { conversationContractSummary } from './conversations/contract.mjs'
import { experienceContractSummary } from './experiences/contract.mjs'
import { opportunityContractSummary } from './opportunities/contract.mjs'
import { knowledgeContractSummary } from './knowledge/contract.mjs'
import { marketplaceContractSummary } from './marketplace/contract.mjs'
import { consentAiChecklist } from './trust/consent-ai-contract.mjs'
import { aiRecommendationContractSummary } from './ai/recommendation-contract.mjs'
import { analyticsContractSummary } from './analytics/outcome-contract.mjs'
import { dataBoundaryContractSummary } from './boundaries/data-boundary-contract.mjs'

export const PLATFORM_CONTRACT_REGISTRY = {
  modules: MODULES,
  ecosystemConfiguration: ecosystemConfigChecklist(),
  personIdentity: personIdentityContractSummary(),
  organizationIdentity: organizationIdentityContractSummary(),
  communities: communityContractSummary(),
  relationships: relationshipContractSummary(),
  conversations: conversationContractSummary(),
  experiences: experienceContractSummary(),
  opportunities: opportunityContractSummary(),
  knowledge: knowledgeContractSummary(),
  marketplace: marketplaceContractSummary(),
  consentAndAi: consentAiChecklist(),
  aiRecommendations: aiRecommendationContractSummary(),
  outcomeAnalytics: analyticsContractSummary(),
  dataBoundaries: dataBoundaryContractSummary(),
}

export function platformContractRegistrySummary() {
  return {
    moduleCount: PLATFORM_CONTRACT_REGISTRY.modules.length,
    ecosystemSectionCount: PLATFORM_CONTRACT_REGISTRY.ecosystemConfiguration.length,
    personIdentityRecordCount: PLATFORM_CONTRACT_REGISTRY.personIdentity.identityRecords.length,
    organizationIdentityRecordCount:
      PLATFORM_CONTRACT_REGISTRY.organizationIdentity.identityRecords.length,
    communityTypeCount: PLATFORM_CONTRACT_REGISTRY.communities.communityTypes.length,
    relationshipTypeCount: PLATFORM_CONTRACT_REGISTRY.relationships.relationshipTypes.length,
    conversationTypeCount: PLATFORM_CONTRACT_REGISTRY.conversations.conversationTypes.length,
    experienceTypeCount: PLATFORM_CONTRACT_REGISTRY.experiences.experienceTypes.length,
    opportunityTypeCount: PLATFORM_CONTRACT_REGISTRY.opportunities.opportunityTypes.length,
    knowledgeTypeCount: PLATFORM_CONTRACT_REGISTRY.knowledge.knowledgeTypes.length,
    marketplaceOfferTypeCount: PLATFORM_CONTRACT_REGISTRY.marketplace.offerTypes.length,
    consentPurposeCount: PLATFORM_CONTRACT_REGISTRY.consentAndAi.consentPurposes.length,
    aiRecommendationTargetCount: PLATFORM_CONTRACT_REGISTRY.aiRecommendations.targets.length,
    outcomeMetricCount: PLATFORM_CONTRACT_REGISTRY.outcomeAnalytics.outcomes.length,
    guardrailMetricCount: PLATFORM_CONTRACT_REGISTRY.outcomeAnalytics.guardrails.length,
    dataBoundaryScopeCount: PLATFORM_CONTRACT_REGISTRY.dataBoundaries.scopes.length,
  }
}
