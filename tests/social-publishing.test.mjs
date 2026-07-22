import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

import {
  appSecretProof,
  campaignAllowedByGrowthGoal,
  campaignDeliveryPlan,
  chooseManagedPage,
  dailyGrowthCampaigns,
  DAILY_GROWTH_GOAL,
  decryptSocialToken,
  encryptSocialToken,
  FREE_OPPORTUNITY_CAMPAIGNS,
  fetchManagedFacebookPage,
  LAUNCH_CAMPAIGN,
  publishCampaign,
  publishFacebookStory,
  publishInstagram,
  publishTikTok,
  publishThreads,
  publishX,
  readDailyGrowthGoal,
  readPublishingState,
  SOCIAL_CAMPAIGNS,
  socialReadiness,
  waitForInstagramContainer,
  writeDeliveryRecord,
} from '../netlify/functions/lib/social-publishing.mjs'
import { openOauthState, sealOauthState } from '../netlify/functions/social-oauth.mjs'
import tiktokOauthHandler from '../netlify/functions/social-oauth-tiktok.mjs'
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

test('Facebook resolves an explicitly selected business Page when /me/accounts omits its token', async () => {
  const calls = []
  const fetchImpl = async (url) => {
    calls.push(String(url))
    return {
      ok: true,
      status: 200,
      json: async () => calls.length === 1
        ? ({ data: [] })
        : ({ id: 'page-123', name: 'beslyfe', access_token: 'page-token', tasks: ['CREATE_CONTENT'] }),
    }
  }
  const page = await fetchManagedFacebookPage('user-token', {
    META_APP_SECRET: 'app-secret',
    FACEBOOK_PAGE_ID: 'page-123',
  }, fetchImpl)
  assert.equal(page.id, 'page-123')
  assert.equal(page.access_token, 'page-token')
  assert.match(calls[0], /me\/accounts/)
  assert.match(calls[1], /page-123/)
  assert.doesNotMatch(calls[1], /tasks/)
  assert.doesNotMatch(calls.join('\n'), /app-secret/)
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
  assert.deepEqual(LAUNCH_CAMPAIGN.channels, ['facebook', 'instagram', 'threads', 'tiktok', 'x'])
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
    assert.match(campaign.imageUrl, /^https:\/\/media\.beslyfe\.com\/assets\/images\/campaigns\//)
    assert.equal(existsSync(new URL(`..${new URL(campaign.imageUrl).pathname}`, import.meta.url)), true)
    if (campaign.instagramPlacement !== 'story') {
      assert.match(campaign.storyImageUrl, /^https:\/\/media\.beslyfe\.com\/assets\/images\/campaigns\//)
      assert.equal(existsSync(new URL(`..${new URL(campaign.storyImageUrl).pathname}`, import.meta.url)), true)
    }
    assert.ok(campaign.publishAfter)
  }
  assert.equal(FREE_OPPORTUNITY_CAMPAIGNS[1].instagramPlacement, 'story')
})

test('ongoing growth campaign schedules three attributed posts per local day without catch-up bursts', () => {
  const campaigns = dailyGrowthCampaigns(new Date('2026-07-21T12:00:00Z'), 1)
  assert.equal(campaigns.length, 6)
  const firstDay = campaigns.filter((campaign) => campaign.id.includes('2026-07-21'))
  assert.equal(firstDay.length, 3)
  assert.equal(new Set(firstDay.map((campaign) => campaign.id)).size, 3)
  for (const campaign of campaigns) {
    assert.deepEqual(campaign.channels, ['facebook', 'instagram', 'threads', 'tiktok', 'x'])
    assert.ok(Date.parse(campaign.publishBefore) > Date.parse(campaign.publishAfter))
    assert.match(campaign.text, /100% free|free/i)
    assert.match(campaign.text, /utm_campaign=erie_builder_100/)
    assert.match(campaign.text, /https:\/\/beslyfe\.com\/\?utm_source=/)
    assert.equal(campaign.growthGoalKey, DAILY_GROWTH_GOAL.key)
    assert.match(campaign.targetAudience, /Erie-area first-time entrepreneurs/)
    assert.doesNotMatch(JSON.stringify(campaign), /\b\d+\s+(?:members|users|followers)\b/i)
    assert.ok(campaign.channelContent.x.text.length <= 280)
  }
})

test('targeted campaign counts only verified approved non-admin accounts and stops at its goal', async () => {
  const queries = []
  const db = { sql: async (strings) => {
    queries.push(strings.join(' '))
    return [{ verified_members: 100 }]
  } }
  const goal = await readDailyGrowthGoal(db)
  assert.equal(goal.verifiedMembers, 100)
  assert.equal(goal.remaining, 0)
  assert.equal(goal.active, false)
  assert.match(queries[0], /"email_verified" = true/)
  assert.match(queries[0], /"status" = 'approved'/)
  assert.match(queries[0], /"role" <> 'admin'/)
  assert.equal(campaignAllowedByGrowthGoal({ growthGoalKey: DAILY_GROWTH_GOAL.key }, goal), false)
  assert.equal(campaignAllowedByGrowthGoal({ id: 'unrelated' }, goal), true)
})

test('admin social publisher exposes goal progress and its due button publishes due campaigns', () => {
  const admin = readFileSync(new URL('../assets/js/admin-os.js', import.meta.url), 'utf8')
  const publisher = readFileSync(new URL('../netlify/functions/social-publisher.mjs', import.meta.url), 'utf8')
  assert.match(admin, /Erie Builders verified-member campaign/)
  assert.match(admin, /action: 'publish-due'/)
  assert.match(publisher, /body\.action === 'publish-due'/)
  assert.match(publisher, /campaignAllowedByGrowthGoal/)
})

test('a campaign outside its delivery window is skipped instead of posted late', async () => {
  const db = { sql: async () => [{ data: { connections: {}, deliveries: {} } }] }
  const results = await publishCampaign(db, {
    id: 'expired-campaign',
    publishAfter: '2020-01-01T00:00:00Z',
    publishBefore: '2020-01-01T01:00:00Z',
    channels: ['facebook', 'instagram'],
  }, {})
  assert.equal(results.facebook.status, 'missed_window')
  assert.equal(results.instagram_story.status, 'missed_window')
})

test('published deliveries remain authoritative after their delivery window closes', async () => {
  const published = { status: 'published', externalId: 'post-123', publishedAt: '2026-07-22T17:05:00.000Z' }
  const db = { sql: async () => [{ data: { connections: {}, deliveries: { 'expired-campaign:facebook': published } } }] }
  const results = await publishCampaign(db, {
    id: 'expired-campaign',
    publishAfter: '2020-01-01T00:00:00Z',
    publishBefore: '2020-01-01T01:00:00Z',
    channels: ['facebook'],
    storyCompanion: false,
  }, {})
  assert.equal(results.facebook.status, 'published')
  assert.equal(results.facebook.externalId, 'post-123')
  assert.equal(results.facebook.skipped, true)
})

test('every X campaign has count-free copy that fits the post limit', () => {
  const xCampaigns = SOCIAL_CAMPAIGNS.filter((campaign) => campaign.channels.includes('x'))
  assert.ok(xCampaigns.length >= 1)
  for (const campaign of xCampaigns) {
    const text = campaign.channelContent?.x?.text || campaign.text
    assert.ok(text.length <= 280, `${campaign.id} is ${text.length} characters`)
    assert.doesNotMatch(text, /\b\d+\s+(?:members|users|followers)\b/i)
  }
})

test('delivery writes update only one delivery without replacing social connections', async () => {
  const calls = []
  const db = { sql: async (strings, ...values) => { calls.push({ query: strings.join('?'), values }); return [] } }
  await writeDeliveryRecord(db, 'campaign:x', { status: 'failed', error: 'payment required' })
  assert.equal(calls.length, 1)
  assert.match(calls[0].query, /jsonb_set/)
  assert.match(calls[0].query, /\{deliveries\}/)
  assert.doesNotMatch(calls[0].query, /\{connections\}/)
  assert.match(calls[0].query, /\|\| \(EXCLUDED\."data"->'deliveries'\)/)
})

test('verified live deliveries survive recovery from the pre-atomic state race', async () => {
  const db = { sql: async () => [{ data: { connections: {}, deliveries: {} } }] }
  const state = await readPublishingState(db)
  assert.equal(state.deliveries['beslyfe-launch-2026-07-18:facebook'].status, 'published')
  assert.equal(state.deliveries['beslyfe-free-opportunity-01-first-step-2026-07-18:threads'].status, 'published')
})

test('feed campaigns automatically receive separate Facebook and Instagram Story deliveries', () => {
  assert.deepEqual(campaignDeliveryPlan({ channels: ['facebook', 'instagram', 'threads'] }), [
    { key: 'facebook', publisher: 'facebook', placement: 'feed' },
    { key: 'facebook_story', publisher: 'facebook', placement: 'story' },
    { key: 'instagram', publisher: 'instagram', placement: 'feed' },
    { key: 'instagram_story', publisher: 'instagram', placement: 'story' },
    { key: 'threads', publisher: 'threads', placement: 'feed' },
  ])
  assert.deepEqual(campaignDeliveryPlan({ channels: ['instagram'], instagramPlacement: 'story' }), [
    { key: 'instagram', publisher: 'instagram', placement: 'story' },
  ])
})

test('Facebook Story publishing creates an unpublished photo then a Page Story', async () => {
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), body: String(options.body || '') })
    return { ok: true, status: 200, json: async () => calls.length === 1 ? ({ id: 'photo-1' }) : ({ post_id: 'story-1' }) }
  }
  const encrypted = encryptSocialToken('page-token', 'state-secret', 'facebook:page-1')
  const result = await publishFacebookStory({ pageId: 'page-1', token: encrypted }, {
    imageUrl: 'https://beslyfe.com/story.png',
  }, { META_APP_SECRET: 'app-secret', SOCIAL_OAUTH_STATE_SECRET: 'state-secret' }, fetchImpl)
  assert.equal(result.id, 'story-1')
  assert.match(calls[0].url, /page-1\/photos$/)
  assert.match(calls[0].body, /published=false/)
  assert.match(calls[1].url, /page-1\/photo_stories$/)
  assert.match(calls[1].body, /photo_id=photo-1/)
})

