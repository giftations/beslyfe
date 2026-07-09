// platform/conversations/contract.mjs - reusable conversation contract.
//
// Conversations turn discovery into relationship-building. They may be direct
// messages, group chats, introductions, comments, support threads, or AI-assisted
// summaries, but they must preserve participant consent, visibility, safety, and
// context before they become opportunity signals.

export const CONVERSATION_TYPES = [
  {
    key: 'direct-message',
    label: 'Direct Message',
    purpose: 'Enables person-to-person follow-up with clear participants.',
  },
  {
    key: 'group-chat',
    label: 'Group Chat',
    purpose: 'Coordinates a trusted group around a shared topic, relationship, or opportunity.',
  },
  {
    key: 'introduction',
    label: 'Introduction',
    purpose: 'Starts a conversation because two or more people should know each other.',
  },
  {
    key: 'support',
    label: 'Support',
    purpose: 'Helps a person resolve a question, issue, or operational need.',
  },
  {
    key: 'comment-thread',
    label: 'Comment Thread',
    purpose: 'Lets community members discuss public or shared knowledge in context.',
  },
  {
    key: 'opportunity-followup',
    label: 'Opportunity Follow-Up',
    purpose: 'Tracks conversation around a job, lead, sponsorship, mentorship, event, or collaboration.',
  },
]

export const CONVERSATION_STATES = [
  'requested',
  'pending-consent',
  'active',
  'muted',
  'reported',
  'resolved',
  'archived',
]

export const CONVERSATION_REQUIRED_FIELDS = [
  'id',
  'type',
  'ecosystemId',
  'participantIds',
  'participantRoles',
  'state',
  'visibility',
  'consent',
  'topic',
  'relatedOpportunityId',
  'relatedRelationshipId',
  'aiUse',
  'safetyControls',
  'retentionPolicy',
  'createdAt',
  'updatedAt',
]

export const CONVERSATION_SAFETY_CONTROLS = [
  'participant consent',
  'mute conversation',
  'leave conversation',
  'report conversation',
  'block participant',
  'private AI opt-in from all participants',
  'retention policy',
]

export function conversationContractSummary() {
  return {
    conversationTypes: CONVERSATION_TYPES.map((type) => ({
      key: type.key,
      label: type.label,
      purpose: type.purpose,
    })),
    states: [...CONVERSATION_STATES],
    requiredFields: [...CONVERSATION_REQUIRED_FIELDS],
    safetyControls: [...CONVERSATION_SAFETY_CONTROLS],
  }
}
