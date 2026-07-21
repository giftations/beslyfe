import { automationMode, needsAutomationApproval } from './execution-contract.mjs'

export const ACTION_PLAN_STATUSES = Object.freeze(['active', 'paused', 'completed', 'archived'])
export const ACTION_TASK_STATUSES = Object.freeze(['queued', 'awaiting_approval', 'approved', 'running', 'completed', 'failed', 'blocked', 'dismissed'])
export const ACTION_OUTCOME_KEYS = Object.freeze(['conversations', 'qualified_leads', 'bookings', 'sales_cents', 'community_help', 'lessons'])

const TASK_DEFINITIONS = Object.freeze([
  { day:1, actionKey:'define-test', title:'Define the smallest useful test', mode:'internal', description:'Turn the builder answers into one audience, one offer, one hypothesis, and one proof question.' },
  { day:2, actionKey:'select-channels', title:'Choose reachable starting channels', mode:'internal', description:'Use available resources to prepare a no-debt path to the first real conversations.' },
  { day:3, actionKey:'draft-page', title:'Draft the first offer page', mode:'internal', description:'Prepare editable headline, promise, proof, and call-to-action copy.' },
  { day:4, actionKey:'draft-outreach', title:'Draft respectful outreach', mode:'internal', description:'Prepare direct and community messages without spam, pressure, or false promises.' },
  { day:5, actionKey:'community-share', title:'Ask the Beslyfe community for help', mode:'external', description:'Publish the approved project question to the shared feed and invite useful feedback.' },
  { day:6, actionKey:'measure-results', title:'Measure signals that matter', mode:'internal', description:'Summarize conversations, leads, bookings, sales, help received, and lessons.' },
  { day:7, actionKey:'choose-next-step', title:'Choose the next honest iteration', mode:'internal', description:'Use recorded outcomes to continue, revise, or stop the test without sunk-cost pressure.' },
])

function clean(value, max = 600) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ').slice(0, max)
}

