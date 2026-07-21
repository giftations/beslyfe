import { getDatabase } from '@netlify/database'
import { ensureProfileForAccount, json, newId, requireSameOrigin, requireSession } from './lib/session.mjs'
import { ACTION_OUTCOME_KEYS, executeInternalAction } from '../../platform/automation/action-plan.mjs'
import { actionEventRow, actionPlanRow, actionTaskRow, ensureActionPlan, outcomeRow, writeActionEvent } from './lib/action-plans.mjs'

const METRICS = new Set(ACTION_OUTCOME_KEYS)
const REFRESHABLE_ACTIONS = new Set(['measure-results', 'choose-next-step'])

function str(value, max = 600) { return String(value == null ? '' : value).trim().slice(0, max) }
function parseJson(value, fallback) { if (value && typeof value === 'object') return value; if (typeof value !== 'string') return fallback; try { return JSON.parse(value) } catch { return fallback } }
function projectRow(row) { return { id:row.id, slug:row.slug, name:row.name, description:row.description||'', productType:row.product_type||'custom', primaryOutcome:row.primary_outcome||'community-growth', status:row.status||'draft', capabilities:parseJson(row.capabilities,[]), answers:parseJson(row.answers,{}), settings:parseJson(row.settings,{}) } }

async function managedProject(db, ecosystemId, profileId) {
  const rows = await db.sql`
    SELECT e.*
    FROM ecosystems e
    LEFT JOIN ecosystem_memberships m
      ON m.ecosystem_id = e.id AND m.profile_id = ${profileId} AND m.status = 'active'
    WHERE e.id = ${ecosystemId}
      AND (e.owner_profile_id = ${profileId} OR m.role IN ('owner', 'admin'))
    LIMIT 1
  `
  return rows[0] || null
}

async function workspace(db, ecosystem, profileId) {
  const planRows = await db.sql`SELECT * FROM ecosystem_action_plans WHERE ecosystem_id = ${ecosystem.id} AND owner_profile_id = ${profileId} LIMIT 1`
  if (!planRows.length) return { project:projectRow(ecosystem), plan:null, tasks:[], outcomes:[], events:[] }
  const plan = planRows[0]
  const [tasks, outcomes, events] = await Promise.all([
    db.sql`SELECT * FROM ecosystem_action_tasks WHERE plan_id = ${plan.id} ORDER BY sequence ASC`,
    db.sql`SELECT * FROM ecosystem_outcomes WHERE ecosystem_id = ${ecosystem.id} AND owner_profile_id = ${profileId} ORDER BY created_at DESC LIMIT 250`,
    db.sql`SELECT * FROM ecosystem_action_events WHERE plan_id = ${plan.id} ORDER BY created_at DESC LIMIT 100`,
  ])
  return { project:projectRow(ecosystem), plan:actionPlanRow(plan), tasks:tasks.map(actionTaskRow), outcomes:outcomes.map(outcomeRow), events:events.map(actionEventRow) }
}

async function taskContext(db, taskId, ecosystemId) {
  const tasks = await db.sql`SELECT * FROM ecosystem_action_tasks WHERE id = ${taskId} AND ecosystem_id = ${ecosystemId} LIMIT 1`
  if (!tasks.length) return null
  const plans = await db.sql`SELECT * FROM ecosystem_action_plans WHERE id = ${tasks[0].plan_id} LIMIT 1`
  return plans.length ? { task:tasks[0], plan:plans[0] } : null
}

async function dependencyReady(db, task) {
  if (!task.depends_on_task_id) return { ready:true }
  const rows = await db.sql`SELECT day_number, status FROM ecosystem_action_tasks WHERE id = ${task.depends_on_task_id} LIMIT 1`
  if (!rows.length || ['completed','dismissed'].includes(rows[0].status)) return { ready:true }
  return { ready:false, dayNumber:Number(rows[0].day_number)||Math.max(1,(Number(task.day_number)||1)-1) }
}

async function finishPlanIfDone(db, planId) {
  const rows = await db.sql`SELECT COUNT(*)::int AS n FROM ecosystem_action_tasks WHERE plan_id = ${planId} AND status NOT IN ('completed','dismissed')`
  if ((rows[0]?.n || 0) === 0) await db.sql`UPDATE ecosystem_action_plans SET status = 'completed', updated_at = ${new Date().toISOString()} WHERE id = ${planId}`
}

