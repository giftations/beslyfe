// platform/opportunities/contract.mjs - reusable opportunity contract.
//
// Opportunities are the atomic outcomes Beslyfe helps people discover and act
// on. This contract names the shared shape before matching, AI, marketplace,
// hiring, mentoring, volunteering, and event recommendations become runtime
// systems.

export const OPPORTUNITY_TYPES = [
  {
    key: 'introduction',
    label: 'Introduction',
    purpose: 'Connects people or organizations that should know each other.',
  },
  {
    key: 'employment',
    label: 'Employment',
    purpose: 'Connects a person with a job, contract, gig, or career path.',
  },
  {
    key: 'mentorship',
    label: 'Mentorship',
    purpose: 'Connects a person with guidance, coaching, or lived expertise.',
  },
  {
    key: 'commerce',
    label: 'Commerce',
    purpose: 'Connects a business with customers, vendors, sponsors, or partners.',
  },
  {
    key: 'learning',
    label: 'Learning',
    purpose: 'Connects a person with knowledge, classes, sessions, or resources.',
  },
  {
    key: 'volunteer',
    label: 'Volunteer',
    purpose: 'Connects a person with civic, nonprofit, or community service needs.',
  },
  {
    key: 'experience',
    label: 'Experience',
    purpose: 'Connects a person with an event, activity, booth, appointment, or place.',
  },
  {
    key: 'collaboration',
    label: 'Collaboration',
    purpose: 'Connects people or organizations around a shared project or mission.',
  },
]

export const OPPORTUNITY_STATES = [
  'draft',
  'discoverable',
  'recommended',
  'introduced',
  'accepted',
  'completed',
  'declined',
  'archived',
]

export const OPPORTUNITY_REQUIRED_FIELDS = [
  'id',
  'type',
  'title',
  'summary',
  'ecosystemId',
  'ownerType',
  'ownerId',
  'audience',
  'state',
  'visibility',
  'trustControls',
  'consentRequirements',
  'outcomeMetric',
  'createdAt',
  'updatedAt',
]

export const OPPORTUNITY_TRUST_CONTROLS = [
  'clear owner',
  'explain recommendation source',
  'respect consent requirements',
  'honor visibility boundary',
  'measure meaningful outcome',
  'allow mute or decline',
]

export function opportunityContractSummary() {
  return {
    opportunityTypes: OPPORTUNITY_TYPES.map((type) => ({
      key: type.key,
      label: type.label,
      purpose: type.purpose,
    })),
    states: [...OPPORTUNITY_STATES],
    requiredFields: [...OPPORTUNITY_REQUIRED_FIELDS],
    trustControls: [...OPPORTUNITY_TRUST_CONTROLS],
  }
}
