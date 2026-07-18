import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('public community surfaces invite growth without advertising small totals', () => {
  const home = read('index.html')
  const community = read('community.html')
  const protectedSpace = read('community-cannadispo.html')
  const homeScript = read('assets/js/home-community.js')
  const communityScript = read('assets/js/community-home.js')
  const protectedScript = read('assets/js/community-space.js')

  for (const page of [home, community, protectedSpace]) {
    assert.match(page, /Join our growing community/i)
    assert.doesNotMatch(page, /id="(?:networkMemberCount|statMembers|communityMembers|spaceMembers)"/)
  }

  for (const script of [homeScript, communityScript, protectedScript]) {
    assert.doesNotMatch(script, /counts\|\|\{\}\)\.members/)
    assert.doesNotMatch(script, /members are already connected/)
  }
})
