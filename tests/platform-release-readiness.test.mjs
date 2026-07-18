import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const home = read('index.html')
test('public homepage presents Beslyfe rather than the proof event', () => {
  assert.match(home, /Beslyfe — The Community Operating System/)
  assert.match(home, /https:\/\/beslyfe\.com\//)
  assert.match(home, /beslyfe-social-preview\.png/)
  assert.match(home, /Bak’d On The Bay is the first ecosystem powered by Beslyfe/)
  assert.doesNotMatch(home, /Get Tickets|Vendor Registration|Bayfront Convention Center/)
})
test('homepage links resolve to local assets or deliberate external destinations', () => {
  for (const href of [...home.matchAll(/href="([^"]+)"/g)].map((m) => m[1])) {
    if (/^(#|mailto:|https:)/.test(href)) continue
    const route = href === '/' ? 'index.html' : href === '/manifesto' ? 'manifesto.html' : href === '/constitution' ? 'CONSTITUTION.md' : href === '/privacy' ? 'privacy.html' : href === '/terms' ? 'terms.html' : href.replace(/^\//, '')
    assert.equal(existsSync(fileURLToPath(new URL(`../${route}`, import.meta.url))), true, `missing ${href}`)
  }
})
test('release workflows use current Node 24 action majors', () => {
  for (const path of ['.github/workflows/node-tests.yml','.github/workflows/smoke-tests.yml']) {
    const workflow = read(path)
    assert.match(workflow, /actions\/checkout@v6/)
    assert.match(workflow, /actions\/setup-node@v6/)
    assert.match(workflow, /node-version: '?24'?/)
  }
})
