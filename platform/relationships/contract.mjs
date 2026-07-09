// platform/relationships/contract.mjs - reusable relationship contract.
//
// Relationships are first-class platform data. This contract defines the shared
// shape future code should use when connecting people, organizations,
// experiences, opportunities, conversations, marketplace actions, AI
// recommendations, and outcomes.

export const RELATIONSHIP_ENTITY_TYPES = [
  'person',
  'organization',
  'ecosystem',
  'experience',
  'opportunity',
  'conversation',
  'knowledge',
  'marketplace',
  'ai',
  'analytics',
]

export const RELATIONSHIP_TYPES = [
  {
    key: 'knows',
    label: 'Knows',
    connects: ['person', 'person'],
    purpose: 'Represents an existing human connection.',
  },
  {
    key: 'represents',
    label: 'Represents',
    connects: ['person', 'organization'],
    purpose: 'Connects a person to an organization they can act for.',
  },
  {
    key: 'participates-in',
    label: 'Participates In',
    connects: ['person', 'ecosystem'],
    purpose: 'Shows that a person is part of an ecosystem.',
  },
  {
    key: 'hosts',
    label: 'Hosts',
    connects: ['organization', 'experience'],
    purpose: 'Connects an organization to an experience it runs or sponsors.',
  },
  {
    key: 'offers',
    label: 'Offers',
    connects: ['organization', 'opportunity'],
    purpose: 'Connects an organization to a job, package, service, sponsorship, or other opportunity.',
  },
  {
    key: 'interested-in',
    label: 'Interested In',
    connects: ['person', 'opportunity'],
    purpose: 'Captures expressed interest without implying commitment.',
  },
  {
    key: 'introduced-to',
    label: 'Introduced To',
    connects: ['person', 'person'],
    purpose: 'Records an intentional introduction and its opportunity context.',
  },
  {
    key: 'discusses',
    label: 'Discusses',
    connects: ['conversation', 'opportunity'],
    purpose: 'Links a conversation to the opportunity it is advancing.',
  },
  {
    key: 'recommended',
    label: 'Recommended',
    connects: ['ai', 'opportunity'],
    purpose: 'Links an AI recommendation to the opportunity it surfaced and must explain.',
  },
  {
    key: 'resulted-in',
    label: 'Resulted In',
    connects: ['relationship', 'analytics'],
    purpose: 'Connects a relationship to a measurable outcome or guardrail event.',
  },
]

export const RELATIONSHIP_STATES = [
  'suggested',
  'pending-consent',
  'active',
  'muted',
  'declined',
  'completed',
  'archived',
]

export const RELATIONSHIP_REQUIRED_FIELDS = [
  'id',
  'type',
  'sourceType',
  'sourceId',
  'targetType',
  'targetId',
  'ecosystemId',
  'state',
  'visibility',
  'consent',
  'origin',
  'createdAt',
  'updatedAt',
]

export function relationshipTypeKeys() {
  return RELATIONSHIP_TYPES.map((type) => type.key)
}

export function relationshipContractSummary() {
  return {
    entityTypes: [...RELATIONSHIP_ENTITY_TYPES],
    relationshipTypes: RELATIONSHIP_TYPES.map((type) => ({
      key: type.key,
      label: type.label,
      connects: [...type.connects],
      purpose: type.purpose,
    })),
    states: [...RELATIONSHIP_STATES],
    requiredFields: [...RELATIONSHIP_REQUIRED_FIELDS],
  }
}
