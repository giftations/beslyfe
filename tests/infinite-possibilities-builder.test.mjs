import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { safeReturnPath } from '../netlify/functions/auth.mjs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const home = read('index.html')
const builder = read('create.html')
const builderLogic = read('assets/js/create.js')
const ecosystemsFunction = read('netlify/functions/ecosystems.mjs')

test('homepage keeps the living-network visual and expands the promise beyond websites', () => {
  assert.match(home, /class="network-board"/)
  assert.match(home, /Your idea \+ automation/)
  for (const phrase of ['Blogging &amp; media', 'Modeling &amp; creative work', 'Brick-and-mortar retail', 'Property management', 'Something entirely new']) {
    assert.match(home, new RegExp(phrase))
  }
  assert.match(home, /If you can dream it/)
  assert.match(home, /the work you love gets more of it/)
})

test('guided builder asks about operational friction and desired automation', () => {
  assert.match(builder, /What are you building or running\?/)
  assert.match(builder, /id="operatingChallenge"/)
  assert.match(builder, /id="automationWish"/)
  assert.match(builder, /Automations remain reviewable, pausable/)
  assert.match(builderLogic, /operatingChallenge:/)
  assert.match(builderLogic, /automationWish:/)
  assert.match(builderLogic, /exampleByProduct=\{publisher:/)
  assert.match(builderLogic, /retail:\{audience:/)
  assert.match(builderLogic, /property:\{audience:/)
})

test('a free community account is required before the builder unlocks', () => {
  assert.match(builder, /id="accountGate"/)
  assert.match(builder, /Free membership required/)
  assert.match(builder, /Join the community[\s\S]*Then build anything/)
  assert.match(builder, /href="\/signup\?next=\/create"/)
  assert.match(builder, /id="builder"[^>]*hidden[^>]*aria-hidden="true"/)
  assert.match(builderLogic, /fetch\('\/\.netlify\/functions\/auth\?action=session'/)
  assert.match(builderLogic, /if\(!data\|\|!data\.account\)\{lockBuilder/)
  assert.match(builderLogic, /unlockBuilder\(data\.account\)/)
  assert.doesNotMatch(builderLogic, /beslyfe_build_draft.*setItem/)
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
