// platform/communities/contract.mjs - reusable community contract.
//
// A community is the operating layer where people, organizations, experiences,
// knowledge, conversations, opportunities, and marketplace activity become one
// configurable ecosystem. Events can launch communities, but the community must
// continue creating opportunity before, during, and after any single event.

export const COMMUNITY_TYPES = [
  {
    key: 'event-community',
    label: 'Event Community',
    purpose: 'Connects attendees, exhibitors, sponsors, staff, speakers, and vendors around a shared event.',
  },
  {
    key: 'industry-community',
    label: 'Industry Community',
    purpose: 'Connects people and organizations around a market, trade, profession, or shared business domain.',
  },
  {
    key: 'local-community',
    label: 'Local Community',
    purpose: 'Connects people, places, businesses, services, and opportunities in a geographic area.',
  },
  {
    key: 'cause-community',
    label: 'Cause Community',
    purpose: 'Connects supporters, nonprofits, volunteers, resources, and outcomes around a mission.',
  },
  {
    key: 'learning-community',
    label: 'Learning Community',
    purpose: 'Connects mentors, learners, educators, resources, sessions, and growth paths.',
  },
]

export const COMMUNITY_REQUIRED_FIELDS = [
  'id',
  'displayName',
  'communityType',
  'ecosystemId',
  'ownerOrganizationIds',
  'memberPersonIds',
  'memberOrganizationIds',
  'visibility',
  'governance',
  'membershipPolicy',
  'contentPolicy',
  'aiPolicy',
  'relationshipIds',
  'experienceIds',
  'opportunityIds',
  'knowledgeIds',
  'createdAt',
  'updatedAt',
]

export const COMMUNITY_MEMBERSHIP_STATES = [
  'open',
  'invite-only',
  'application-required',
  'ticket-required',
  'staff-only',
  'archived',
]

export const COMMUNITY_GOVERNANCE_CONTROLS = [
  'define moderators',
  'approve public content',
  'set community rules',
  'review reported activity',
  'configure sponsor visibility',
  'publish moderation decisions',
  'export community data',
]

export const COMMUNITY_AI_BOUNDARIES = [
  'recommendations follow community purpose',
  'personalization follows member consent',
  'moderation assistance is reviewable',
  'sponsor influence is disclosed',
  'no rage-driven engagement ranking',
  'members can reset community personalization',
]

export const COMMUNITY_SUCCESS_OUTCOMES = [
  'meaningful introductions',
  'member retention',
  'business partnerships',
  'jobs and mentorship',
  'event attendance',
  'learning progress',
  'volunteer participation',
  'local discovery',
]

export function communityContractSummary() {
  return {
    communityTypes: COMMUNITY_TYPES.map((type) => ({
      key: type.key,
      label: type.label,
      purpose: type.purpose,
    })),
    requiredFields: [...COMMUNITY_REQUIRED_FIELDS],
    membershipStates: [...COMMUNITY_MEMBERSHIP_STATES],
    governanceControls: [...COMMUNITY_GOVERNANCE_CONTROLS],
    aiBoundaries: [...COMMUNITY_AI_BOUNDARIES],
    successOutcomes: [...COMMUNITY_SUCCESS_OUTCOMES],
  }
}
