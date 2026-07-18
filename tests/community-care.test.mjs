import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CARE_EXCLUDED_DATA,
  CARE_PERSONALIZATION_SOURCES,
  COMMUNITY_WELCOME_LETTER,
  memberAllowsCare,
  memberWelcomeBody,
  weeklyCheckInBody,
  weekKey,
} from '../netlify/functions/lib/community-care.mjs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('the public welcome letter is warm, useful, and clearly community-first', () => {
  assert.match(COMMUNITY_WELCOME_LETTER, /you belong here/i)
  assert.match(COMMUNITY_WELCOME_LETTER, /Ask questions/)
  assert.match(COMMUNITY_WELCOME_LETTER, /help put the system/i)
  assert.match(memberWelcomeBody('Avery Stone'), /welcome Avery Stone to Beslyfe/i)
})

test('weekly care uses first-party context without covert background research', () => {
  assert.deepEqual(CARE_PERSONALIZATION_SOURCES, [
    'member public profile',
    'member-owned Beslyfe project',
    'recent Beslyfe community activity',
  ])
  assert.ok(CARE_EXCLUDED_DATA.includes('external background checks or covert web research'))
  const body = weeklyCheckInBody({
    display_name: 'Avery Stone',
    project_name: 'North Star Studio',
    product_type: 'creator',
    primary_outcome: 'book-opportunities',
    answers: { offer: 'Make booking creative work simple.' },
    recent_posts: 2,
  })
  assert.match(body, /^Hi Avery/)
  assert.match(body, /North Star Studio/)
  assert.match(body, /Make booking creative work simple/)
  assert.match(body, /request a conversation or booking/)
  assert.match(body, /2 public contributions/)
})

test('weekly messages are deterministic by week and honor message opt-outs', () => {
  assert.equal(weekKey(new Date('2026-07-18T12:00:00Z')), '2026-07-13')
  assert.equal(weekKey(new Date('2026-07-20T12:00:00Z')), '2026-07-20')
  assert.equal(memberAllowsCare({}), true)
  assert.equal(memberAllowsCare({ muted: true }), false)
  assert.equal(memberAllowsCare({ prefs: { message: false } }), false)
  assert.equal(memberAllowsCare({ prefs: JSON.stringify({ message: true }) }), true)
})

test('verification, feed bootstrap, scheduling, and member counts are wired safely', () => {
  const auth = read('netlify/functions/auth.mjs')
  const social = read('netlify/functions/social.mjs')
  const scheduled = read('netlify/functions/community-check-in.mjs')
  const ecosystems = read('netlify/functions/ecosystems.mjs')
  assert.match(auth, /welcomeVerifiedMember\(db/)
  assert.match(social, /ensureCommunityWelcomeLetter\(db\)/)
  assert.match(scheduled, /schedule: '0 14 \* \* 1'/)
  assert.match(ecosystems, /details->>'hidden'/)
})
