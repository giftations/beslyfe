// platform/moderation/trust-safety-contract.mjs - reusable moderation and trust safety contract.
//
// Healthy communities require more than content removal. The platform needs
// reporting, review, enforcement, appeals, transparency, and AI-assist
// boundaries that protect people while preserving due process and trust.

export const MODERATION_CASE_TYPES = [
  {
    key: 'content-report',
    label: 'Content Report',
    purpose: 'Reviews posts, comments, media, listings, knowledge, or marketplace content reported by members or operators.',
  },
  {
    key: 'conduct-report',
    label: 'Conduct Report',
    purpose: 'Reviews behavior involving harassment, fraud, spam, safety concerns, or abuse across conversations and experiences.',
  },
  {
    key: 'identity-review',
    label: 'Identity Review',
    purpose: 'Reviews impersonation, organization claims, verification concerns, or account protection events.',
  },
  {
    key: 'marketplace-dispute',
    label: 'Marketplace Dispute',
    purpose: 'Reviews disputes involving offers, sponsorships, ads, orders, payments, refunds, or service promises.',
  },
  {
    key: 'ai-safety-review',
    label: 'AI Safety Review',
    purpose: 'Reviews recommendations, summaries, ranking, personalization, or generated content that may harm trust.',
  },
]

export const MODERATION_REQUIRED_FIELDS = [
  'id',
  'caseType',
  'ecosystemId',
  'reportedEntityType',
  'reportedEntityId',
  'reporterPersonId',
  'subjectPersonIds',
  'subjectOrganizationIds',
  'reason',
  'evidence',
  'status',
  'severity',
  'reviewerIds',
  'decision',
  'decisionReason',
  'appealState',
  'auditTrail',
  'createdAt',
  'updatedAt',
]

export const MODERATION_STATUS_STATES = [
  'submitted',
  'triaged',
  'under-review',
  'action-required',
  'resolved',
  'dismissed',
  'appealed',
  'reopened',
]

export const MODERATION_ACTION_TYPES = [
  'no action',
  'request correction',
  'hide content',
  'remove content',
  'limit visibility',
  'restrict capability',
  'suspend account',
  'restore content',
]

export const MODERATION_USER_CONTROLS = [
  'report issue',
  'block person',
  'mute person',
  'appeal decision',
  'request correction',
  'view case status',
  'download case history',
]

export const MODERATION_TRUST_CONTROLS = [
  'decisions require reasons',
  'reviewer actions are audited',
  'appeals are available for material restrictions',
  'AI may assist triage but not decide',
  'private reports stay confidential by default',
  'moderation metrics track outcomes and harms',
  'policy changes are versioned',
]

export function moderationTrustSafetyContractSummary() {
  return {
    caseTypes: MODERATION_CASE_TYPES.map((type) => ({
      key: type.key,
      label: type.label,
      purpose: type.purpose,
    })),
    requiredFields: [...MODERATION_REQUIRED_FIELDS],
    statusStates: [...MODERATION_STATUS_STATES],
    actionTypes: [...MODERATION_ACTION_TYPES],
    userControls: [...MODERATION_USER_CONTROLS],
    trustControls: [...MODERATION_TRUST_CONTROLS],
  }
}
