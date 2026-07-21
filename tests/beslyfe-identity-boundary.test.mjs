import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const inheritedBrand = /Bak(?:'|’|\\')?d|bakdonthebay/i

test('public Beslyfe surfaces contain no inherited proof-event branding', () => {
  const surfaces = [
    '404.html', 'about.html', 'contact.html', 'community.html', 'create.html',
    'directory.html', 'feed.html', 'groups.html', 'hub.html', 'workspace.html', 'library.html',
    'manifesto.html', 'map.html', 'messages.html', 'profile-edit.html',
    'profile-new.html', 'profile-view.html', 'reels.html', 'stories.html',
    'admin-login.html', 'auth.js', 'auth.css', 'beslyfe-social.js', 'assets/js/workspace.js',
    'beslyfe-session.js', 'beslyfe-notifications.js', 'social.css', 'studio.js',
  ]
  for (const path of surfaces) assert.doesNotMatch(read(path), inheritedBrand, path)
})

test('the event name appears on the homepage only inside its explicit proof section', () => {
  const home = read('index.html')
  assert.equal((home.match(/Bak(?:'|’)?d On The Bay/g) || []).length, 1)
  assert.match(home, /Proof, kept in its place/)
  assert.match(read('proof/bakd-on-the-bay/index.html'), /Proof, not the platform identity/)
})

test('Beslyfe owns package identity, neutral theme defaults, and roadmap', () => {
  assert.equal(JSON.parse(read('package.json')).name, 'beslyfe')
  assert.match(read('platform/themes/registry.mjs'), /DEFAULT_THEME_KEY = 'beslyfe'/)
  assert.match(read('ROADMAP.md'), /identity and shared community/i)
})
