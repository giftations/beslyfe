import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const home = read('index.html')
const builder = read('create.html')
const builderLogic = read('assets/js/create.js')

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

test('automation plans preserve human control and do not imply ticketing', () => {
  assert.match(builderLogic, /Workflow automation/)
  assert.match(builderLogic, /reviewable and pausable/)
  assert.match(builderLogic, /if\(state\.outcomes\.indexOf\('ticket-sales'\)<0\)set\.delete\('ticketing'\)/)
})

test('paid creative opportunities use a booking sales path', () => {
  assert.match(builderLogic, /outcomes\.indexOf\('book-opportunities'\)>=0\)mode\.value='booking'/)
})
