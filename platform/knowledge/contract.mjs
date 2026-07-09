// platform/knowledge/contract.mjs - reusable knowledge contract.
//
// Knowledge is the context that helps people act on opportunity. It includes
// learning resources, community memory, guides, media, documents, and AI-readable
// summaries, but it must preserve ownership, consent, provenance, and usefulness.

export const KNOWLEDGE_TYPES = [
  {
    key: 'guide',
    label: 'Guide',
    purpose: 'Explains how to complete a workflow, prepare for an experience, or act on an opportunity.',
  },
  {
    key: 'lesson',
    label: 'Lesson',
    purpose: 'Teaches a skill, concept, or practice connected to a goal.',
  },
  {
    key: 'resource',
    label: 'Resource',
    purpose: 'Collects links, documents, media, or references someone can use later.',
  },
  {
    key: 'story',
    label: 'Story',
    purpose: 'Preserves lived experience, founder context, member journeys, or community proof.',
  },
  {
    key: 'faq',
    label: 'FAQ',
    purpose: 'Answers repeated questions with stable, reviewable information.',
  },
  {
    key: 'policy',
    label: 'Policy',
    purpose: 'Defines rules, standards, requirements, or commitments.',
  },
  {
    key: 'summary',
    label: 'Summary',
    purpose: 'Condenses conversations, sessions, documents, or ecosystem activity into useful context.',
  },
]

export const KNOWLEDGE_REQUIRED_FIELDS = [
  'id',
  'type',
  'title',
  'summary',
  'ecosystemId',
  'ownerType',
  'ownerId',
  'source',
  'visibility',
  'provenance',
  'consentRequirements',
  'aiUse',
  'reviewState',
  'outcomeMetric',
  'createdAt',
  'updatedAt',
]

export const KNOWLEDGE_REVIEW_STATES = [
  'draft',
  'review-needed',
  'approved',
  'published',
  'stale',
  'archived',
]

export const KNOWLEDGE_TRUST_CONTROLS = [
  'clear source',
  'owner can edit or remove',
  'review before AI reuse',
  'honor visibility boundary',
  'track stale content',
  'cite source in recommendations',
]

export function knowledgeContractSummary() {
  return {
    knowledgeTypes: KNOWLEDGE_TYPES.map((type) => ({
      key: type.key,
      label: type.label,
      purpose: type.purpose,
    })),
    requiredFields: [...KNOWLEDGE_REQUIRED_FIELDS],
    reviewStates: [...KNOWLEDGE_REVIEW_STATES],
    trustControls: [...KNOWLEDGE_TRUST_CONTROLS],
  }
}
