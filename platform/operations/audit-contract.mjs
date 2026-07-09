// platform/operations/audit-contract.mjs - reusable operations and audit contract.
//
// Operations keep an ecosystem trustworthy when real people depend on it. The
// contract supports audit logs, admin actions, exports, incidents, readiness
// checks, rollback records, and operational evidence without exposing secrets or
// private data beyond its purpose.

export const OPERATIONS_RECORD_TYPES = [
  {
    key: 'audit-event',
    label: 'Audit Event',
    purpose: 'Records who changed what, when, why, and from which operational context.',
  },
  {
    key: 'data-export',
    label: 'Data Export',
    purpose: 'Tracks operational exports, requested scopes, delivery status, and privacy boundaries.',
  },
  {
    key: 'incident',
    label: 'Incident',
    purpose: 'Documents live issues, customer impact, timeline, mitigation, and follow-up fixes.',
  },
  {
    key: 'readiness-check',
    label: 'Readiness Check',
    purpose: 'Captures launch, deploy, DNS, email, database, mobile, and rollback verification evidence.',
  },
  {
    key: 'rollback-record',
    label: 'Rollback Record',
    purpose: 'Documents restored deploys, reason, affected systems, validation steps, and outcome.',
  },
]

export const OPERATIONS_REQUIRED_FIELDS = [
  'id',
  'recordType',
  'ecosystemId',
  'actorPersonId',
  'actorRole',
  'action',
  'resourceType',
  'resourceId',
  'reason',
  'status',
  'evidence',
  'requestId',
  'ipHash',
  'metadata',
  'createdAt',
  'updatedAt',
]

export const OPERATIONS_STATUS_STATES = [
  'planned',
  'in-progress',
  'completed',
  'failed',
  'rolled-back',
  'needs-review',
  'archived',
]

export const OPERATIONS_EXPORT_SCOPES = [
  'applications',
  'profiles',
  'accounts',
  'crm',
  'tickets',
  'marketplace',
  'audit-log',
  'analytics',
]

export const OPERATIONS_OPERATOR_CONTROLS = [
  'record reason',
  'export audit log',
  'redact sensitive metadata',
  'attach evidence',
  'mark rollback complete',
  'assign incident owner',
  'archive operational record',
]

export const OPERATIONS_TRUST_CONTROLS = [
  'secrets are never logged',
  'private data is minimized in exports',
  'admin actions require actor context',
  'rollback validation is recorded',
  'incident timeline is preserved',
  'export scope is explicit',
  'audit records are append-only by default',
]

export function operationsAuditContractSummary() {
  return {
    recordTypes: OPERATIONS_RECORD_TYPES.map((type) => ({
      key: type.key,
      label: type.label,
      purpose: type.purpose,
    })),
    requiredFields: [...OPERATIONS_REQUIRED_FIELDS],
    statusStates: [...OPERATIONS_STATUS_STATES],
    exportScopes: [...OPERATIONS_EXPORT_SCOPES],
    operatorControls: [...OPERATIONS_OPERATOR_CONTROLS],
    trustControls: [...OPERATIONS_TRUST_CONTROLS],
  }
}
