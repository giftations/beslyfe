// platform/identity/person-contract.mjs - reusable person identity contract.
//
// A person is not a profile row or an account row. A person is a human identity
// with goals, roles, consent, relationships, data rights, and opportunity
// history. Runtime systems may store pieces of that identity in multiple tables,
// but the platform contract must preserve user autonomy.

export const PERSON_IDENTITY_RECORDS = [
  {
    key: 'account',
    label: 'Account',
    purpose: 'Authenticates the person and protects access to private controls.',
  },
  {
    key: 'profile',
    label: 'Profile',
    purpose: 'Lets the person decide how they appear in directories and discovery.',
  },
  {
    key: 'crm-person',
    label: 'CRM Person',
    purpose: 'Lets operators track relationship context without replacing user-owned identity.',
  },
  {
    key: 'role',
    label: 'Role',
    purpose: 'Describes how the person participates in an ecosystem or organization.',
  },
  {
    key: 'preference',
    label: 'Preference',
    purpose: 'Captures communication, personalization, visibility, and discovery choices.',
  },
  {
    key: 'consent',
    label: 'Consent',
    purpose: 'Records what the person allowed the platform to use and why.',
  },
]

export const PERSON_REQUIRED_FIELDS = [
  'id',
  'displayName',
  'ecosystemIds',
  'accountIds',
  'profileIds',
  'roles',
  'visibility',
  'consentPurposes',
  'dataControls',
  'relationshipIds',
  'opportunityHistory',
  'createdAt',
  'updatedAt',
]

export const PERSON_DATA_CONTROLS = [
  'edit profile',
  'hide profile fields',
  'export data',
  'request correction',
  'request deletion',
  'reset personalization',
  'disable personalization',
  'revoke consent',
]

export const PERSON_TRUST_CONTROLS = [
  'user-owned identity',
  'admin changes are audited',
  'operator notes stay operational',
  'public visibility is explicit',
  'AI use follows consent purposes',
  'cross-ecosystem learning is opt-in',
]

export function personIdentityContractSummary() {
  return {
    identityRecords: PERSON_IDENTITY_RECORDS.map((record) => ({
      key: record.key,
      label: record.label,
      purpose: record.purpose,
    })),
    requiredFields: [...PERSON_REQUIRED_FIELDS],
    dataControls: [...PERSON_DATA_CONTROLS],
    trustControls: [...PERSON_TRUST_CONTROLS],
  }
}
