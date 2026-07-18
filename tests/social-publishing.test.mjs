import test from 'node:test'
import assert from 'node:assert/strict'

import {
  appSecretProof,
  chooseManagedPage,
  decryptSocialToken,
  encryptSocialToken,
  LAUNCH_CAMPAIGN,
  socialReadiness,
} from '../netlify/functions/lib/social-publishing.mjs'
import { normalizeTrafficEvent } from '../netlify/functions/traffic.mjs'

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

