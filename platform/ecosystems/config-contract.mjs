// platform/ecosystems/config-contract.mjs - reusable ecosystem configuration.
//
// This is the target contract every Beslyfe ecosystem should satisfy before it
// can be launched from configuration rather than product-specific source edits.
// It does not gate runtime behavior yet; it names the platform fields future
// code should populate, validate, and expose.

export const ECOSYSTEM_CONFIG_CONTRACT = {
  product: {
    required: ['productType', 'primaryOutcome', 'answers', 'capabilityPlan'],
    purpose: 'Starts from what the owner is building and recommends only the capabilities needed for that outcome.',
  },
  identity: {
    required: ['name', 'slug', 'description', 'status', 'lifecycle'],
    purpose: 'Names the ecosystem and defines whether it is planning, active, archived, or retired.',
  },
  ownership: {
    required: ['operatorOrganizationId', 'representativeAccountIds'],
    purpose: 'Connects the ecosystem to the organization and people responsible for it.',
  },
  domains: {
    required: ['canonicalUrl', 'publicHost', 'metadataImage'],
    purpose: 'Controls public routing, canonical identity, and social sharing metadata.',
  },
  theme: {
    required: ['themeKey', 'branding'],
    purpose: 'Applies visual identity through the platform theme registry and ecosystem-level overrides.',
  },
  modules: {
    required: ['available', 'enabled', 'disabled', 'configuration'],
    purpose: 'Declares which reusable capabilities are active, optional, or intentionally disabled for this ecosystem.',
  },
  roles: {
    required: ['availableRoles', 'roleLabels', 'permissions'],
    purpose: 'Defines how people and organizations participate inside the ecosystem.',
  },
  profiles: {
    required: ['fields', 'visibilityDefaults', 'approvalPolicy'],
    purpose: 'Configures directory/profile data without hardcoding product-specific fields.',
  },
  intake: {
    required: ['enabled', 'workflows', 'questions', 'statusFlow', 'contracts'],
    purpose: 'Configures application and approval workflows only when the selected product needs gated participation.',
  },
  marketplace: {
    required: ['enabled', 'offers', 'providers', 'disclosureRules'],
    purpose: 'Configures products, services, bookings, donations, leads, tickets, and other exchange surfaces independently.',
  },
  privacy: {
    required: ['visibilityDefaults', 'dataUsePurposes', 'retentionRules'],
    purpose: 'Defines privacy posture and data boundaries before member data is collected.',
  },
  consent: {
    required: ['requiredConsents', 'revocationPaths', 'crossEcosystemRules'],
    purpose: 'Defines what users must explicitly allow and how they can revoke it.',
  },
  ai: {
    required: ['personalizationDefaults', 'allowedData', 'explanationRules', 'launchGate'],
    purpose: 'Controls AI use before recommendations, summaries, or introductions are enabled.',
  },
  analytics: {
    required: ['outcomeMetrics', 'guardrailMetrics', 'auditEvents'],
    purpose: 'Measures meaningful opportunity and trust guardrails instead of empty engagement.',
  },
}

export const REQUIRED_ECOSYSTEM_SECTIONS = Object.keys(ECOSYSTEM_CONFIG_CONTRACT)

export function ecosystemConfigChecklist() {
  return REQUIRED_ECOSYSTEM_SECTIONS.map((key) => ({
    key,
    required: [...ECOSYSTEM_CONFIG_CONTRACT[key].required],
    purpose: ECOSYSTEM_CONFIG_CONTRACT[key].purpose,
  }))
}
