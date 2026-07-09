// platform/access/application-contract.mjs - reusable access and application contract.
//
// Access is the gateway between interest and participation. It must support
// lightweight signups, reviewed applications, ticket unlocks, memberships, role
// requests, and restricted capabilities without hardcoding any one ecosystem's
// workflow.

export const ACCESS_REQUEST_TYPES = [
  {
    key: 'participant-application',
    label: 'Participant Application',
    purpose: 'Lets a person request access to an ecosystem, community, experience, group, or program.',
  },
  {
    key: 'organization-application',
    label: 'Organization Application',
    purpose: 'Lets a business, nonprofit, sponsor, vendor, venue, employer, or team request participation.',
  },
  {
    key: 'role-request',
    label: 'Role Request',
    purpose: 'Lets a person or organization request a specific role such as speaker, exhibitor, mentor, volunteer, or staff.',
  },
  {
    key: 'ticket-unlock',
    label: 'Ticket Unlock',
    purpose: 'Controls access to paid packages, private purchase links, and gated experience entry.',
  },
  {
    key: 'capability-request',
    label: 'Capability Request',
    purpose: 'Controls elevated actions such as posting, selling, messaging, advertising, managing groups, or publishing content.',
  },
]

export const ACCESS_REQUIRED_FIELDS = [
  'id',
  'requestType',
  'requesterPersonId',
  'requesterOrganizationId',
  'ecosystemId',
  'targetEntityType',
  'targetEntityId',
  'requestedRole',
  'answers',
  'status',
  'reviewerIds',
  'decisionReason',
  'auditTrail',
  'consentPurposes',
  'createdAt',
  'updatedAt',
]

export const ACCESS_STATUS_STATES = [
  'draft',
  'submitted',
  'needs-information',
  'under-review',
  'approved',
  'approved-with-conditions',
  'rejected',
  'revoked',
  'expired',
]

export const ACCESS_REVIEW_CONTROLS = [
  'assign reviewer',
  'request more information',
  'approve with conditions',
  'reject with reason',
  'revoke access',
  'restore access',
  'export decision history',
]

export const ACCESS_APPLICANT_CONTROLS = [
  'save draft',
  'edit before submission',
  'view status',
  'withdraw request',
  'respond to information request',
  'request correction',
  'appeal decision',
]

export const ACCESS_TRUST_CONTROLS = [
  'decision reasons are recorded',
  'reviewer notes stay internal',
  'status is visible to requester',
  'conditional approvals are explicit',
  'AI summaries require human review',
  'automated decisions are disallowed',
  'revocations are auditable',
]

export function accessApplicationContractSummary() {
  return {
    requestTypes: ACCESS_REQUEST_TYPES.map((type) => ({
      key: type.key,
      label: type.label,
      purpose: type.purpose,
    })),
    requiredFields: [...ACCESS_REQUIRED_FIELDS],
    statusStates: [...ACCESS_STATUS_STATES],
    reviewControls: [...ACCESS_REVIEW_CONTROLS],
    applicantControls: [...ACCESS_APPLICANT_CONTROLS],
    trustControls: [...ACCESS_TRUST_CONTROLS],
  }
}