async function runTask(db, { context, ecosystem, profileId }) {
  const task = context.task
  const plan = context.plan
  if (plan.status === 'paused') return json({ error:'This action plan is paused. Resume it before running a bot.' }, 409)
  if (plan.status === 'archived') return json({ error:'This action plan is archived.' }, 409)
  if (task.status === 'completed') return json({ ok:true, item:actionTaskRow(task), idempotent:true })
  const dependency = await dependencyReady(db, task)
  if (!dependency.ready) return json({ error:`Complete or dismiss Day ${dependency.dayNumber} first.` }, 409)

  const now = new Date()
  const nowIso = now.toISOString()
  let expectedStatus = 'queued'
  if (task.requires_approval) {
    expectedStatus = 'approved'
    const expiresAt = task.approval_expires_at ? new Date(task.approval_expires_at) : null
    if (task.status !== 'approved' || !expiresAt || expiresAt <= now) {
      if (task.status === 'approved') {
        await db.sql`UPDATE ecosystem_action_tasks SET status = 'awaiting_approval', approved_at = NULL, approval_expires_at = NULL, updated_at = ${nowIso} WHERE id = ${task.id}`
        await writeActionEvent(db, { taskId:task.id, planId:plan.id, ecosystemId:ecosystem.id, actorProfileId:profileId, eventType:'approval_expired', fromStatus:'approved', toStatus:'awaiting_approval' })
      }
      return json({ error:'Approval expired or is missing. Review the exact target and content again.' }, 409)
    }
  } else if (task.status !== 'queued') {
    return json({ error:'This bot task is not ready to run.' }, 409)
  }

  const locked = await db.sql`
    UPDATE ecosystem_action_tasks
    SET status = 'running', started_at = ${nowIso}, failure_reason = '', updated_at = ${nowIso}
    WHERE id = ${task.id} AND status = ${expectedStatus}
    RETURNING *
  `
  if (!locked.length) return json({ error:'Another run already changed this task. Refresh the workspace.' }, 409)
  await writeActionEvent(db, { taskId:task.id, planId:plan.id, ecosystemId:ecosystem.id, actorProfileId:profileId, eventType:'run_started', fromStatus:expectedStatus, toStatus:'running', details:{ actionKey:task.action_key, mode:task.mode } })

  try {
    let result
    let evidence
    if (task.mode === 'internal') {
      const outcomes = await db.sql`SELECT metric_key, value, note, created_at FROM ecosystem_outcomes WHERE ecosystem_id = ${ecosystem.id} AND owner_profile_id = ${profileId} ORDER BY created_at ASC`
      result = executeInternalAction(task.action_key, projectRow(ecosystem), outcomes)
      evidence = [...parseJson(task.evidence, []), { kind:'bot_output', summary:'Generated from member-owned project answers and recorded outcomes.', createdAt:nowIso }]
    } else if (task.action_key === 'community-share') {
      const preview = parseJson(task.approval_preview, {})
      const content = str(preview.content, 5000)
      if (!content) throw new Error('The approved post preview is empty.')
      const postId = newId('post_')
      await db.sql`
        INSERT INTO social_posts (
          id, ecosystem_id, author_id, body, image_url, video_url, post_type,
          filter, music, visibility, location, source_task_id, created_at
        ) VALUES (
          ${postId}, ${ecosystem.id}, ${profileId}, ${content}, '', '', 'post',
          '', '', 'public', '{}'::jsonb, ${task.id}, ${nowIso}
        ) ON CONFLICT DO NOTHING
      `
      const posts = await db.sql`SELECT id FROM social_posts WHERE source_task_id = ${task.id} LIMIT 1`
      if (!posts.length) throw new Error('The community post could not be verified.')
      result = { summary:'The approved community request was published once.', artifacts:{ postId:posts[0].id, destination:'/feed', target:preview.target||'Beslyfe shared community feed' } }
      evidence = [...parseJson(task.evidence, []), { kind:'published_post', summary:'Published after exact-target preview and time-limited approval.', referenceId:posts[0].id, url:'/feed', createdAt:nowIso }]
    } else {
      throw new Error('This external action is not allowlisted.')
    }

    const completedAt = new Date().toISOString()
    const completed = await db.sql`
      UPDATE ecosystem_action_tasks
      SET status = 'completed', result = ${JSON.stringify(result)}::jsonb,
          evidence = ${JSON.stringify(evidence)}::jsonb, completed_at = ${completedAt}, updated_at = ${completedAt}
      WHERE id = ${task.id} AND status = 'running'
      RETURNING *
    `
    await writeActionEvent(db, { taskId:task.id, planId:plan.id, ecosystemId:ecosystem.id, actorProfileId:profileId, eventType:'run_completed', fromStatus:'running', toStatus:'completed', details:{ actionKey:task.action_key, mode:task.mode, evidenceCount:evidence.length } })
    await finishPlanIfDone(db, plan.id)
    return json({ ok:true, item:actionTaskRow(completed[0]), result })
  } catch (error) {
    const failedAt = new Date().toISOString()
    const safeReason = task.mode === 'internal' ? 'The bot could not finish this draft safely.' : 'The approved external action could not be verified.'
    await db.sql`UPDATE ecosystem_action_tasks SET status = 'failed', failure_reason = ${safeReason}, updated_at = ${failedAt} WHERE id = ${task.id} AND status = 'running'`
    await writeActionEvent(db, { taskId:task.id, planId:plan.id, ecosystemId:ecosystem.id, actorProfileId:profileId, eventType:'run_failed', fromStatus:'running', toStatus:'failed', details:{ actionKey:task.action_key, safeReason } })
    console.error(JSON.stringify({ event:'ecosystem_action_failed', taskId:task.id, actionKey:task.action_key, message:String(error?.message||'unknown').slice(0,300) }))
    return json({ error:safeReason }, 500)
  }
}