test('Instagram feed and Story companions publish once under separate idempotency keys', async () => {
  let storedState = null
  const db = {
    sql: async (strings, ...values) => {
      const query = strings.join('?')
      if (query.includes('SELECT "data" FROM site_settings')) return storedState ? [{ data: storedState }] : []
      if (query.includes('INSERT INTO site_settings')) {
        const next = JSON.parse(values[1])
        storedState = query.includes("'{deliveries}'") && storedState
          ? { ...storedState, deliveries: { ...storedState.deliveries, ...next.deliveries }, updatedAt: next.updatedAt }
          : next
        return []
      }
      throw new Error(`Unexpected query: ${query}`)
    },
  }
  const calls = []
  const fetchImpl = async (url, options) => {
    const href = String(url)
    const body = String(options.body || '')
    calls.push({ href, body })
    if (href.includes('fields=status_code')) return { ok: true, status: 200, json: async () => ({ status_code: 'FINISHED' }) }
    if (href.includes('/media_publish')) return { ok: true, status: 200, json: async () => ({ id: `published-${calls.length}` }) }
    return { ok: true, status: 200, json: async () => ({ id: `container-${calls.length}` }) }
  }
  const campaign = {
    id: 'campaign-with-story',
    channels: ['instagram'],
    text: 'Feed caption',
    imageUrl: 'https://beslyfe.com/feed.png',
    storyImageUrl: 'https://beslyfe.com/story.png',
  }
  const env = { INSTAGRAM_USER_ID: 'ig', INSTAGRAM_ACCESS_TOKEN: 'token' }
  const first = await publishCampaign(db, campaign, env, fetchImpl)
  assert.equal(first.instagram.status, 'published')
  assert.equal(first.instagram_story.status, 'published')
  assert.match(calls[0].body, /image_url=https%3A%2F%2Fbeslyfe.com%2Ffeed.png/)
  assert.doesNotMatch(calls[0].body, /media_type=STORIES/)
  assert.match(calls[3].body, /image_url=https%3A%2F%2Fbeslyfe.com%2Fstory.png/)
  assert.match(calls[3].body, /media_type=STORIES/)
  const callCount = calls.length
  const second = await publishCampaign(db, campaign, env, fetchImpl)
  assert.equal(second.instagram.skipped, true)
  assert.equal(second.instagram_story.skipped, true)
  assert.equal(calls.length, callCount)
})

