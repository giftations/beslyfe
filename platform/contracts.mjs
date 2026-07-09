// platform/contracts.mjs - central registry for Beslyfe platform contracts.
//
// This file gives future implementation work one stable import path for the
// reusable platform contracts. It stays documentation-as-data: no runtime
// behavior is gated here yet.

import { MODULES } from './modules/manifest.mjs'
import { ecosystemConfigChecklist } from './ecosystems/config-contract.mjs'
import { relationshipContractSummary } from './relationships/contract.mjs'
import { opportunityContractSummary } from './opportunities/contract.mjs'
import { knowledgeContractSummary } from './knowledge/contract.mjs'
import { consentAiChecklist } from './trust/consent-ai-contract.mjs'
import { aiRecommendationContractSummary } from './ai/recommendation-contract.mjs'
import { analyticsContractSummary } from './analytics/outcome-contract.mjs'
import { dataBoundaryContractSummary } from './boundaries/data-boundary-contract.mjs'

export const PLATFORM_CONTRACT_REGISTRY = {
  modules: MODULES,
  ecosystemConfiguration: ecosystemConfigChecklist(),
  relationships: relationshipContractSummary(),
  opportunities: opportunityContractSummary(),
  knowledge: knowledgeContractSummary(),
  consentAndAi: consentAiChecklist(),
  aiRecommendations: aiRecommendationContractSummary(),
  outcomeAnalytics: analyticsContractSummary(),
  dataBoundaries: dataBoundaryContractSummary(),
}

export function platformContractRegistrySummary() {
  return {
    moduleCount: PLATFORM_CONTRACT_REGISTRY.modules.length,
    ecosystemSectionCount: PLATFORM_CONTRACT_REGISTRY.ecosystemConfiguration.length,
    relationshipTypeCount: PLATFORM_CONTRACT_REGISTRY.relationships.relationshipTypes.length,
    opportunityTypeCount: PLATFORM_CONTRACT_REGISTRY.opportunities.opportunityTypes.length,
    knowledgeTypeCount: PLATFORM_CONTRACT_REGISTRY.knowledge.knowledgeTypes.length,
    consentPurposeCount: PLATFORM_CONTRACT_REGISTRY.consentAndAi.consentPurposes.length,
    aiRecommendationTargetCount: PLATFORM_CONTRACT_REGISTRY.aiRecommendations.targets.length,
    outcomeMetricCount: PLATFORM_CONTRACT_REGISTRY.outcomeAnalytics.outcomes.length,
    guardrailMetricCount: PLATFORM_CONTRACT_REGISTRY.outcomeAnalytics.guardrails.length,
    dataBoundaryScopeCount: PLATFORM_CONTRACT_REGISTRY.dataBoundaries.scopes.length,
  }
}
