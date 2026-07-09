// platform/experiences/contract.mjs - reusable experience contract.
//
// Experiences are time, place, or program moments where opportunity can happen:
// events, sessions, appointments, booths, venues, office hours, activations, and
// scheduled community programs. They must keep timing, location, ownership,
// visibility, and change history clear.

export const EXPERIENCE_TYPES = [
  {
    key: 'event',
    label: 'Event',
    purpose: 'Creates a broad ecosystem gathering with many people, organizations, and opportunities.',
  },
  {
    key: 'session',
    label: 'Session',
    purpose: 'Creates a scheduled learning, speaking, workshop, or entertainment moment.',
  },
  {
    key: 'appointment',
    label: 'Appointment',
    purpose: 'Creates a reserved meeting, office hour, consultation, or mentor slot.',
  },
  {
    key: 'booth',
    label: 'Booth',
    purpose: 'Creates a physical or virtual place where an organization can be discovered.',
  },
  {
    key: 'venue',
    label: 'Venue',
    purpose: 'Creates the place boundary for navigation, operations, and discovery.',
  },
  {
    key: 'program',
    label: 'Program',
    purpose: 'Creates a recurring or multi-step experience path over time.',
  },
]

export const EXPERIENCE_REQUIRED_FIELDS = [
  'id',
  'type',
  'title',
  'summary',
  'ecosystemId',
  'ownerType',
  'ownerId',
  'startsAt',
  'endsAt',
  'timezone',
  'location',
  'capacity',
  'visibility',
  'status',
  'participants',
  'relatedOpportunityIds',
  'changeHistory',
  'outcomeMetric',
  'createdAt',
  'updatedAt',
]

export const EXPERIENCE_STATES = [
  'draft',
  'scheduled',
  'published',
  'changed',
  'active',
  'completed',
  'cancelled',
  'archived',
]

export const EXPERIENCE_TRUST_CONTROLS = [
  'time and place accuracy',
  'change visibility',
  'capacity clarity',
  'host ownership',
  'accessibility information',
  'published versus draft boundary',
  'attendance outcome tracking',
]

export function experienceContractSummary() {
  return {
    experienceTypes: EXPERIENCE_TYPES.map((type) => ({
      key: type.key,
      label: type.label,
      purpose: type.purpose,
    })),
    requiredFields: [...EXPERIENCE_REQUIRED_FIELDS],
    states: [...EXPERIENCE_STATES],
    trustControls: [...EXPERIENCE_TRUST_CONTROLS],
  }
}
