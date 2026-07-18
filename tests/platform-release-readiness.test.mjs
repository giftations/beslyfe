import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const home = read('index.html')
const login = read('admin-login.html')
const redirects = read('_redirects')
test('public homepage presents Beslyfe rather than the proof event', () => {
  assert.match(home, /Beslyfe — The Community Operating System/)
  assert.match(home, /https:\/\/beslyfe\.com\//)
  assert.match(home, /beslyfe-social-preview\.jpg/)
  assert.match(home, /Bak’d On The Bay is the first ecosystem powered by Beslyfe/)
  assert.doesNotMatch(home, /Get Tickets|Vendor Registration|Bayfront Convention Center/)
})
test('homepage links resolve to local assets or deliberate external destinations', () => {
  const routeMap = { '/login': 'admin-login.html', '/signup': 'admin-login.html', '/admin': 'admin/index.html' }
  for (const href of [...home.matchAll(/href="([^"]+)"/g)].map((m) => m[1])) {
    if (/^(#|mailto:|https:)/.test(href)) continue
    const route = routeMap[href] || (href === '/' ? 'index.html' : href === '/manifesto' ? 'manifesto.html' : href === '/constitution' ? 'CONSTITUTION.md' : href === '/privacy' ? 'privacy.html' : href === '/terms' ? 'terms.html' : href.replace(/^\//, ''))
    assert.equal(existsSync(fileURLToPath(new URL(`../${route}`, import.meta.url))), true, `missing ${href}`)
  }
})
test('public launch exposes sign in, admin, and 100% free membership', () => {
  assert.match(home, /100% free/i)
  assert.match(home, /href="\/login"/)
  assert.match(home, /href="\/signup"/)
  assert.match(home, /href="\/admin"/)
  assert.match(login, /Welcome to Beslyfe/)
  assert.match(login, /100% free/i)
  assert.match(login, /href="\/auth\.css"/)
  assert.match(login, /src="\/auth\.js"/)
  assert.match(redirects, /^\/login\s+\/admin-login\.html\s+200/m)
  assert.match(redirects, /^\/signup\s+\/admin-login\.html\?mode=create\s+200/m)
})
test('Admin OS exposes privacy-safe Beslyfe traffic analytics', () => {
  const admin = read('assets/js/admin-os.js')
  const shell = read('admin/index.html')
  assert.match(admin, /traffic:\s*'\/\.netlify\/functions\/traffic'/)
  assert.match(admin, /location\.replace\('\/admin\/login'\)/)
  assert.match(shell, /location\.replace\('\/admin\/login'\)/)
  assert.match(admin, /Beslyfe website traffic/)
  assert.match(admin, /Top pages/)
  assert.match(admin, /Traffic sources/)
  assert.match(admin, /Recent visits/)
})
test('release workflows use current Node 24 action majors', () => {
  for (const path of ['.github/workflows/node-tests.yml','.github/workflows/smoke-tests.yml']) {
    const workflow = read(path)
    assert.match(workflow, /actions\/checkout@v6/)
    assert.match(workflow, /actions\/setup-node@v6/)
    assert.match(workflow, /node-version: '?24'?/)
  }
})
