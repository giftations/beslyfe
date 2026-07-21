import { newId } from './session.mjs'
import { buildSevenDayActionPlan, executeInternalAction } from '../../../platform/automation/action-plan.mjs'

function parseJson(value, fallback) {
  if (value && typeof value === 'object') return value
  if (typeof value !== 'string') return fallback
  try { return JSON.parse(value) } catch { return fallback }
}

function iso(value) {
  return value instanceof Date ? value.toISOString() : (value || null)
}

export function actionPlanRow(row) {
  if (!row) return null
  return { id:row.id, ecosystemId:row.ecosystem_id, ownerProfileId:row.owner_profile_id, version:Number(row.version)||1, status:row.status||'active', summary:parseJson(row.summary,{}), createdAt:iso(row.created_at), updatedAt:iso(row.updated_at) }
}

export function actionTaskRow(row) {
  if (!row) return null
  return {
    id:row.id, planId:row.plan_id, ecosystemId:row.ecosystem_id, ownerProfileId:row.owner_profile_id,
    dayNumber:Number(row.day_number)||1, sequence:Number(row.sequence)||1, actionKey:row.action_key||'', title:row.title||'', description:row.description||'',
    mode:row.mode||'internal', status:row.status||'queued', requiresApproval:Boolean(row.requires_approval), dependsOnTaskId:row.depends_on_task_id||'',
    input:parseJson(row.input,{}), approvalPreview:parseJson(row.approval_preview,{}), result:parseJson(row.result,{}), evidence:parseJson(row.evidence,[]), failureReason:row.failure_reason||'',
    approvedAt:iso(row.approved_at), approvalExpiresAt:iso(row.approval_expires_at), startedAt:iso(row.started_at), completedAt:iso(row.completed_at), createdAt:iso(row.created_at), updatedAt:iso(row.updated_at),
  }
}

export function outcomeRow(row) {
  if (!row) return null
  return { id:row.id, ecosystemId:row.ecosystem_id, ownerProfileId:row.owner_profile_id, metricKey:row.metric_key, value:Number(row.value)||0, note:row.note||'', source:row.source||'member', createdAt:iso(row.created_at) }
}

export function actionEventRow(row) {
  if (!row) return null
  return { id:row.id, taskId:row.task_id, planId:row.plan_id, ecosystemId:row.ecosystem_id, actorProfileId:row.actor_profile_id, eventType:row.event_type, fromStatus:row.from_status, toStatus:row.to_status, details:parseJson(row.details,{}), createdAt:iso(row.created_at) }
}

export async function writeActionEvent(db, { taskId, planId, ecosystemId, actorProfileId, eventType, fromStatus = '', toStatus = '', details = {} }) {
  const id = newId('action_event_')
  const now = new Date().toISOString()
  await db.sql`
    INSERT INTO ecosystem_action_events (
      id, task_id, plan_id, ecosystem_id, actor_profile_id,
      event_type, from_status, to_status, details, created_at
    ) VALUES (
      ${id}, ${taskId || ''}, ${planId || ''}, ${ecosystemId || ''}, ${actorProfileId || ''},
      ${eventType || ''}, ${fromStatus || ''}, ${toStatus || ''}, ${JSON.stringify(details)}::jsonb, ${now}
    )
  `
  return id
}

export async function ensureActionPlan(db, ecosystem, ownerProfileId) {
  const generated = buildSevenDayActionPlan(ecosystem)
  const now = new Date().toISOString()
  const candidateId = newId('plan_')
  const inserted = await db.sql`
    INSERT INTO ecosystem_action_plans (
      id, ecosystem_id, owner_profile_id, version, status, summary, created_at, updated_at
    ) VALUES (
      ${candidateId}, ${ecosystem.id}, ${ownerProfileId}, ${generated.version}, 'active',
      ${JSON.stringify(generated.summary)}::jsonb, ${now}, ${now}
    ) ON CONFLICT (ecosystem_id) DO NOTHING
    RETURNING *
  `
  const planRows = inserted.length ? inserted : await db.sql`SELECT * FROM ecosystem_action_plans WHERE ecosystem_id = ${ecosystem.id} LIMIT 1`
  const plan = planRows[0]
  let previousTaskId = ''
  for (const task of generated.tasks) {
    const existing = await db.sql`SELECT * FROM ecosystem_action_tasks WHERE plan_id = ${plan.id} AND day_number = ${task.day} LIMIT 1`
    if (existing.length) {
      previousTaskId = existing[0].id
      continue
    }
    const taskId = newId('task_')
    await db.sql`
      INSERT INTO ecosystem_action_tasks (
        id, plan_id, ecosystem_id, owner_profile_id, day_number, sequence,
        action_key, title, description, mode, status, requires_approval,
        depends_on_task_id, input, approval_preview, created_at, updated_at
      ) VALUES (
        ${taskId}, ${plan.id}, ${ecosystem.id}, ${ownerProfileId}, ${task.day}, ${task.sequence},
        ${task.actionKey}, ${task.title}, ${task.description}, ${task.mode}, ${task.status}, ${task.requiresApproval},
        ${previousTaskId}, ${JSON.stringify(task.input)}::jsonb, ${JSON.stringify(task.approvalPreview)}::jsonb, ${now}, ${now}
      ) ON CONFLICT (plan_id, day_number) DO NOTHING
    `
    await writeActionEvent(db, { taskId, planId:plan.id, ecosystemId:ecosystem.id, actorProfileId:ownerProfileId, eventType:'generated', toStatus:task.status, details:{ dayNumber:task.day, actionKey:task.actionKey, mode:task.mode } })
    const resolved = await db.sql`SELECT id FROM ecosystem_action_tasks WHERE plan_id = ${plan.id} AND day_number = ${task.day} LIMIT 1`
    previousTaskId = resolved[0]?.id || taskId
  }

  // The first internal task is safe and has no outside effect. Complete it as
  // part of plan creation so a new member receives useful work, not an empty queue.
  const firstRows = await db.sql`SELECT * FROM ecosystem_action_tasks WHERE plan_id = ${plan.id} AND day_number = 1 LIMIT 1`
  const first = firstRows[0]
  if (first && first.status === 'queued') {
    const result = executeInternalAction(first.action_key, ecosystem, [])
    const evidence = [{ kind:'generated_draft', summary:'Prepared from the member-owned builder answers.', createdAt:now }]
    const completed = await db.sql`
      UPDATE ecosystem_action_tasks
      SET status = 'completed', result = ${JSON.stringify(result)}::jsonb,
          evidence = ${JSON.stringify(evidence)}::jsonb, started_at = ${now}, completed_at = ${now}, updated_at = ${now}
      WHERE id = ${first.id} AND status = 'queued'
      RETURNING id
    `
    if (completed.length) await writeActionEvent(db, { taskId:first.id, planId:plan.id, ecosystemId:ecosystem.id, actorProfileId:ownerProfileId, eventType:'bot_completed', fromStatus:'queued', toStatus:'completed', details:{ actionKey:first.action_key, internal:true } })
  }

  const refreshedPlan = await db.sql`SELECT * FROM ecosystem_action_plans WHERE id = ${plan.id} LIMIT 1`
  const tasks = await db.sql`SELECT * FROM ecosystem_action_tasks WHERE plan_id = ${plan.id} ORDER BY sequence ASC`
  return { plan:actionPlanRow(refreshedPlan[0]), tasks:tasks.map(actionTaskRow) }
}
