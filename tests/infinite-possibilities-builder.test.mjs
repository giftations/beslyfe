import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { safeReturnPath } from '../netlify/functions/auth.mjs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const home = read('index.html')
const builder = read('create.html')
const builderLogic = read('assets/js/create.js')
const homeDiscovery = read('assets/js/home-discovery.js')
const builderDiscoveryStyles = read('assets/css/builder-discovery.css')
const schema = read('db/schema.ts')
const ecosystemsFunction = read('netlify/functions/ecosystems.mjs')

test('homepage keeps the living-network visual and expands the promise beyond websites', () => {
  assert.match(home, /Start with one honest answer/)
  assert.match(home, /Which feels most true/)
  assert.match(home, /id="homeExperience" hidden/)
  assert.match(homeDiscovery, /hasProject\)\{showHome/)
  assert.match(homeDiscovery, /if\(draft\.item\|\|localDraft\(\)\)\{showResume/)
  assert.match(home, /class="network-board"/)
  assert.match(home, /Your idea \+ automation/)
  for (const phrase of ['Blogging &amp; media', 'Modeling &amp; creative work', 'Brick-and-mortar retail', 'Property management', 'Something entirely new']) {
    assert.match(home, new RegExp(phrase))
  }
  assert.match(home, /If you can dream it/)
  assert.match(home, /the work you love gets more of it/)
})

test('guided builder asks about operational friction and desired automation', () => {
  assert.match(builder, /What are you building or running first\?/)
  assert.match(builder, /id="operatingChallenge"/)
  assert.match(builder, /id="automationWish"/)
  assert.match(builder, /Automations remain reviewable, pausable/)
  assert.match(builderLogic, /operatingChallenge:/)
  assert.match(builderLogic, /automationWish:/)
  assert.match(builderLogic, /exampleByProduct=\{publisher:/)
  assert.match(builderLogic, /retail:\{audience:/)
  assert.match(builderLogic, /property:\{audience:/)
})

test('guided builder treats uncertainty and income urgency as real starting points', () => {
  assert.match(builder, /I don't know yet/)
  assert.match(builder, /I need money/)
  assert.match(builder, /How soon does earning money matter\?/)
  assert.match(builder, /What do people already ask you for help with\?/)
  assert.match(builder, /What problems, people, or industries do you understand from real life\?/)
  assert.match(builder, /What can you use without taking on debt\?/)
  assert.match(builder, /What must the plan respect\?/)
  assert.match(builderLogic, /deriveExperiment/)
  assert.match(builderLogic, /A seven-day discovery sprint/)
  assert.match(builderLogic, /Near-term lane/)
  assert.match(builderLogic, /Longer-term lane/)
  assert.match(builderLogic, /isUnknownAnswer/)
  assert.match(builderLogic, /begin with free community conversations/)
})

test('whatever-it-takes answers are bounded by explicit safety and honesty rules', () => {
  assert.match(builder, /whatever it takes/)
  assert.match(builder, /legal and safe/)
  assert.match(builder, /legal, honest, safe, consent-based work/)
  assert.match(builder, /scams, deception, exploitation, illegal activity, unsafe shortcuts, predatory debt/)
  assert.match(builderLogic, /this is a test plan, not guaranteed income/)
  assert.match(builderLogic, /Pressure deserves a safer pace/)
  assert.match(builderLogic, /safetyCommitment:/)
})

test('discovery context is preserved with the ecosystem plan', () => {
  for (const answer of ['startingPoint', 'incomeTiming', 'incomeTarget', 'weeklyTime', 'strengths', 'problemsUnderstood', 'workPreferences', 'resources', 'hardLimits', 'riskMindset', 'guidanceSummary']) {
    assert.match(builderLogic, new RegExp(`${answer}:`))
  }
})

test('questions begin before signup and require a free account during discovery', () => {
  assert.match(builder, /id="accountGate"/)
  assert.match(builder, /Save your progress/)
  assert.match(builder, /Create my free account and save/)
  assert.match(builder, /id="accountGate"[^>]*hidden/)
  assert.match(builder, /id="builder"[^>]*aria-hidden="false"/)
  assert.match(builderLogic, /fetch\('\/\.netlify\/functions\/auth\?action=session'/)
  assert.match(builderLogic, /if\(!state\.account\)\{scheduleSave\(3\);showAccountCheckpoint/)
  assert.match(builderLogic, /localStorage\.setItem\(localDraftKey/)
  assert.match(builderLogic, /action:'save-draft'/)
  assert.match(builderLogic, /endpoint\+'\?type=draft'/)
  assert.match(builderDiscoveryStyles, /\.builder-account-gate\[hidden\][\s\S]*\.builder-shell\[hidden\][\s\S]*display: none !important/)
  assert.match(schema, /builderDrafts = pgTable\("builder_drafts"/)
  assert.match(ecosystemsFunction, /type === 'draft'/)
  assert.match(ecosystemsFunction, /action === 'save-draft'/)
  assert.match(ecosystemsFunction, /const session = await requireSession\(req, db\)/)
})

test('account creation can safely return a verified member to their build', () => {
  assert.equal(safeReturnPath('/create?type=retail&goal=online-sales'), '/create?type=retail&goal=online-sales')
  assert.equal(safeReturnPath('/hub'), '/hub')
  assert.equal(safeReturnPath('//evil.example/create'), '')
  assert.equal(safeReturnPath('https://evil.example/create'), '')
  assert.equal(safeReturnPath('/signup?next=/create'), '')
})

test('automation plans preserve human control and do not imply ticketing', () => {
  assert.match(builderLogic, /Workflow automation/)
  assert.match(builderLogic, /reviewable and pausable/)
  assert.match(builderLogic, /if\(state\.outcomes\.indexOf\('ticket-sales'\)<0\)set\.delete\('ticketing'\)/)
})

test('paid creative opportunities use a booking sales path', () => {
  assert.match(builderLogic, /outcomes\.indexOf\('book-opportunities'\)>=0\)mode\.value='booking'/)
})

test('payment setup accepts a username and previews the completed provider URL', () => {
  assert.match(builder, /Choose the platform and enter only your @username/)
  assert.match(builder, /id="salesDestination"/)
  assert.match(builder, /id="paymentUrlPreview"/)
  assert.match(builderLogic, /destinationTemplate:'https:\/\/paypal\.me\/\{handle\}'/)
  assert.match(builderLogic, /destinationTemplate:'https:\/\/cash\.app\/\$\{handle\}'/)
  assert.match(builderLogic, /destinationTemplate:'https:\/\/venmo\.com\/u\/\{handle\}'/)
  assert.match(builderLogic, /paymentHandle:provider\.entry==='handle'\?raw:''/)
  assert.doesNotMatch(builderLogic, /getElementById\('salesUrl'\)/)
})