function unknown(value) {
  const text = clean(value, 80)
  return !text || /^(?:i\s+)?(?:do not|don['’]?t)\s+know(?:\s+yet)?$|^not\s+sure(?:\s+yet)?$|^idk$/i.test(text)
}

function projectContext(ecosystem = {}) {
  const answers = ecosystem.answers && typeof ecosystem.answers === 'object' ? ecosystem.answers : {}
  const audience = unknown(answers.audience) ? 'people you can reach who share one real problem' : clean(answers.audience)
  const offer = unknown(answers.offer) ? 'one small useful result that can be tested before a large commitment' : clean(answers.offer)
  const problem = unknown(answers.problemsUnderstood) ? clean(answers.operatingChallenge) : clean(answers.problemsUnderstood)
  const strengths = unknown(answers.strengths) ? '' : clean(answers.strengths)
  const limits = unknown(answers.hardLimits) ? '' : clean(answers.hardLimits)
  const resources = Array.isArray(answers.resources) ? answers.resources.map((item) => clean(item, 40)).filter(Boolean) : []
  return {
    name: clean(ecosystem.name, 160) || 'My Beslyfe project',
    productType: clean(ecosystem.productType || ecosystem.product_type, 60) || 'custom',
    primaryOutcome: clean(ecosystem.primaryOutcome || ecosystem.primary_outcome, 80) || 'community-growth',
    guidanceSummary: clean(answers.guidanceSummary, 1200),
    audience,
    offer,
    problem,
    strengths,
    limits,
    resources,
  }
}

export function buildSevenDayActionPlan(ecosystem = {}) {
  const context = projectContext(ecosystem)
  const summary = {
    promise: `Prove one useful version of ${context.name} before making it bigger.`,
    nearTerm: context.guidanceSummary || `Start with real conversations about ${context.offer}.`,
    decisionRule: 'Expand only after real people respond, participate, book, buy, or provide useful evidence.',
    safetyRule: 'Use legal, honest, safe, consent-based work; do not use deception, spam, predatory debt, or unapproved external actions.',
  }
  const tasks = TASK_DEFINITIONS.map((definition, index) => {
    const mode = automationMode(definition.mode)
    const requiresApproval = needsAutomationApproval(mode)
    const task = {
      ...definition,
      sequence: index + 1,
      mode,
      requiresApproval,
      status: requiresApproval ? 'awaiting_approval' : 'queued',
      input: { context },
      approvalPreview: {},
    }
    if (definition.actionKey === 'community-share') {
      task.approvalPreview = {
        target: 'Beslyfe shared community feed',
        visibility: 'public',
        action: 'Publish one text post',
        content: buildCommunityPost(ecosystem),
        expiresMinutes: 15,
      }
    }
    return task
  })
  return { version:1, summary, tasks }
}

export function buildCommunityPost(ecosystem = {}) {
  const context = projectContext(ecosystem)
  const problemLine = context.problem ? ` I understand this problem from real life: ${context.problem}.` : ''
  return clean(`I am building ${context.name} with Beslyfe. I am testing this useful result: ${context.offer}. It is for ${context.audience}.${problemLine} What is the hardest part of this problem, and what would make a first version genuinely useful? I welcome honest feedback and collaborators.`, 1800)
}

function outcomeTotals(outcomes = []) {
  return outcomes.reduce((totals, item) => {
    const key = ACTION_OUTCOME_KEYS.includes(item.metricKey || item.metric_key) ? (item.metricKey || item.metric_key) : ''
    if (key) totals[key] = (totals[key] || 0) + Math.max(0, Number(item.value) || 0)
    return totals
  }, {})
}

export function executeInternalAction(actionKey, ecosystem = {}, outcomes = []) {
  const context = projectContext(ecosystem)
  const totals = outcomeTotals(outcomes)
  if (actionKey === 'define-test') {
    return {
      summary:'The smallest useful test is drafted and ready to edit.',
      artifacts:{
        audience:context.audience,
        offer:context.offer,
        hypothesis:`If ${context.audience} see ${context.offer}, at least one person will respond with a concrete question, request, booking, purchase, or useful correction.`,
        proofQuestion:'What would have to be true for this to be useful enough to try or recommend?',
        boundary:context.limits || 'Do not spend heavily or automate external actions until the first evidence is reviewed.',
      },
    }
  }
  if (actionKey === 'select-channels') {
    const channels = ['Beslyfe community feedback']
    if (context.resources.includes('network')) channels.push('People already known to the member')
    if (context.resources.includes('audience')) channels.push('Existing audience or following')
    if (context.resources.includes('transportation') || context.resources.includes('space')) channels.push('Relevant local organizations or community boards')
    if (context.resources.includes('computer') || context.resources.includes('phone')) channels.push('One reputable online community that permits the offer')
    if (context.resources.includes('none')) channels.push('Free one-to-one discovery conversations arranged through Beslyfe')
    return { summary:'Starting channels were selected from resources the member said are available.', artifacts:{channels:[...new Set(channels)],contactGoal:'Three to five consent-based conversations',spendingRule:'Use free channels first. Do not buy ads, inventory, or expensive tools before evidence.'} }
  }
  if (actionKey === 'draft-page') {
    return { summary:'Editable first-page copy is ready.', artifacts:{eyebrow:`A first test from ${context.name}`,headline:context.offer,subhead:`Built for ${context.audience}. Start with one clear conversation before making a large commitment.`,proofPrompt:'Tell us what you need, what you have tried, and what a useful first result would look like.',primaryAction:'Help shape the first version',trustLine:'No guaranteed outcomes. Clear expectations, consent-based follow-up, and human review before external actions.'} }
  }
  if (actionKey === 'draft-outreach') {
    return { summary:'Respectful outreach drafts are ready; nothing was sent.', artifacts:{directMessage:`I am testing ${context.name}: ${context.offer}. I thought of you because you may understand the problem. Would you be willing to answer one question about what would make it genuinely useful? No sales pressure.`,communityMessage:buildCommunityPost(ecosystem),followUp:'Thank you for the honest feedback. I am comparing what people actually need before I build more. May I ask one follow-up question?',rules:['Send only to relevant people','Personalize the reason for contacting them','Respect no response as no','Never claim guaranteed income or results']} }
  }
  if (actionKey === 'measure-results') {
    const signal = (totals.qualified_leads||0)+(totals.bookings||0)+(totals.sales_cents||0)
    return { summary:signal?'The test has a measurable demand signal.':'No paid demand signal is recorded yet; learning still counts, but expansion should wait.', artifacts:{conversations:totals.conversations||0,qualifiedLeads:totals.qualified_leads||0,bookings:totals.bookings||0,salesCents:totals.sales_cents||0,communityHelp:totals.community_help||0,lessons:totals.lessons||0,nextMeasurement:signal?'Ask what caused the strongest response and repeat the smallest version.':'Record at least three real conversations before increasing cost or automation.'} }
  }
  if (actionKey === 'choose-next-step') {
    const paidSignal=(totals.qualified_leads||0)+(totals.bookings||0)+(totals.sales_cents||0)
    const conversationSignal=(totals.conversations||0)+(totals.community_help||0)+(totals.lessons||0)
    const decision=paidSignal?'Continue the smallest version and improve the conversion path.':conversationSignal?'Revise the offer from repeated feedback, then run one more small test.':'Keep the scope small and collect five relevant conversations before building more.'
    return { summary:'The next iteration is based on recorded outcomes, not optimism alone.', artifacts:{decision,keep:`Keep the audience and offer only where people showed real interest.`,change:'Change one assumption at a time so the next result teaches something.',stopRule:'Pause or stop if the work violates stated boundaries, requires unsafe debt, or produces no useful signal after repeated honest tests.'} }
  }
  throw new Error('This internal action is not allowlisted.')
}

export function actionPlanContractSummary() {
  return {
    planStatuses:[...ACTION_PLAN_STATUSES],
    taskStatuses:[...ACTION_TASK_STATUSES],
    outcomeKeys:[...ACTION_OUTCOME_KEYS],
    taskDefinitions:TASK_DEFINITIONS.map((item) => ({...item})),
    approvalMinutes:15,
  }
}