export default async (req) => {
  const db = getDatabase()
  const url = new URL(req.url)
  const session = await requireSession(req, db)
  if (session instanceof Response) return session
  const profileId = await ensureProfileForAccount(db, session)
  const ecosystemId = str(req.method === 'GET' ? url.searchParams.get('ecosystemId') : '', 100)

  if (req.method === 'GET') {
    if (!ecosystemId) return json({ error:'Choose a project workspace.' }, 400)
    const ecosystem = await managedProject(db, ecosystemId, profileId)
    if (!ecosystem) return json({ error:'You do not have permission to manage this project.' }, 403)
    return json(await workspace(db, ecosystem, profileId))
  }

  if (req.method !== 'POST') return json({ error:'Method Not Allowed' }, 405)
  const cross = requireSameOrigin(req)
  if (cross) return cross
  let body
  try { body = await req.json() } catch { return json({ error:'Invalid JSON' }, 400) }
  if (!body || typeof body !== 'object') return json({ error:'Expected a JSON object' }, 400)
  const action = str(body.action, 60)
  const targetEcosystemId = str(body.ecosystemId, 100)
  const ecosystem = await managedProject(db, targetEcosystemId, profileId)
  if (!ecosystem) return json({ error:'You do not have permission to manage this project.' }, 403)

  if (action === 'ensure-plan') {
    const ensured = await ensureActionPlan(db, projectRow(ecosystem), profileId)
    return json({ ok:true, ...ensured })
  }

  if (action === 'pause-plan' || action === 'resume-plan') {
    const nextStatus = action === 'pause-plan' ? 'paused' : 'active'
    const plans = await db.sql`UPDATE ecosystem_action_plans SET status = ${nextStatus}, updated_at = ${new Date().toISOString()} WHERE ecosystem_id = ${ecosystem.id} AND owner_profile_id = ${profileId} RETURNING *`
    if (!plans.length) return json({ error:'Create the action plan first.' }, 404)
    await writeActionEvent(db, { planId:plans[0].id, ecosystemId:ecosystem.id, actorProfileId:profileId, eventType:action, fromStatus:action==='pause-plan'?'active':'paused', toStatus:nextStatus })
    return json({ ok:true, plan:actionPlanRow(plans[0]) })
  }

  if (action === 'record-outcome') {
    const metricKey = str(body.metricKey, 60)
    if (!METRICS.has(metricKey)) return json({ error:'Choose a supported outcome.' }, 400)
    const value = Math.round(Number(body.value))
    if (!Number.isFinite(value) || value < 1 || value > 100000000) return json({ error:'Enter an outcome value greater than zero.' }, 400)
    const note = str(body.note, 800)
    const id = newId('outcome_')
    const now = new Date().toISOString()
    await db.sql`INSERT INTO ecosystem_outcomes (id, ecosystem_id, owner_profile_id, metric_key, value, note, source, created_at) VALUES (${id}, ${ecosystem.id}, ${profileId}, ${metricKey}, ${value}, ${note}, 'member', ${now})`
    const rows = await db.sql`SELECT * FROM ecosystem_outcomes WHERE id = ${id} LIMIT 1`
    return json({ ok:true, item:outcomeRow(rows[0]) }, 201)
  }

  const taskId = str(body.taskId, 120)
  const context = await taskContext(db, taskId, ecosystem.id)
  if (!context || context.task.owner_profile_id !== profileId) return json({ error:'That task is not part of this workspace.' }, 404)
  const task = context.task

  if (action === 'approve-task') {
    if (!task.requires_approval || task.status !== 'awaiting_approval') return json({ error:'This task is not waiting for approval.' }, 409)
    const dependency = await dependencyReady(db, task)
    if (!dependency.ready) return json({ error:`Complete or dismiss Day ${dependency.dayNumber} before approving this action.` }, 409)
    const preview = parseJson(task.approval_preview,{})
    if (body.confirmed !== true || str(body.target,300) !== str(preview.target,300) || str(body.content,5000) !== str(preview.content,5000)) return json({ error:'Review and confirm the exact target and content shown in the workspace.' }, 400)
    const approvedAt = new Date()
    const expiresAt = new Date(approvedAt.getTime()+15*60*1000)
    const rows = await db.sql`UPDATE ecosystem_action_tasks SET status = 'approved', approved_at = ${approvedAt.toISOString()}, approval_expires_at = ${expiresAt.toISOString()}, updated_at = ${approvedAt.toISOString()} WHERE id = ${task.id} AND status = 'awaiting_approval' RETURNING *`
    if (!rows.length) return json({ error:'The task changed before approval. Refresh the workspace.' }, 409)
    await writeActionEvent(db, { taskId:task.id, planId:context.plan.id, ecosystemId:ecosystem.id, actorProfileId:profileId, eventType:'approved', fromStatus:'awaiting_approval', toStatus:'approved', details:{ target:preview.target, expiresAt:expiresAt.toISOString() } })
    return json({ ok:true, item:actionTaskRow(rows[0]) })
  }

  if (action === 'run-task') return runTask(db, { context, ecosystem, profileId })

  if (action === 'dismiss-task') {
    if (['running','completed','dismissed'].includes(task.status)) return json({ error:'This task cannot be dismissed in its current state.' }, 409)
    const now = new Date().toISOString()
    const rows = await db.sql`UPDATE ecosystem_action_tasks SET status = 'dismissed', approved_at = NULL, approval_expires_at = NULL, updated_at = ${now} WHERE id = ${task.id} AND status = ${task.status} RETURNING *`
    await writeActionEvent(db, { taskId:task.id, planId:context.plan.id, ecosystemId:ecosystem.id, actorProfileId:profileId, eventType:'dismissed', fromStatus:task.status, toStatus:'dismissed' })
    await finishPlanIfDone(db, context.plan.id)
    return json({ ok:true, item:actionTaskRow(rows[0]) })
  }

  if (action === 'retry-task') {
    if (!['failed','blocked'].includes(task.status)) return json({ error:'Only a failed or blocked task can be retried.' }, 409)
    const nextStatus = task.requires_approval ? 'awaiting_approval' : 'queued'
    const now = new Date().toISOString()
    const rows = await db.sql`UPDATE ecosystem_action_tasks SET status = ${nextStatus}, failure_reason = '', approved_at = NULL, approval_expires_at = NULL, updated_at = ${now} WHERE id = ${task.id} AND status = ${task.status} RETURNING *`
    await writeActionEvent(db, { taskId:task.id, planId:context.plan.id, ecosystemId:ecosystem.id, actorProfileId:profileId, eventType:'retry_queued', fromStatus:task.status, toStatus:nextStatus })
    return json({ ok:true, item:actionTaskRow(rows[0]) })
  }

  if (action === 'refresh-task') {
    if (!REFRESHABLE_ACTIONS.has(task.action_key) || task.status !== 'completed') return json({ error:'Only a completed measurement or next-step task can be refreshed.' }, 409)
    const now = new Date().toISOString()
    const rows = await db.sql`UPDATE ecosystem_action_tasks SET status = 'queued', result = '{}'::jsonb, failure_reason = '', completed_at = NULL, updated_at = ${now} WHERE id = ${task.id} AND status = 'completed' RETURNING *`
    await db.sql`UPDATE ecosystem_action_plans SET status = 'active', updated_at = ${now} WHERE id = ${context.plan.id}`
    await writeActionEvent(db, { taskId:task.id, planId:context.plan.id, ecosystemId:ecosystem.id, actorProfileId:profileId, eventType:'refresh_queued', fromStatus:'completed', toStatus:'queued' })
    return json({ ok:true, item:actionTaskRow(rows[0]) })
  }

  return json({ error:'Unknown action' }, 400)
}
