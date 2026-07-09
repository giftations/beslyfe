// platform/ecosystems/config-contract.mjs - reusable ecosystem configuration.
//
// This is the target contract every Beslyfe ecosystem should satisfy before it
// can be launched from configuration rather than product-specific source edits.
// It does not gate runtime behavior yet; it names the platform fields future
// code should populate, validate, and expose.

export const ECOSYSTEM_CONFIG_CONTRACT = {
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
    required: ['enabled', 'configuration'],
    purpose: 'Declares which reusable platform modules are active and how each one is configured.',
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
    required: ['workflows', 'questions', 'statusFlow', 'contracts'],
    purpose: 'Configures application and approval workflows for participants and organizations.',
  },
  marketplace: {
    required: ['offers', 'packages', 'providers', 'disclosureRules'],
    purpose: 'Configures tickets, packages, sponsorships, services, ads, and other exchange surfaces.',
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
