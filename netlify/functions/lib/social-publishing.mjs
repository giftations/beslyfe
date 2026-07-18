import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'node:crypto'

const STATE_PAGE = 'beslyfe_social_publishing'
const DEFAULT_META_VERSION = 'v25.0'
const PAGE_HINTS = [/beslyfe/i, /bes lyfe/i, /bak'?d/i, /cannadispo/i, /on the bay/i]

function cleanObject(value) {
  if (typeof value === 'string') {
    try { return JSON.parse(value) } catch { return {} }
  }
  return value && typeof value === 'object' ? value : {}
}

function metaVersion(env = {}) {
  const value = String(env.META_GRAPH_VERSION || DEFAULT_META_VERSION).trim()
  return /^v\d+\.\d+$/.test(value) ? value : DEFAULT_META_VERSION
}

function metaUrl(path, env = {}) {
  return `https://graph.facebook.com/${metaVersion(env)}/${String(path || '').replace(/^\/+/, '')}`
}

function threadsVersion(env = {}) {
  const value = String(env.THREADS_GRAPH_VERSION || 'v1.0').trim()
  return /^v\d+\.\d+$/.test(value) ? value : 'v1.0'
}

function tokenKey(secret) {
  return createHash('sha256').update(String(secret || '')).digest()
}

export function encryptSocialToken(token = '', secret = '', aad = '') {
  if (!token || !secret) throw new Error('Social token encryption is not configured.')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', tokenKey(secret), iv)
  if (aad) cipher.setAAD(Buffer.from(aad))
  const ciphertext = Buffer.concat([cipher.update(String(token), 'utf8'), cipher.final()])
  return {
    version: 1,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
  }
}

export function decryptSocialToken(record = {}, secret = '', aad = '') {
  const value = cleanObject(record)
  const decipher = createDecipheriv('aes-256-gcm', tokenKey(secret), Buffer.from(String(value.iv || ''), 'base64url'))
  if (aad) decipher.setAAD(Buffer.from(aad))
  decipher.setAuthTag(Buffer.from(String(value.tag || ''), 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(String(value.ciphertext || ''), 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

export function appSecretProof(token = '', secret = '') {
  return createHmac('sha256', String(secret || '')).update(String(token || '')).digest('hex')
}

export async function readPublishingState(db) {
  const rows = await db.sql`SELECT "data" FROM site_settings WHERE "page" = ${STATE_PAGE} LIMIT 1`
  const state = cleanObject(rows[0] && rows[0].data)
  return {
    version: 1,
    connections: cleanObject(state.connections),
    deliveries: cleanObject(state.deliveries),
    queue: Array.isArray(state.queue) ? state.queue : [],
    updatedAt: String(state.updatedAt || ''),
  }
}

export async function writePublishingState(db, state = {}) {
  const now = new Date().toISOString()
  const next = {
    version: 1,
    connections: cleanObject(state.connections),
    deliveries: cleanObject(state.deliveries),
    queue: Array.isArray(state.queue) ? state.queue.slice(0, 200) : [],
    updatedAt: now,
  }
  await db.sql`
    INSERT INTO site_settings ("page", "data", "updated_at")
    VALUES (${STATE_PAGE}, ${JSON.stringify(next)}::jsonb, ${now})
    ON CONFLICT ("page") DO UPDATE SET "data" = EXCLUDED."data", "updated_at" = EXCLUDED."updated_at"
  `
  return next
}

async function responseJson(response) {
  try { return await response.json() } catch { return {} }
}

async function checkedFetch(url, options, fetchImpl, provider) {
  const response = await fetchImpl(url, options)
  const body = await responseJson(response)
  if (!response.ok || body.error) {
    const providerCode = body?.error?.code || body?.error?.error_subcode || body?.error?.code || ''
    const message = body?.error?.message || body?.error?.message || `${provider} returned HTTP ${response.status}.`
    const error = new Error(`${provider} rejected the request${providerCode ? ` (${providerCode})` : ''}: ${message}`)
    error.status = response.status
    throw error
  }
  return body
}

export function chooseManagedPage(pages = []) {
  const eligible = (Array.isArray(pages) ? pages : []).filter((page) => page && page.id && page.name && page.access_token)
  if (eligible.length === 1) return eligible[0]
  for (const hint of PAGE_HINTS) {
    const matches = eligible.filter((page) => hint.test(String(page.name || '')))
    if (matches.length === 1) return matches[0]
  }
  if (!eligible.length) throw new Error('No managed Facebook Page with a publishing token was returned.')
  throw new Error(`Meta returned ${eligible.length} managed Pages and none was uniquely identifiable as Beslyfe.`)
}

export async function bootstrapFacebookConnection(db, env = {}, fetchImpl = fetch) {
  const appId = String(env.META_APP_ID || '').trim()
  const appSecret = String(env.META_APP_SECRET || '').trim()
  const sourceToken = String(env.FACEBOOK_USER_ACCESS_TOKEN || '').trim()
  const stateSecret = String(env.SOCIAL_OAUTH_STATE_SECRET || '').trim()
  if (!appId || !appSecret || !sourceToken || !stateSecret) {
    throw new Error('Facebook publishing needs META_APP_ID, META_APP_SECRET, FACEBOOK_USER_ACCESS_TOKEN, and SOCIAL_OAUTH_STATE_SECRET.')
  }

  const exchange = new URL(metaUrl('oauth/access_token', env))
  exchange.searchParams.set('grant_type', 'fb_exchange_token')
  exchange.searchParams.set('client_id', appId)
  exchange.searchParams.set('client_secret', appSecret)
  exchange.searchParams.set('fb_exchange_token', sourceToken)
  const longLived = await checkedFetch(exchange, { headers: { Accept: 'application/json' } }, fetchImpl, 'Facebook')
  const userToken = String(longLived.access_token || '')
  if (!userToken) throw new Error('Facebook did not return a long-lived user token.')

  const pagesUrl = new URL(metaUrl('me/accounts', env))
  pagesUrl.searchParams.set('fields', 'id,name,access_token,tasks')
  pagesUrl.searchParams.set('access_token', userToken)
  pagesUrl.searchParams.set('appsecret_proof', appSecretProof(userToken, appSecret))
  const pagesBody = await checkedFetch(pagesUrl, { headers: { Accept: 'application/json' } }, fetchImpl, 'Facebook')
  const page = chooseManagedPage(pagesBody.data)
  const pageToken = String(page.access_token || '')
  const now = new Date().toISOString()
  const state = await readPublishingState(db)
  state.connections.facebook = {
    status: 'connected',
    pageId: String(page.id),
    pageName: String(page.name),
    tasks: Array.isArray(page.tasks) ? page.tasks.slice(0, 20) : [],
    token: encryptSocialToken(pageToken, stateSecret, `facebook:${page.id}`),
    connectedAt: now,
    checkedAt: now,
  }
  await writePublishingState(db, state)
  return { pageId: String(page.id), pageName: String(page.name), tasks: state.connections.facebook.tasks }
}

function facebookConnectionToken(connection, env = {}) {
  const stateSecret = String(env.SOCIAL_OAUTH_STATE_SECRET || '').trim()
  if (!connection?.pageId || !connection?.token || !stateSecret) return ''
  return decryptSocialToken(connection.token, stateSecret, `facebook:${connection.pageId}`)
}

export async function publishFacebook(connection, content = {}, env = {}, fetchImpl = fetch) {
  const pageToken = facebookConnectionToken(connection, env)
  const appSecret = String(env.META_APP_SECRET || '').trim()
  if (!connection?.pageId || !pageToken || !appSecret) throw new Error('Facebook Page publishing is not connected.')
  const body = new URLSearchParams()
  const text = String(content.text || '').slice(0, 10000)
  const imageUrl = String(content.imageUrl || '').trim()
  if (imageUrl) {
    body.set('url', imageUrl)
    body.set('caption', text)
    body.set('published', 'true')
  } else {
    body.set('message', text)
    if (content.linkUrl) body.set('link', String(content.linkUrl))
  }
  body.set('access_token', pageToken)
  body.set('appsecret_proof', appSecretProof(pageToken, appSecret))
  const result = await checkedFetch(metaUrl(`${connection.pageId}/${imageUrl ? 'photos' : 'feed'}`, env), {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  }, fetchImpl, 'Facebook')
  return { id: String(result.id || ''), url: result.id ? `https://www.facebook.com/${result.id}` : '' }
}

export async function publishInstagram(content = {}, env = {}, fetchImpl = fetch) {
  const userId = String(env.INSTAGRAM_USER_ID || '').trim()
  const token = String(env.INSTAGRAM_ACCESS_TOKEN || '').trim()
  if (!userId || !token) throw new Error('Instagram publishing is not connected.')
  if (!content.imageUrl) throw new Error('Instagram launch publishing requires a public image URL.')
  const create = new URLSearchParams()
  const placement = String(content.instagramPlacement || 'feed').toLowerCase()
  create.set('image_url', String(content.imageUrl))
  if (placement === 'story') create.set('media_type', 'STORIES')
  else create.set('caption', String(content.text || '').slice(0, 2200))
  create.set('access_token', token)
  const container = await checkedFetch(`https://graph.instagram.com/${metaVersion(env)}/${userId}/media`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: create,
  }, fetchImpl, 'Instagram')
  if (!container.id) throw new Error('Instagram did not create a media container.')
  await waitForInstagramContainer(String(container.id), token, env, fetchImpl)
  const publish = new URLSearchParams()
  publish.set('creation_id', String(container.id))
  publish.set('access_token', token)
  const result = await checkedFetch(`https://graph.instagram.com/${metaVersion(env)}/${userId}/media_publish`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: publish,
  }, fetchImpl, 'Instagram')
  return { id: String(result.id || ''), url: 'https://www.instagram.com/beslyfe_/' }
}

export async function waitForInstagramContainer(containerId, token, env = {}, fetchImpl = fetch, options = {}) {
  const attempts = Math.max(1, Math.min(20, Number(options.attempts || 10)))
  const delayMs = Math.max(0, Math.min(5000, Number(options.delayMs ?? 750)))
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const statusUrl = new URL(`https://graph.instagram.com/${metaVersion(env)}/${encodeURIComponent(containerId)}`)
    statusUrl.searchParams.set('fields', 'status_code,status')
    statusUrl.searchParams.set('access_token', token)
    const status = await checkedFetch(statusUrl, { headers: { Accept: 'application/json' } }, fetchImpl, 'Instagram')
    const code = String(status.status_code || '').toUpperCase()
    if (code === 'FINISHED' || code === 'PUBLISHED') return status
    if (code === 'ERROR' || code === 'EXPIRED') {
      throw new Error(`Instagram media container ${code.toLowerCase()}: ${String(status.status || 'processing failed').slice(0, 300)}`)
    }
    if (attempt < attempts && delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  throw new Error('Instagram media container is still processing; the scheduled publisher will retry safely.')
}

export async function publishThreads(content = {}, env = {}, fetchImpl = fetch) {
  const userId = String(env.THREADS_USER_ID || '').trim()
  const token = String(env.THREADS_ACCESS_TOKEN || '').trim()
  if (!userId || !token) throw new Error('Threads publishing is not connected.')
  const create = new URLSearchParams()
  const imageUrl = String(content.imageUrl || '').trim()
  create.set('media_type', imageUrl ? 'IMAGE' : 'TEXT')
  create.set('text', String(content.text || '').slice(0, 500))
  if (imageUrl) {
    create.set('image_url', imageUrl)
    create.set('alt_text', String(content.altText || 'Beslyfe campaign image').slice(0, 1000))
  }
  create.set('access_token', token)
  const container = await checkedFetch(`https://graph.threads.net/${threadsVersion(env)}/${userId}/threads`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: create,
  }, fetchImpl, 'Threads')
  if (!container.id) throw new Error('Threads did not create a publishing container.')
  const publish = new URLSearchParams()
  publish.set('creation_id', String(container.id))
  publish.set('access_token', token)
  const result = await checkedFetch(`https://graph.threads.net/${threadsVersion(env)}/${userId}/threads_publish`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: publish,
  }, fetchImpl, 'Threads')
  const username = String(env.THREADS_USERNAME || 'beslyfe_').replace(/^@/, '')
  return { id: String(result.id || ''), url: `https://www.threads.net/@${encodeURIComponent(username)}` }
}

export function socialReadiness(state = {}, env = {}) {
  const connections = cleanObject(state.connections)
  return {
    facebook: {
      ready: !!(connections.facebook?.pageId && connections.facebook?.token && env.META_APP_SECRET && env.SOCIAL_OAUTH_STATE_SECRET),
      account: connections.facebook?.pageName || '',
      bootstrapReady: !!(env.META_APP_ID && env.META_APP_SECRET && env.FACEBOOK_USER_ACCESS_TOKEN && env.SOCIAL_OAUTH_STATE_SECRET),
    },
    instagram: {
      ready: !!(env.INSTAGRAM_USER_ID && env.INSTAGRAM_ACCESS_TOKEN),
      account: env.INSTAGRAM_USERNAME || 'beslyfe_',
    },
    threads: {
      ready: !!(env.THREADS_USER_ID && env.THREADS_ACCESS_TOKEN),
      account: env.THREADS_USERNAME || '',
      appReady: !!(env.THREADS_APP_ID && env.THREADS_APP_SECRET),
    },
  }
}

export async function publishCampaign(db, campaign, env = {}, fetchImpl = fetch) {
  const state = await readPublishingState(db)
  const requested = Array.isArray(campaign.channels) ? campaign.channels : ['facebook', 'instagram', 'threads']
  const results = {}
  const publishAt = Date.parse(String(campaign.publishAfter || ''))
  if (Number.isFinite(publishAt) && publishAt > Date.now()) {
    for (const channel of requested) {
      results[channel] = { ok: true, skipped: true, status: 'scheduled', publishAfter: campaign.publishAfter }
    }
    return results
  }
  for (const channel of requested) {
    const key = `${campaign.id}:${channel}`
    const previous = cleanObject(state.deliveries[key])
    if (previous.status === 'published') {
      results[channel] = { ok: true, skipped: true, ...previous }
      continue
    }
    try {
      const override = cleanObject(cleanObject(campaign.channelContent)[channel])
      const content = { ...campaign, ...override }
      let published
      if (channel === 'facebook') published = await publishFacebook(state.connections.facebook, content, env, fetchImpl)
      else if (channel === 'instagram') published = await publishInstagram(content, env, fetchImpl)
      else if (channel === 'threads') published = await publishThreads(content, env, fetchImpl)
      else throw new Error('Unsupported social channel.')
      const record = { status: 'published', publishedAt: new Date().toISOString(), externalId: published.id, url: published.url }
      state.deliveries[key] = record
      results[channel] = { ok: true, ...record }
    } catch (error) {
      const record = {
        status: /not connected|needs/i.test(error?.message || '') ? 'blocked' : 'failed',
        attemptedAt: new Date().toISOString(),
        error: String(error?.message || 'Publishing failed.').slice(0, 500),
      }
      state.deliveries[key] = record
      results[channel] = { ok: false, ...record }
    }
    await writePublishingState(db, state)
  }
  return results
}

export const LAUNCH_CAMPAIGN = Object.freeze({
  id: 'beslyfe-launch-2026-07-18',
  text: 'Beslyfe is live. Build communities, coordinate work, and turn ideas into meaningful action from one living platform. Join the founding community at https://beslyfe.com/?utm_source=social&utm_medium=organic&utm_campaign=beslyfe_launch #Beslyfe #CommunityBuilding #Automation',
  imageUrl: 'https://beslyfe.com/assets/images/beslyfe-social-preview-v2.png',
  linkUrl: 'https://beslyfe.com/?utm_source=facebook&utm_medium=organic&utm_campaign=beslyfe_launch',
  channels: ['facebook', 'instagram', 'threads'],
})

export const FREE_OPPORTUNITY_CAMPAIGNS = Object.freeze([
  Object.freeze({
    id: 'beslyfe-free-opportunity-01-first-step-2026-07-18',
    publishAfter: '2026-07-18T20:30:00Z',
    text: 'What if the idea you keep thinking about had somewhere to begin?\n\nBeslyfe is 100% free. Bring the dream—a blog, creative career, online store, retail operation, property-management system, community, event, or something nobody has named yet. Beslyfe helps you shape it, connect it, and automate repetitive work so you can spend more time doing what you love.\n\nStart free at https://beslyfe.com/signup?utm_source=social&utm_medium=organic&utm_campaign=free_opportunity&utm_content=first_step\n\n#Beslyfe #BuildYourFuture #FreeOpportunity #GrowTogether',
    imageUrl: 'https://beslyfe.com/assets/images/campaigns/beslyfe-free-opportunity-first-step-v1.png',
    linkUrl: 'https://beslyfe.com/signup?utm_source=facebook&utm_medium=organic&utm_campaign=free_opportunity&utm_content=first_step',
    altText: 'A creator takes the first step on an idea while a warm, connected path opens toward future work and community.',
    channels: ['facebook', 'instagram', 'threads'],
    channelContent: {
      threads: {
        text: 'Your idea deserves somewhere to begin. Beslyfe is 100% free—bring the dream, shape the plan, connect with people, and automate repetitive work so you can spend more time doing what you love. Start at https://beslyfe.com/signup?utm_source=threads&utm_medium=organic&utm_campaign=free_opportunity&utm_content=first_step #Beslyfe #GrowTogether',
      },
    },
  }),
  Object.freeze({
    id: 'beslyfe-free-opportunity-02-story-2026-07-20',
    publishAfter: '2026-07-20T14:00:00Z',
    text: 'Your idea deserves a beginning. Beslyfe is 100% free to join.',
    imageUrl: 'https://beslyfe.com/assets/images/campaigns/beslyfe-free-opportunity-story-v1.png',
    altText: 'A glowing path connects a first creative workspace to businesses, collaborators, and a hopeful future.',
    instagramPlacement: 'story',
    channels: ['instagram'],
  }),
  Object.freeze({
    id: 'beslyfe-free-opportunity-03-community-2026-07-22',
    publishAfter: '2026-07-22T14:00:00Z',
    text: 'Big changes rarely begin with a perfect plan. They begin when somebody shares the idea, asks a useful question, and finds people willing to help.\n\nBeslyfe gives builders, creators, business owners, organizers, and dreamers a 100% free place to begin—and a growing community to move forward with.\n\nBring what you hope to build: https://beslyfe.com/signup?utm_source=social&utm_medium=organic&utm_campaign=free_opportunity&utm_content=grow_together\n\n#Beslyfe #GrowTogether #BuildInPublic #Community',
    imageUrl: 'https://beslyfe.com/assets/images/campaigns/beslyfe-free-opportunity-community-v1.png',
    linkUrl: 'https://beslyfe.com/signup?utm_source=facebook&utm_medium=organic&utm_campaign=free_opportunity&utm_content=grow_together',
    altText: 'A warm, diverse group helps one another turn creative and business ideas into practical next steps.',
    channels: ['facebook', 'instagram', 'threads'],
    channelContent: {
      threads: {
        text: 'Big changes rarely begin with a perfect plan. They begin when someone shares the idea, asks a useful question, and finds people willing to help. Beslyfe is a 100% free place to begin—and a growing community to move forward with. https://beslyfe.com/signup?utm_source=threads&utm_medium=organic&utm_campaign=free_opportunity&utm_content=grow_together #Beslyfe #GrowTogether',
      },
    },
  }),
])

export const SOCIAL_CAMPAIGNS = Object.freeze([LAUNCH_CAMPAIGN, ...FREE_OPPORTUNITY_CAMPAIGNS])
