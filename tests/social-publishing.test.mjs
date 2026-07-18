import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'

import {
  appSecretProof,
  chooseManagedPage,
  decryptSocialToken,
  encryptSocialToken,
  FREE_OPPORTUNITY_CAMPAIGNS,
  LAUNCH_CAMPAIGN,
  publishInstagram,
  publishThreads,
  SOCIAL_CAMPAIGNS,
  socialReadiness,
} from '../netlify/functions/lib/social-publishing.mjs'
import { normalizeTrafficEvent, resolveTrafficWindow } from '../netlify/functions/traffic.mjs'

test('social tokens are encrypted at rest with connection-bound authenticated encryption', () => {
  const encrypted = encryptSocialToken('page-token', 'state-secret', 'facebook:123')
  assert.notEqual(encrypted.ciphertext, 'page-token')
  assert.equal(decryptSocialToken(encrypted, 'state-secret', 'facebook:123'), 'page-token')
  assert.throws(() => decryptSocialToken(encrypted, 'state-secret', 'facebook:456'))
})

test('Facebook appsecret proof is deterministic and never the original token', () => {
  const proof = appSecretProof('access-token', 'app-secret')
  assert.equal(proof.length, 64)
  assert.notEqual(proof, 'access-token')
  assert.equal(proof, appSecretProof('access-token', 'app-secret'))
})

test('managed Page selection prefers the Beslyfe identity', () => {
  const page = chooseManagedPage([
    { id: '1', name: 'Other Page', access_token: 'one' },
    { id: '2', name: 'Beslyfe', access_token: 'two' },
  ])
  assert.equal(page.id, '2')
})

test('readiness exposes no token material and launch delivery is multi-channel', () => {
  const ready = socialReadiness({ connections: { facebook: { pageId: '1', pageName: 'Beslyfe', token: { ciphertext: 'hidden' } } } }, {
    META_APP_SECRET: 'secret',
    SOCIAL_OAUTH_STATE_SECRET: 'state',
    INSTAGRAM_USER_ID: 'ig',
    INSTAGRAM_ACCESS_TOKEN: 'ig-token',
    THREADS_USER_ID: 'threads',
    THREADS_ACCESS_TOKEN: 'threads-token',
  })
  assert.equal(ready.facebook.ready, true)
  assert.equal(ready.instagram.ready, true)
  assert.equal(ready.threads.ready, true)
  assert.deepEqual(LAUNCH_CAMPAIGN.channels, ['facebook', 'instagram', 'threads'])
  assert.match(LAUNCH_CAMPAIGN.linkUrl, /utm_campaign=beslyfe_launch/)
  assert.doesNotMatch(JSON.stringify(ready), /ig-token|threads-token|ciphertext/)
})

test('traffic measurement stores attribution without personal data', () => {
  assert.deepEqual(normalizeTrafficEvent({
    path: '/welcome', source: 'Facebook', medium: 'Organic', campaign: 'Launch', referrer: 'https://example.com/post/1', email: 'private@example.com',
  }), {
    path: '/welcome', source: 'facebook', medium: 'organic', campaign: 'launch', referrerHost: 'example.com',
  })
})

test('free-opportunity campaign is paced, count-free, and uses committed creative', () => {
  assert.equal(SOCIAL_CAMPAIGNS[0], LAUNCH_CAMPAIGN)
  assert.equal(FREE_OPPORTUNITY_CAMPAIGNS.length, 3)
  for (const campaign of FREE_OPPORTUNITY_CAMPAIGNS) {
    assert.match(campaign.text, /free/i)
    assert.doesNotMatch(JSON.stringify(campaign), /\b\d+\s+(?:members|users|followers)\b/i)
    assert.match(campaign.imageUrl, /^https:\/\/beslyfe\.com\/assets\/images\/campaigns\//)
    assert.equal(existsSync(new URL(`..${new URL(campaign.imageUrl).pathname}`, import.meta.url)), true)
    assert.ok(campaign.publishAfter)
  }
  assert.equal(FREE_OPPORTUNITY_CAMPAIGNS[1].instagramPlacement, 'story')
})

test('Instagram story and Threads image publishing use their media containers', async () => {
  const instagramBodies = []
  const instagramFetch = async (_url, options) => {
    instagramBodies.push(String(options.body || ''))
    return { ok: true, status: 200, json: async () => ({ id: instagramBodies.length === 1 ? 'container' : 'published' }) }
  }
  await publishInstagram({ text: 'Count-free story', imageUrl: 'https://beslyfe.com/story.png', instagramPlacement: 'story' }, {
    INSTAGRAM_USER_ID: 'ig', INSTAGRAM_ACCESS_TOKEN: 'token',
  }, instagramFetch)
  assert.match(instagramBodies[0], /media_type=STORIES/)
  assert.doesNotMatch(instagramBodies[0], /caption=/)

  const threadBodies = []
  const threadsFetch = async (_url, options) => {
    threadBodies.push(String(options.body || ''))
    return { ok: true, status: 200, json: async () => ({ id: threadBodies.length === 1 ? 'container' : 'published' }) }
  }
  await publishThreads({ text: 'A useful beginning', imageUrl: 'https://beslyfe.com/post.png', altText: 'A warm future.' }, {
    THREADS_USER_ID: 'threads', THREADS_ACCESS_TOKEN: 'token',
  }, threadsFetch)
  assert.match(threadBodies[0], /media_type=IMAGE/)
  assert.match(threadBodies[0], /image_url=/)
  assert.match(threadBodies[0], /alt_text=/)
})

test('traffic reporting supports bounded operator windows', () => {
  assert.equal(resolveTrafficWindow('24h'), '24h')
  assert.equal(resolveTrafficWindow('7d'), '7d')
  assert.equal(resolveTrafficWindow('30d'), '30d')
  assert.equal(resolveTrafficWindow('365d'), '7d')
})

