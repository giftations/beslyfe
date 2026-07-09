// platform/discovery/directory-contract.mjs - reusable discovery and directory contract.
//
// Discovery is how opportunity becomes visible. The contract separates what can
// be found from how it is ranked, explained, filtered, hidden, sponsored, and
// personalized so directories can serve people without turning attention into
// the product.

export const DISCOVERY_SURFACES = [
  {
    key: 'people-directory',
    label: 'People Directory',
    purpose: 'Helps members find people by role, interests, goals, skills, availability, and shared context.',
  },
  {
    key: 'organization-directory',
    label: 'Organization Directory',
    purpose: 'Helps members find businesses, sponsors, vendors, venues, nonprofits, employers, and groups.',
  },
  {
    key: 'community-discovery',
    label: 'Community Discovery',
    purpose: 'Helps people find communities that match their goals, values, location, or industry.',
  },
  {
    key: 'experience-discovery',
    label: 'Experience Discovery',
    purpose: 'Helps people find events, sessions, programs, appointments, and places where opportunity can happen.',
  },
  {
    key: 'opportunity-discovery',
    label: 'Opportunity Discovery',
    purpose: 'Helps people find jobs, mentorship, partnerships, learning, customers, services, and introductions.',
  },
]

export const DISCOVERABLE_ENTITY_TYPES = [
  'person',
  'organization',
  'community',
  'experience',
  'opportunity',
  'knowledge',
  'marketplace-offer',
]

export const DISCOVERY_REQUIRED_FIELDS = [
  'id',
  'entityType',
  'entityId',
  'ecosystemId',
  'title',
  'summary',
  'visibility',
  'searchText',
  'facets',
  'rankingSignals',
  'consentPurposes',
  'explanation',
  'sponsoredState',
  'createdAt',
  'updatedAt',
]

export const DISCOVERY_VISIBILITY_STATES = [
  'private',
  'members-only',
  'ecosystem-public',
  'public',
  'hidden-by-owner',
  'hidden-by-moderation',
]

export const DISCOVERY_RANKING_SIGNALS = [
  'declared interests',
  'relationship context',
  'community membership',
  'verified organization',
  'geographic relevance',
  'availability',
  'recency',
  'outcome fit',
]

export const DISCOVERY_USER_CONTROLS = [
  'edit visibility',
  'hide from directory',
  'hide recommendation',
  'why am I seeing this',
  'reset discovery personalization',
  'disable discovery personalization',
  'report inaccurate listing',
]

export const DISCOVERY_TRUST_CONTROLS = [
  'ranking reasons are explainable',
  'sponsored placement is labeled',
  'private fields are excluded from search',
  'moderation removals are auditable',
  'AI discovery follows consent purposes',
  'engagement-only ranking is disallowed',
]

export function directoryDiscoveryContractSummary() {
  return {
    discoverySurfaces: DISCOVERY_SURFACES.map((surface) => ({
      key: surface.key,
      label: surface.label,
      purpose: surface.purpose,
    })),
    discoverableEntityTypes: [...DISCOVERABLE_ENTITY_TYPES],
    requiredFields: [...DISCOVERY_REQUIRED_FIELDS],
    visibilityStates: [...DISCOVERY_VISIBILITY_STATES],
    rankingSignals: [...DISCOVERY_RANKING_SIGNALS],
    userControls: [...DISCOVERY_USER_CONTROLS],
    trustControls: [...DISCOVERY_TRUST_CONTROLS],
  }
}
