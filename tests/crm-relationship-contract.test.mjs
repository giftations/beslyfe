import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  CRM_ACTIVITY_KINDS,
  CRM_AUTOMATION_EVENTS,
  CRM_LEAD_SOURCES,
  CRM_PIPELINE_STAGES,
  CRM_RECORD_TYPES,
  CRM_REQUIRED_FIELDS,
  CRM_TRUST_CONTROLS,
  crmRecordTypeKeys,
  crmRelationshipContractSummary,
} from '../platform/crm/relationship-contract.mjs'

test('CRM record types map to canonical CRM tables', () => {
  const tables = new Set(CRM_RECORD_TYPES.map((type) => type.table))
  for (const table of ['crm_people', 'crm_companies', 'crm_person_roles', 'crm_company_events', 'crm_activities']) {
    assert.ok(tables.has(table))
  }
})

test('CRM contract keys are unique and stable-looking', () => {
  const keys = crmRecordTypeKeys()
  assert.equal(new Set(keys).size, keys.length)
  for (const key of keys) assert.match(key, /^[a-z][a-z0-9-]*$/)
})

test('CRM pipeline contract includes configurable stages, sources, and activity kinds', () => {
  assert.ok(CRM_PIPELINE_STAGES.includes('application_submitted'))
  assert.ok(CRM_PIPELINE_STAGES.includes('follow_up_needed'))
  assert.ok(CRM_LEAD_SOURCES.includes('sponsor_application'))
  assert.ok(CRM_LEAD_SOURCES.includes('advertising'))
  assert.ok(CRM_ACTIVITY_KINDS.includes('task'))
  assert.ok(CRM_ACTIVITY_KINDS.includes('payment'))
})

test('CRM required fields preserve ownership, follow-up, value, and flexible details', () => {
  for (const field of ['ownerAccountId', 'followUpAt', 'lastContactedAt', 'lifetimeValueCents', 'details']) {
    assert.ok(CRM_REQUIRED_FIELDS.includes(field))
  }
})

test('CRM automation and trust controls protect relationship context', () => {
  assert.ok(CRM_AUTOMATION_EVENTS.includes('application.submitted'))
  assert.ok(CRM_AUTOMATION_EVENTS.includes('ticket.order_imported'))
  assert.ok(CRM_TRUST_CONTROLS.includes('admin mutations require same-origin checks'))
  assert.ok(CRM_TRUST_CONTROLS.includes('pipeline labels are configurable per ecosystem'))
  assert.ok(CRM_TRUST_CONTROLS.includes('AI follow-up suggestions require consent-compatible relationship data'))
})

test('CRM relationship contract summary is serializable and complete', () => {
  const summary = crmRelationshipContractSummary()
  assert.equal(summary.recordTypes.length, CRM_RECORD_TYPES.length)
  assert.equal(summary.pipelineStages.length, CRM_PIPELINE_STAGES.length)
  assert.equal(summary.activityKinds.length, CRM_ACTIVITY_KINDS.length)
  assert.doesNotThrow(() => JSON.stringify(summary))
})
