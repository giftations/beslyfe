import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  IMPORT_GOVERNANCE_CONTROLS,
  IMPORT_RECORD_TYPES,
  IMPORT_STATUS_STATES,
  IMPORT_TARGETS,
  importContractSummary,
  importRecordTypeKeys,
} from '../platform/lifecycle/import-contract.mjs'
import {
  MIGRATION_CHANGE_TYPES,
  MIGRATION_RECORD_TYPES,
  MIGRATION_SAFETY_CONTROLS,
  MIGRATION_STATUS_STATES,
  migrationContractSummary,
  migrationRecordTypeKeys,
} from '../platform/lifecycle/migration-contract.mjs'
import {
  RELEASE_GATE_AREAS,
  RELEASE_GATE_RECORD_TYPES,
  RELEASE_TRUST_CONTROLS,
  releaseGateContractSummary,
  releaseGateRecordTypeKeys,
} from '../platform/lifecycle/release-gate-contract.mjs'

function assertUniqueStableKeys(keys) {
  assert.equal(new Set(keys).size, keys.length)
  for (const key of keys) {
    assert.match(key, /^[a-z][a-z0-9-]*$/)
  }
}

test('import governance record type keys are unique and purposeful', () => {
  assertUniqueStableKeys(importRecordTypeKeys())
  for (const recordType of IMPORT_RECORD_TYPES) {
    assert.equal(typeof recordType.purpose, 'string')
    assert.ok(recordType.purpose.length > 20)
  }
})

test('import governance supports ecosystem data targets and rollback safety', () => {
  for (const target of ['people', 'crm-people', 'tickets', 'media', 'directory-listings']) {
    assert.ok(IMPORT_TARGETS.includes(target))
  }
  assert.ok(IMPORT_STATUS_STATES.includes('completed-with-errors'))
  assert.ok(IMPORT_STATUS_STATES.includes('rolled-back'))
  assert.ok(IMPORT_GOVERNANCE_CONTROLS.includes('dry run before write'))
  assert.ok(IMPORT_GOVERNANCE_CONTROLS.includes('rollback plan required before run'))
  assert.ok(IMPORT_GOVERNANCE_CONTROLS.includes('source secrets are never stored'))
})

test('import governance summary is serializable and complete', () => {
  const summary = importContractSummary()
  assert.equal(summary.recordTypes.length, IMPORT_RECORD_TYPES.length)
  assert.equal(summary.targets.length, IMPORT_TARGETS.length)
  assert.doesNotThrow(() => JSON.stringify(summary))
})

test('migration governance record type keys are unique and purposeful', () => {
  assertUniqueStableKeys(migrationRecordTypeKeys())
  for (const recordType of MIGRATION_RECORD_TYPES) {
    assert.equal(typeof recordType.purpose, 'string')
    assert.ok(recordType.purpose.length > 20)
  }
})

test('migration governance requires additive, validated, reversible changes', () => {
  for (const changeType of ['add-table', 'add-column', 'backfill', 'rename-with-compatibility']) {
    assert.ok(MIGRATION_CHANGE_TYPES.includes(changeType))
  }
  assert.ok(MIGRATION_STATUS_STATES.includes('validated'))
  assert.ok(MIGRATION_STATUS_STATES.includes('rolled-back'))
  assert.ok(MIGRATION_SAFETY_CONTROLS.includes('additive migrations first'))
  assert.ok(MIGRATION_SAFETY_CONTROLS.includes('rollback path required'))
  assert.ok(MIGRATION_SAFETY_CONTROLS.includes('old operational values are preserved until migration completes'))
})

test('migration governance summary is serializable and complete', () => {
  const summary = migrationContractSummary()
  assert.equal(summary.recordTypes.length, MIGRATION_RECORD_TYPES.length)
  assert.equal(summary.changeTypes.length, MIGRATION_CHANGE_TYPES.length)
  assert.doesNotThrow(() => JSON.stringify(summary))
})

test('release gate record type keys are unique and purposeful', () => {
  assertUniqueStableKeys(releaseGateRecordTypeKeys())
  for (const recordType of RELEASE_GATE_RECORD_TYPES) {
    assert.equal(typeof recordType.purpose, 'string')
    assert.ok(recordType.purpose.length > 20)
  }
})

test('release gates cover production readiness and post-merge verification', () => {
  for (const area of ['dns', 'netlify-deploy', 'database', 'email', 'mobile-navigation', 'rollback']) {
    assert.ok(RELEASE_GATE_AREAS.includes(area))
  }
  assert.ok(RELEASE_TRUST_CONTROLS.includes('double test after merge'))
  assert.ok(RELEASE_TRUST_CONTROLS.includes('manual checks are explicit'))
  assert.ok(RELEASE_TRUST_CONTROLS.includes('secrets are not copied into evidence'))
  assert.ok(RELEASE_TRUST_CONTROLS.includes('release decision records owner and reason'))
})

test('release gate summary is serializable and complete', () => {
  const summary = releaseGateContractSummary()
  assert.equal(summary.recordTypes.length, RELEASE_GATE_RECORD_TYPES.length)
  assert.equal(summary.gateAreas.length, RELEASE_GATE_AREAS.length)
  assert.doesNotThrow(() => JSON.stringify(summary))
})
