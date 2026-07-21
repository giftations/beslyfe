import test from 'node:test'
import assert from 'node:assert/strict'
import { AUTOMATION_MODES, AUTOMATION_STATUSES, automationExecutionContract, automationIdempotencyKey, automationMode, needsAutomationApproval } from '../platform/automation/execution-contract.mjs'
test('automation contract exposes internal, external and hybrid execution', () => {
  assert.deepEqual(AUTOMATION_MODES, ['internal','external','hybrid'])
  assert.equal(automationMode('unknown'), 'internal')
  assert.equal(needsAutomationApproval('internal'), false)
  assert.equal(needsAutomationApproval('external'), true)
  assert.equal(needsAutomationApproval('hybrid'), true)
  assert.equal(needsAutomationApproval('internal', true), true)
})
test('automation idempotency keys are stable and ecosystem scoped', () => {
  assert.equal(automationIdempotencyKey({ ecosystemId: 'sample', workflowId: 'followup', subjectId: 'person-1', window: '2026-07-17' }), 'sample:followup:person-1:2026-07-17')
  assert.ok(automationExecutionContract.requiredControls.includes('audit_record'))
  assert.ok(automationExecutionContract.requiredControls.includes('pause_control'))
  assert.ok(AUTOMATION_STATUSES.includes('blocked'))
  assert.match(automationExecutionContract.executionWorkspace.taskLedger, /durable/)
})
