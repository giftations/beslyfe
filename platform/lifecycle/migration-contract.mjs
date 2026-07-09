// platform/lifecycle/migration-contract.mjs - reusable platform migration rules.
//
// Migrations should preserve trust across decades of ecosystems. This contract
// keeps database, content, settings, theme, CRM, and AI policy changes additive,
// observable, reversible, and tied to evidence.

export const MIGRATION_RECORD_TYPES = [
  {
    key: 'schema-migration',
    label: 'Schema Migration',
    purpose: 'Tracks additive database changes, compatibility notes, validation evidence, and rollback path.',
  },
  {
    key: 'data-migration',
    label: 'Data Migration',
    purpose: 'Tracks backfills, transforms, normalization steps, affected records, and sampling evidence.',
  },
  {
    key: 'configuration-migration',
    label: 'Configuration Migration',
    purpose: 'Tracks theme, ecosystem, module, feature flag, and operational setting changes.',
  },
  {
    key: 'policy-migration',
    label: 'Policy Migration',
    purpose: 'Tracks consent, privacy, AI, moderation, and access-control policy changes.',
  },
  {
    key: 'rollback-plan',
    label: 'Rollback Plan',
    purpose: 'Names the restore point, validation steps, communication path, and owner for reversing a change.',
  },
]

export const MIGRATION_CHANGE_TYPES = [
  'add-table',
  'add-column',
  'add-index',
  'backfill',
  'normalize-data',
  'rename-with-compatibility',
  'settings-update',
  'theme-update',
  'policy-update',
  'function-routing-update',
]

export const MIGRATION_STATUS_STATES = [
  'proposed',
  'approved',
  'scheduled',
  'running',
  'validated',
  'completed',
  'failed',
  'rolled-back',
  'deprecated',
]

export const REQUIRED_MIGRATION_FIELDS = [
  'id',
  'ecosystemId',
  'changeType',
  'ownerAccountId',
  'reason',
  'compatibilityNotes',
  'affectedRecords',
  'validationPlan',
  'rollbackPlan',
  'status',
  'startedAt',
  'completedAt',
  'createdAt',
  'updatedAt',
]

export const MIGRATION_SAFETY_CONTROLS = [
  'additive migrations first',
  'rollback path required',
  'compatibility window documented',
  'affected records estimated before run',
  'validation evidence captured',
  'private data is sampled only when necessary',
  'secrets are never included in migration evidence',
  'old operational values are preserved until migration completes',
]

export function migrationRecordTypeKeys() {
  return MIGRATION_RECORD_TYPES.map((type) => type.key)
}

export function migrationContractSummary() {
  return {
    recordTypes: MIGRATION_RECORD_TYPES.map((type) => ({
      key: type.key,
      purpose: type.purpose,
    })),
    changeTypes: [...MIGRATION_CHANGE_TYPES],
    statusStates: [...MIGRATION_STATUS_STATES],
    requiredFields: [...REQUIRED_MIGRATION_FIELDS],
    safetyControls: [...MIGRATION_SAFETY_CONTROLS],
  }
}
