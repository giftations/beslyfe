// platform/ai/recommendation-contract.mjs - explainable AI recommendations.
//
// AI recommendations should maximize meaningful opportunity, not engagement.
// This contract defines the minimum shape future recommendation systems must
// satisfy before they suggest people, organizations, experiences, knowledge, or
// opportunities.

export const AI_RECOMMENDATION_TARGETS = [
  'person',
  'organization',
  'experience',
  'opportunity',
  'knowledge',
  'conversation',
  'marketplace',
]

export const AI_RECOMMENDATION_REQUIRED_FIELDS = [
  'id',
  'targetType',
  'targetId',
  'recipientType',
  'recipientId',
  'ecosystemId',
  'reason',
  'dataSources',
  'consentPurposes',
  'confidence',
  'userControls',
  'explanation',
  'outcomeMetric',
  'guardrailMetrics',
  'createdAt',
]

export const AI_RECOMMENDATION_USER_CONTROLS = [
  'why am I seeing this',
  'hide this recommendation',
  'mute source',
  'reset personalization',
  'disable personalization',
  'correct my data',
]

export const AI_RECOMMENDATION_GUARDRAILS = [
  'no engagement-only ranking',
  'no private conversation inference without consent',
  'no cross-ecosystem learning without consent',
  'no recommendation without explanation',
  'no hidden paid placement',
  'human escalation for sensitive outcomes',
]

export function aiRecommendationContractSummary() {
  return {
    targets: [...AI_RECOMMENDATION_TARGETS],
    requiredFields: [...AI_RECOMMENDATION_REQUIRED_FIELDS],
    userControls: [...AI_RECOMMENDATION_USER_CONTROLS],
    guardrails: [...AI_RECOMMENDATION_GUARDRAILS],
  }
}
