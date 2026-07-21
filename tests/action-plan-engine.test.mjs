import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  ACTION_OUTCOME_KEYS,
  ACTION_TASK_STATUSES,
  buildCommunityPost,
  buildSevenDayActionPlan,
  executeInternalAction,
} from '../platform/automation/action-plan.mjs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const actionFunction = read('netlify/functions/ecosystem-actions.mjs')
const actionStorage = read('netlify/functions/lib/action-plans.mjs')
const migration = read('netlify/database/migrations/20260720210000_create_action_execution_workspace/migration.sql')
const workspace = read('workspace.html')
const workspaceLogic = read('assets/js/workspace.js')
const builderLogic = read('assets/js/create.js')
const hubLogic = read('hub.js')

const project = {
  id:'eco_test',
  name:'Neighborhood Repair Help',
  productType:'business',
  primaryOutcome:'qualified-leads',
  answers:{
    audience:'Neighbors who need a small household repair.',
    offer:'One clearly priced minor repair visit.',
    problemsUnderstood:'People do not know who to trust for small repairs.',
    resources:['phone','transportation','network'],
    hardLimits:'Weekends only.',
  },
}

test('a project becomes a seven-day dependency-ordered execution plan', () => {
  const plan = buildSevenDayActionPlan(project)
  assert.equal(plan.tasks.length, 7)
  assert.deepEqual(plan.tasks.map((task) => task.day), [1,2,3,4,5,6,7])
  assert.equal(plan.tasks[0].actionKey, 'define-test')
  assert.equal(plan.tasks[0].mode, 'internal')
  assert.equal(plan.tasks[0].requiresApproval, false)
  assert.equal(plan.tasks[4].actionKey, 'community-share')
  assert.equal(plan.tasks[4].mode, 'external')
  assert.equal(plan.tasks[4].status, 'awaiting_approval')
  assert.equal(plan.tasks[4].approvalPreview.target, 'Beslyfe shared community feed')
  assert.equal(plan.tasks[4].approvalPreview.expiresMinutes, 15)
})

test('safe bots produce useful drafts without claiming an external action happened', () => {
  const definition = executeInternalAction('define-test', project, [])
  assert.match(definition.summary, /drafted and ready to edit/)
  assert.match(definition.artifacts.hypothesis, /concrete question, request, booking, purchase/)
  const outreach = executeInternalAction('draft-outreach', project, [])
  assert.match(outreach.summary, /nothing was sent/)
  assert.ok(outreach.artifacts.rules.includes('Respect no response as no'))
  assert.match(buildCommunityPost(project), /I welcome honest feedback and collaborators/)
})

test('recorded outcomes, not engagement alone, drive the next iteration', () => {
  const outcomes = [
    { metricKey:'conversations', value:4 },
    { metricKey:'qualified_leads', value:1 },
    { metricKey:'sales_cents', value:2500 },
  ]
  const measurement = executeInternalAction('measure-results', project, outcomes)
  assert.equal(measurement.artifacts.conversations, 4)
  assert.equal(measurement.artifacts.salesCents, 2500)
  assert.match(measurement.summary, /measurable demand signal/)
  const next = executeInternalAction('choose-next-step', project, outcomes)
  assert.match(next.artifacts.decision, /Continue the smallest version/)
  assert.deepEqual(ACTION_OUTCOME_KEYS, ['conversations','qualified_leads','bookings','sales_cents','community_help','lessons'])
  assert.ok(ACTION_TASK_STATUSES.includes('blocked'))
})

test('execution storage is additive, durable, and idempotent', () => {
  for (const table of ['ecosystem_action_plans','ecosystem_action_tasks','ecosystem_action_events','ecosystem_outcomes']) assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS "${table}"`))
  assert.match(migration, /ecosystem_action_tasks_plan_day_idx/)
  assert.match(migration, /social_posts_source_task_idx/)
  assert.match(migration, /WHERE "source_task_id" <> ''/)
  assert.match(actionStorage, /ON CONFLICT \(ecosystem_id\) DO NOTHING/)
  assert.match(actionStorage, /The first internal task is safe and has no outside effect/)
  assert.match(actionStorage, /eventType:'bot_completed'/)
})

test('action mutations preserve ownership, same-origin, pause, dependency, and approval boundaries', () => {
  assert.match(actionFunction, /requireSession\(req, db\)/)
  assert.match(actionFunction, /requireSameOrigin\(req\)/)
  assert.match(actionFunction, /You do not have permission to manage this project/)
  assert.match(actionFunction, /Complete or dismiss Day/)
  assert.match(actionFunction, /This action plan is paused/)
  assert.match(actionFunction, /15\*60\*1000/)
  assert.match(actionFunction, /Review and confirm the exact target and content/)
  assert.match(actionFunction, /source_task_id/)
  assert.match(actionFunction, /ON CONFLICT DO NOTHING/)
  assert.match(actionFunction, /Approval expired or is missing/)
})

test('the member workspace exposes bot work, approvals, evidence, outcomes, and community paths', () => {
  for (const phrase of ['Run ready bot work','Work that finishes, with proof','Outcome tracker','Human control stays on','Execution activity and audit trail']) assert.match(workspace, new RegExp(phrase))
  assert.match(workspaceLogic, /approve-task/)
  assert.match(workspaceLogic, /Execute approved action/)
  assert.match(workspaceLogic, /Approval expires after 15 minutes/)
  assert.match(workspaceLogic, /record-outcome/)
  assert.match(workspaceLogic, /Bot task completed with evidence/)
  assert.match(workspace, /Engagement alone is not treated as success/)
  assert.match(builderLogic, /Start my first test/)
  assert.match(builderLogic, /\/workspace\?ecosystem=/)
  assert.match(hubLogic, /Open action workspace/)
})
