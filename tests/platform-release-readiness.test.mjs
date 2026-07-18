import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const home = read('index.html')
const login = read('admin-login.html')
const redirects = read('_redirects')

test('public homepage presents Beslyfe rather than the proof event', () => {
  assert.match(home, /Beslyfe - Build, grow, and belong/)
  assert.match(home, /https:\/\/beslyfe\.com\//)
  assert.match(home, /beslyfe-social-preview-v2\.png/)
  assert.match(home, /https:\/\/www\.tiktok\.com\/@bes_lyfe/)
  assert.match(home, /remains an isolated proof ecosystem/)
  assert.match(home, /Nothing grows alone/)
  assert.match(home, /Ticketing<\/strong><small>Added only when you choose ticket sales/)
  assert.doesNotMatch(home, /Get Tickets|Vendor Registration|Bayfront Convention Center/)
})

test('homepage links resolve to local assets or deliberate external destinations', () => {
  const routeMap = {
    '/login': 'admin-login.html', '/signup': 'admin-login.html', '/admin': 'admin/index.html',
    '/community': 'community.html', '/create': 'create.html', '/feed': 'feed.html',
    '/reels': 'reels.html', '/messages': 'messages.html', '/groups': 'groups.html',
    '/directory': 'directory.html', '/proof/bakd-on-the-bay': 'proof/bakd-on-the-bay/index.html',
  }
  for (const href of [...home.matchAll(/href="([^"]+)"/g)].map((match) => match[1])) {
    if (/^(#|mailto:|https:)/.test(href)) continue
    const path = href.split('?')[0]
    const plain = path.replace(/^\//, '')
    const route = routeMap[path] || (path === '/' ? 'index.html' : (existsSync(fileURLToPath(new URL(`../${plain}`, import.meta.url))) ? plain : `${plain}.html`))
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

test('Admin OS exposes Beslyfe growth, optional event tools, and privacy-safe traffic', () => {
  const admin = read('assets/js/admin-os.js')
  const shell = read('admin/index.html')
  assert.match(admin, /<b>Beslyfe Admin OS<\/b><small>Platform Control<\/small>/)
  assert.match(admin, /traffic:\s*'\/\.netlify\/functions\/traffic'/)
  assert.match(admin, /location\.replace\('\/admin\/login'\)/)
  assert.match(shell, /location\.replace\('\/admin\/login'\)/)
  assert.match(admin, /Beslyfe website traffic/)
  assert.match(admin, /Top pages/)
  assert.match(admin, /Traffic sources/)
  assert.match(admin, /Recent visits/)
  assert.match(admin, /Builds & Growth/)
  assert.match(admin, /Optional Event Tools/)
  assert.match(admin, /Ticketing stays off unless a build explicitly needs it/)
})

test('release workflows use current Node 24 action majors', () => {
  for (const path of ['.github/workflows/node-tests.yml', '.github/workflows/smoke-tests.yml']) {
    const workflow = read(path)
    assert.match(workflow, /actions\/checkout@v6/)
    assert.match(workflow, /actions\/setup-node@v6/)
    assert.match(workflow, /node-version: '?24'?/)
  }
})
