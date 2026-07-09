// platform/data/portability-contract.mjs - user data export and portability.
//
// This contract names the shared export rules before runtime implementation
// expands. Data portability should increase trust without exposing private
// content, secrets, or cross-ecosystem records outside an explicit scope.

export const DATA_PORTABILITY_RECORD_TYPES = [
  {
    key: 'export-request',
    label: 'Export Request',
    purpose: 'Tracks who requested a portable data export, the subject, scope, format, status, and expiry.',
  },
  {
    key: 'export-package',
    label: 'Export Package',
    purpose: 'Represents a generated portable artifact with manifest, checksum, expiry, and download state.',
  },
  {
    key: 'redaction-rule',
    label: 'Redaction Rule',
    purpose: 'Defines fields and relationships that must be removed or masked before export delivery.',
  },
  {
    key: 'retention-policy',
    label: 'Retention Policy',
    purpose: 'Controls how long generated packages and request evidence remain available.',
  },
  {
    key: 'consent-scope',
    label: 'Consent Scope',
    purpose: 'Verifies user, organization, ecosystem, and participant boundaries before data leaves the system.',
  },
]

export const DATA_EXPORT_SCOPES = [
  'profile',
  'account',
  'applications',
  'crm',
  'community-posts',
  'messages',
  'media',
  'ticketing',
  'advertising',
  'audit-log',
  'analytics',
  'site-content',
]

export const DATA_EXPORT_FORMATS = ['json', 'csv', 'zip']

export const DATA_EXPORT_STATUS_STATES = [
  'requested',
  'processing',
  'ready',
  'downloaded',
  'expired',
  'failed',
  'canceled',
]

export const REQUIRED_DATA_PORTABILITY_FIELDS = [
  'id',
  'ecosystemId',
  'requesterAccountId',
  'subjectType',
  'subjectId',
  'scope',
  'format',
  'status',
  'reason',
  'expiresAt',
  'createdAt',
  'updatedAt',
]

export const DATA_PORTABILITY_TRUST_CONTROLS = [
  'exports require authenticated requester',
  'scope is explicit',
  'secrets are redacted',
  'private messages require participant boundary',
  'audit exports are admin-only',
  'generated packages expire',
  'AI personalization data is portable or resettable',
  'export logs avoid raw private content',
]

export function dataPortabilityRecordTypeKeys() {
  return DATA_PORTABILITY_RECORD_TYPES.map((recordType) => recordType.key)
}

export function dataPortabilityContractSummary() {
  return {
    recordTypes: DATA_PORTABILITY_RECORD_TYPES.map((recordType) => ({
      key: recordType.key,
      purpose: recordType.purpose,
    })),
    exportScopes: [...DATA_EXPORT_SCOPES],
    exportFormats: [...DATA_EXPORT_FORMATS],
    statusStates: [...DATA_EXPORT_STATUS_STATES],
    requiredFields: [...REQUIRED_DATA_PORTABILITY_FIELDS],
    trustControls: [...DATA_PORTABILITY_TRUST_CONTROLS],
  }
}