test('Instagram story and Threads image publishing use their media containers', async () => {
  const instagramCalls = []
  const instagramFetch = async (url, options) => {
    const href = String(url)
    instagramCalls.push({ href, body: String(options.body || '') })
    if (href.includes('/media_publish')) return { ok: true, status: 200, json: async () => ({ id: 'published' }) }
    if (href.includes('/container?')) return { ok: true, status: 200, json: async () => ({ id: 'container', status_code: 'FINISHED' }) }
    return { ok: true, status: 200, json: async () => ({ id: 'container' }) }
  }
  await publishInstagram({ text: 'Count-free story', imageUrl: 'https://beslyfe.com/story.png', instagramPlacement: 'story' }, {
    INSTAGRAM_USER_ID: 'ig', INSTAGRAM_ACCESS_TOKEN: 'token',
  }, instagramFetch)
  assert.match(instagramCalls[0].body, /media_type=STORIES/)
  assert.doesNotMatch(instagramCalls[0].body, /caption=/)
  assert.match(instagramCalls[1].href, /fields=status_code/)

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

test('OAuth connection state is encrypted, authenticated, provider-bound, and expiring', () => {
  const sealed = sealOauthState({ provider: 'x', verifier: 'pkce-secret', expiresAt: Date.now() + 60_000 }, 'state-secret')
  assert.doesNotMatch(sealed, /pkce-secret|\"provider\"/)
  assert.equal(openOauthState(sealed, 'state-secret').provider, 'x')
  assert.throws(() => openOauthState(sealed, 'wrong-secret'), /Invalid/)
  assert.throws(() => openOauthState(sealed, 'state-secret', Date.now() + 120_000), /Expired/)
  assert.equal(typeof tiktokOauthHandler, 'function')
})

test('X publishes through user-context OAuth and returns a canonical post URL', async () => {
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options })
    return { ok: true, status: 201, json: async () => ({ data: { id: '123', text: 'hello' } }) }
  }
  const result = await publishX({ text: 'hello' }, { X_ACCESS_TOKEN: 'token' }, fetchImpl)
  assert.equal(result.url, 'https://x.com/i/web/status/123')
  assert.equal(calls[0].url, 'https://api.x.com/2/tweets')
  assert.equal(JSON.parse(calls[0].options.body).text, 'hello')
  assert.match(calls[0].options.headers.Authorization, /^Bearer /)
})

