export const AUTOMATION_MODES = Object.freeze(['internal', 'external', 'hybrid'])
export const AUTOMATION_STATUSES = Object.freeze(['queued', 'awaiting_approval', 'approved', 'running', 'completed', 'failed', 'dismissed'])
export const automationExecutionContract = Object.freeze({
  id: 'automation_execution',
  purpose: 'Complete repeatable ecosystem work while preserving consent, accountability, and user control.',
  modes: {
    internal: { defaultApproval: 'auto', examples: ['create_task', 'sync_record', 'calculate_readiness', 'route_work'] },
    external: { defaultApproval: 'review', examples: ['send_email', 'publish_content', 'call_webhook'] },
    hybrid: { defaultApproval: 'review', examples: ['create_task_and_send_email', 'update_record_and_notify'] },
  },
  requiredControls: ['allowlisted_action', 'least_privilege', 'durable_run_ledger', 'expiring_lock', 'idempotency_key', 'bounded_retry', 'audit_record', 'pause_control', 'secret_redaction'],
  consequentialActions: ['approve_application', 'reject_application', 'charge_payment', 'publish_emergency_notice', 'public_social_post'],
  consequentialRule: 'Require a purpose-built workflow, explicit authority, target preview, and confirmation immediately before execution.',
})
export function automationMode(value) { return AUTOMATION_MODES.includes(value) ? value : 'internal' }
export function needsAutomationApproval(mode, consequential = false) { return consequential || automationMode(mode) !== 'internal' }
export function automationIdempotencyKey({ ecosystemId, workflowId, subjectId, window }) { return [ecosystemId, workflowId, subjectId, window].map((x) => String(x || '').trim()).join(':') }
