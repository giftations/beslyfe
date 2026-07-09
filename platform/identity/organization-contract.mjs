// platform/identity/organization-contract.mjs - reusable organization identity contract.
//
// An organization is more than a listing. It can be a business, nonprofit,
// venue, sponsor, vendor, employer, organizer, agency, school, or informal
// team. The platform contract keeps organization identity configurable while
// preserving ownership, verification, membership, and trust boundaries.

export const ORGANIZATION_IDENTITY_RECORDS = [
  {
    key: 'organization-profile',
    label: 'Organization Profile',
    purpose: 'Defines the public and private identity of a business, group, venue, or institution.',
  },
  {
    key: 'ownership',
    label: 'Ownership',
    purpose: 'Records who can claim, administer, transfer, and approve changes to the organization.',
  },
  {
    key: 'membership',
    label: 'Membership',
    purpose: 'Connects people to organizations through roles, permissions, employment, volunteering, or affiliation.',
  },
  {
    key: 'verification',
    label: 'Verification',
    purpose: 'Tracks evidence, review state, and trust level before the organization receives elevated capabilities.',
  },
  {
    key: 'offering',
    label: 'Offering',
    purpose: 'Describes products, services, programs, sponsorships, jobs, benefits, or resources the organization provides.',
  },
  {
    key: 'location',
    label: 'Location',
    purpose: 'Supports places, service areas, booth locations, event footprints, maps, and local discovery.',
  },
]

export const ORGANIZATION_REQUIRED_FIELDS = [
  'id',
  'displayName',
  'organizationType',
  'ecosystemIds',
  'ownerPersonIds',
  'memberPersonIds',
  'visibility',
  'verificationState',
  'relationshipIds',
  'offeringIds',
  'dataControls',
  'auditTrail',
  'createdAt',
  'updatedAt',
]

export const ORGANIZATION_TYPES = [
  'business',
  'nonprofit',
  'venue',
  'sponsor',
  'vendor',
  'employer',
  'organizer',
  'education',
  'government',
  'community-group',
]

export const ORGANIZATION_VERIFICATION_STATES = [
  'unclaimed',
  'claimed',
  'pending-review',
  'verified',
  'restricted',
  'archived',
]

export const ORGANIZATION_MEMBER_CONTROLS = [
  'invite member',
  'approve member',
  'change role',
  'remove member',
  'transfer ownership',
  'require approval for public changes',
]

export const ORGANIZATION_TRUST_CONTROLS = [
  'claiming is auditable',
  'public changes are reviewable',
  'owner transfer requires confirmation',
  'verification evidence is private by default',
  'AI recommendations disclose organization influence',
  'sponsored visibility is labeled',
]

export function organizationIdentityContractSummary() {
  return {
    identityRecords: ORGANIZATION_IDENTITY_RECORDS.map((record) => ({
      key: record.key,
      label: record.label,
      purpose: record.purpose,
    })),
    organizationTypes: [...ORGANIZATION_TYPES],
    requiredFields: [...ORGANIZATION_REQUIRED_FIELDS],
    verificationStates: [...ORGANIZATION_VERIFICATION_STATES],
    memberControls: [...ORGANIZATION_MEMBER_CONTROLS],
    trustControls: [...ORGANIZATION_TRUST_CONTROLS],
  }
}
