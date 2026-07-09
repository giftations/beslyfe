// platform/boundaries/data-boundary-contract.mjs - tenant and data boundaries.
//
// Every future platform record should declare its ownership, visibility,
// AI-use, portability, retention, and outcome context. This contract names the
// boundary fields before database migrations or runtime enforcement begin.

export const DATA_BOUNDARY_SCOPES = [
  {
    key: 'platform',
    label: 'Platform',
    purpose: 'Global Beslyfe rules, contracts, trust standards, and reusable configuration.',
  },
  {
    key: 'ecosystem',
    label: 'Ecosystem',
    purpose: 'Records scoped to one community, event, organization network, or marketplace context.',
  },
  {
    key: 'organization',
    label: 'Organization',
    purpose: 'Records owned or managed by a company, nonprofit, school, operator, sponsor, or partner.',
  },
  {
    key: 'person',
    label: 'Person',
    purpose: 'Identity, preferences, consent, media, messages, and opportunity history owned by a human.',
  },
  {
    key: 'experience',
    label: 'Experience',
    purpose: 'Sessions, venues, events, booths, appointments, and time/place-specific records.',
  },
  {
    key: 'operational',
    label: 'Operational',
    purpose: 'Security, audit, authentication, billing, legal, and infrastructure records.',
  },
  {
    key: 'analytics',
    label: 'Analytics',
    purpose: 'Aggregated outcome and guardrail measurement with minimization rules.',
  },
]

export const VISIBILITY_LEVELS = [
  'private',
  'participants',
  'organization',
  'ecosystem',
  'public',
  'admin-only',
]

export const AI_USE_LEVELS = [
  'prohibited',
  'explicit-consent-required',
  'public-only',
  'aggregate-only',
  'operator-requested',
]

export const PORTABILITY_LEVELS = [
  'not-portable',
  'export-only',
  'same-owner',
  'cross-ecosystem-with-consent',
  'platform-wide-with-consent',
]

export const RETENTION_CLASSES = [
  'user-controlled',
  'operational-current',
  'legal-financial',
  'security-audit',
  'aggregated-analytics',
  'delete-on-request',
]

export const REQUIRED_BOUNDARY_FIELDS = [
  'scope',
  'ecosystemId',
  'ownerType',
  'ownerId',
  'visibility',
  'editPolicy',
  'aiUse',
  'portability',
  'retention',
  'consentPurpose',
  'outcomeMetric',
]

export function dataBoundaryScopeKeys() {
  return DATA_BOUNDARY_SCOPES.map((scope) => scope.key)
}

export function dataBoundaryContractSummary() {
  return {
    scopes: DATA_BOUNDARY_SCOPES.map((scope) => ({
      key: scope.key,
      purpose: scope.purpose,
    })),
    visibilityLevels: [...VISIBILITY_LEVELS],
    aiUseLevels: [...AI_USE_LEVELS],
    portabilityLevels: [...PORTABILITY_LEVELS],
    retentionClasses: [...RETENTION_CLASSES],
    requiredFields: [...REQUIRED_BOUNDARY_FIELDS],
  }
}
