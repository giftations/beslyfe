// platform/lifecycle/import-contract.mjs - reusable import governance.
//
// Imports create opportunity only when the data is trusted, consent-aware, and
// reversible. This contract keeps future sponsor, vendor, attendee, ticketing,
// CRM, media, and directory imports from becoming one-off ingestion paths.

export const IMPORT_RECORD_TYPES = [
  {
    key: 'import-source',
    label: 'Import Source',
    purpose: 'Names the provider, file, operator, ecosystem, consent basis, and expected record families.',
  },
  {
    key: 'import-batch',
    label: 'Import Batch',
    purpose: 'Tracks a single import run, validation results, created records, skipped rows, and rollback evidence.',
  },
  {
    key: 'field-mapping',
    label: 'Field Mapping',
    purpose: 'Maps source columns or provider fields into canonical Beslyfe platform fields.',
  },
  {
    key: 'import-validation',
    label: 'Import Validation',
    purpose: 'Captures schema checks, duplicate checks, consent checks, and rejected-row reasons.',
  },
  {
    key: 'import-rollback',
    label: 'Import Rollback',
    purpose: 'Records how imported records can be reversed, archived, or corrected without data loss.',
  },
]

export const IMPORT_SOURCE_TYPES = [
  'csv',
  'json',
  'eventbrite',
  'admin-upload',
  'crm-import',
  'ticketing-provider',
  'email-provider',
  'directory-seed',
  'manual-entry',
  'other',
]

export const IMPORT_TARGETS = [
  'people',
  'organizations',
  'crm-people',
  'crm-companies',
  'applications',
  'profiles',
  'tickets',
  'orders',
  'media',
  'directory-listings',
  'ads',
  'sponsorships',
  'events',
]

export const IMPORT_STATUS_STATES = [
  'draft',
  'validating',
  'ready',
  'running',
  'completed',
  'completed-with-errors',
  'failed',
  'rolled-back',
  'archived',
]

export const REQUIRED_IMPORT_FIELDS = [
  'id',
  'ecosystemId',
  'sourceType',
  'sourceReference',
  'target',
  'fieldMapping',
  'status',
  'actorAccountId',
  'consentBasis',
  'validationSummary',
  'rollbackPlan',
  'createdAt',
  'updatedAt',
]

export const IMPORT_GOVERNANCE_CONTROLS = [
  'dry run before write',
  'duplicate detection',
  'explicit consent basis',
  'field mapping is reviewed',
  'source secrets are never stored',
  'rejected rows explain why',
  'rollback plan required before run',
  'audit log entry per batch',
  'import failures do not block existing workflows',
]

export function importRecordTypeKeys() {
  return IMPORT_RECORD_TYPES.map((type) => type.key)
}

export function importContractSummary() {
  return {
    recordTypes: IMPORT_RECORD_TYPES.map((type) => ({
      key: type.key,
      purpose: type.purpose,
    })),
    sourceTypes: [...IMPORT_SOURCE_TYPES],
    targets: [...IMPORT_TARGETS],
    statusStates: [...IMPORT_STATUS_STATES],
    requiredFields: [...REQUIRED_IMPORT_FIELDS],
    governanceControls: [...IMPORT_GOVERNANCE_CONTROLS],
  }
}