test('TikTok refuses private-only automation and uses the audited photo Direct Post contract', async () => {
  await assert.rejects(() => publishTikTok({ imageUrl: 'https://beslyfe.com/post.png' }, { TIKTOK_ACCESS_TOKEN: 'token' }, async () => {
    throw new Error('network should not be called')
  }), /audit approval/)

  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options })
    if (calls.length === 1) return { ok: true, status: 200, json: async () => ({ data: { privacy_level_options: ['PUBLIC_TO_EVERYONE'] }, error: { code: 'ok' } }) }
    return { ok: true, status: 200, json: async () => ({ data: { publish_id: 'pub-1' }, error: { code: 'ok' } }) }
  }
  const result = await publishTikTok({ text: 'Build your future', imageUrl: 'https://beslyfe.com/post.png' }, {
    TIKTOK_ACCESS_TOKEN: 'token', TIKTOK_PUBLIC_POST_APPROVED: 'true',
  }, fetchImpl)
  assert.equal(result.id, 'pub-1')
  const request = JSON.parse(calls[1].options.body)
  assert.equal(request.post_mode, 'DIRECT_POST')
  assert.equal(request.media_type, 'PHOTO')
  assert.equal(request.post_info.privacy_level, 'PUBLIC_TO_EVERYONE')
  assert.equal(request.post_info.brand_organic_toggle, true)
})

test('TikTok review mode is explicitly private and never implies public approval', async () => {
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options })
    if (calls.length === 1) return { ok: true, status: 200, json: async () => ({ data: { privacy_level_options: ['SELF_ONLY'] }, error: { code: 'ok' } }) }
    return { ok: true, status: 200, json: async () => ({ data: { publish_id: 'review-1' }, error: { code: 'ok' } }) }
  }
  await publishTikTok({ text: 'Private review post', imageUrl: 'https://beslyfe.com/post.png' }, {
    TIKTOK_ACCESS_TOKEN: 'token', TIKTOK_REVIEW_MODE: 'true', TIKTOK_PUBLIC_POST_APPROVED: 'false',
  }, fetchImpl)
  assert.equal(JSON.parse(calls[1].options.body).post_info.privacy_level, 'SELF_ONLY')
})

test('Instagram waits through processing without publishing early', async () => {
  let checks = 0
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ id: 'container', status_code: ++checks === 1 ? 'IN_PROGRESS' : 'FINISHED' }),
  })
  const result = await waitForInstagramContainer('container', 'token', {}, fetchImpl, { attempts: 3, delayMs: 0 })
  assert.equal(result.status_code, 'FINISHED')
  assert.equal(checks, 2)
})

test('traffic reporting supports bounded operator windows', () => {
  assert.equal(resolveTrafficWindow('24h'), '24h')
  assert.equal(resolveTrafficWindow('7d'), '7d')
  assert.equal(resolveTrafficWindow('30d'), '30d')
  assert.equal(resolveTrafficWindow('365d'), '7d')
})

