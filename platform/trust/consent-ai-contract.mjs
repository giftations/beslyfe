// platform/trust/consent-ai-contract.mjs - consent and AI-use boundaries.
//
// This contract converts the Trust, Data, And AI Foundation into
// documentation-as-data. Future AI and personalization features should use this
// as the checklist before reading data, creating recommendations, or learning
// long-term preferences.

export const CONSENT_PURPOSES = [
  {
    key: 'public-profile',
    label: 'Public Profile Visibility',
    requiredFor: ['directory', 'recommendations'],
    userControl: 'Can hide or edit public profile fields.',
  },
  {
    key: 'personalization',
    label: 'AI Personalization',
    requiredFor: ['recommendations', 'opportunity matching'],
    userControl: 'Can disable or reset personalization without deleting account.',
  },
  {
    key: 'cross-ecosystem',
    label: 'Cross-Ecosystem Learning',
    requiredFor: ['portable opportunity graph', 'multi-community recommendations'],
    userControl: 'Can prevent one ecosystem from influencing another.',
  },
  {
    key: 'location',
    label: 'Location-Based Opportunity',
    requiredFor: ['maps', 'nearby recommendations', 'meetups'],
    userControl: 'Can revoke location sharing anytime.',
  },
  {
    key: 'private-conversation-ai',
    label: 'Private Conversation AI',
    requiredFor: ['message summaries', 'relationship inference from private messages'],
    userControl: 'Requires all conversation participants to explicitly opt in.',
  },
  {
    key: 'media-reuse',
    label: 'Media Reuse',
    requiredFor: ['promotion', 'AI-assisted content reuse', 'cross-page media use'],
    userControl: 'Can limit media to the context where it was uploaded.',
  },
  {
    key: 'marketing',
    label: 'Marketing Communications',
    requiredFor: ['campaigns', 'sponsor follow-up', 'event promotion'],
    userControl: 'Can unsubscribe or change communication preferences.',
  },
]

export const AI_DATA_SCOPES = [
  {
    key: 'public',
    label: 'Public Data',
    examples: ['approved public profile fields', 'public event pages', 'public organization listings'],
    consentRequired: ['public-profile'],
  },
  {
    key: 'member-activity',
    label: 'Member Activity',
    examples: ['follows', 'likes', 'public posts', 'session attendance'],
    consentRequired: ['personalization'],
  },
  {
    key: 'location',
    label: 'Location Data',
    examples: ['shared location', 'booth proximity', 'venue navigation'],
    consentRequired: ['location'],
  },
  {
    key: 'private-conversation',
    label: 'Private Conversation Data',
    examples: ['direct messages', 'group messages', 'private intros'],
    consentRequired: ['private-conversation-ai'],
  },
  {
    key: 'cross-ecosystem',
    label: 'Cross-Ecosystem Context',
    examples: ['roles across communities', 'portable relationship graph', 'multi-event history'],
    consentRequired: ['cross-ecosystem'],
  },
]

export const AI_LAUNCH_GATE_FIELDS = [
  'opportunityCreated',
  'dataNeeded',
  'consentRequired',
  'userExplanation',
  'userControls',
  'failureMode',
  'humanEscalation',
  'trustRisks',
  'outcomeMetrics',
  'guardrailMetrics',
]

export function consentPurposeKeys() {
  return CONSENT_PURPOSES.map((purpose) => purpose.key)
}

export function aiDataScopeKeys() {
  return AI_DATA_SCOPES.map((scope) => scope.key)
}

export function consentAiChecklist() {
  return {
    consentPurposes: CONSENT_PURPOSES.map((purpose) => ({
      key: purpose.key,
      requiredFor: [...purpose.requiredFor],
      userControl: purpose.userControl,
    })),
    aiDataScopes: AI_DATA_SCOPES.map((scope) => ({
      key: scope.key,
      consentRequired: [...scope.consentRequired],
      examples: [...scope.examples],
    })),
    launchGateFields: [...AI_LAUNCH_GATE_FIELDS],
  }
}
