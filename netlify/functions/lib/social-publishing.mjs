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
  const providerError = body.error && body.error.code !== 'ok'
  if (!response.ok || providerError) {
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

function connectionToken(connection, provider, env = {}, kind = 'access') {
  const stateSecret = String(env.SOCIAL_OAUTH_STATE_SECRET || '').trim()
  const record = kind === 'refresh' ? connection?.refreshToken : connection?.token
  if (!record || !stateSecret) return ''
  const suffix = kind === 'refresh' ? ':refresh' : ''
  return decryptSocialToken(record, stateSecret, `${provider}:${connection.accountId || connection.pageId || ''}${suffix}`)
}

function envOrConnectionToken(connection, provider, envKey, env = {}) {
  return connectionToken(connection, provider, env) || String(env[envKey] || '').trim()
}

async function currentProviderToken(db, provider, connection, env = {}, fetchImpl = fetch) {
  const envKey = provider === 'x' ? 'X_ACCESS_TOKEN' : 'TIKTOK_ACCESS_TOKEN'
  const current = envOrConnectionToken(connection, provider, envKey, env)
  const expiresAt = Date.parse(String(connection?.expiresAt || ''))
  if (!connection?.token || !Number.isFinite(expiresAt) || expiresAt > Date.now() + 5 * 60 * 1000) return current
  const refreshToken = connectionToken(connection, provider, env, 'refresh')
  if (!db || !refreshToken) return current
  let response
  if (provider === 'tiktok') {
    response = await fetchImpl('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_key: String(env.TIKTOK_CLIENT_KEY || ''), client_secret: String(env.TIKTOK_CLIENT_SECRET || ''), grant_type: 'refresh_token', refresh_token: refreshToken }),
    })
  } else {
    const headers = { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }
    const params = { grant_type: 'refresh_token', refresh_token: refreshToken }
    if (env.X_CLIENT_SECRET) headers.Authorization = `Basic ${Buffer.from(`${env.X_CLIENT_ID}:${env.X_CLIENT_SECRET}`).toString('base64')}`
    else params.client_id = String(env.X_CLIENT_ID || '')
    response = await fetchImpl('https://api.x.com/2/oauth2/token', { method: 'POST', headers, body: new URLSearchParams(params) })
  }
  const body = await responseJson(response)
  if (!response.ok || !body.access_token) throw new Error(`${provider === 'x' ? 'X' : 'TikTok'} token refresh failed: ${String(body.error_description || body.message || `HTTP ${response.status}`).slice(0, 300)}`)
  await saveSocialConnection(db, provider, {
    ...connection,
    refreshToken: String(body.refresh_token || refreshToken),
    expiresAt: new Date(Date.now() + Number(body.expires_in || (provider === 'x' ? 7200 : 86400)) * 1000).toISOString(),
  }, String(body.access_token), env)
  return String(body.access_token)
}

export async function saveSocialConnection(db, provider, connection = {}, accessToken = '', env = {}) {
  const stateSecret = String(env.SOCIAL_OAUTH_STATE_SECRET || '').trim()
  const accountId = String(connection.accountId || connection.pageId || '').trim()
  if (!provider || !accountId || !accessToken || !stateSecret) throw new Error('The social connection could not be saved securely.')
  const state = await readPublishingState(db)
  const rawConnection = cleanObject(connection)
  const refreshToken = String(rawConnection.refreshToken || '')
  const publicConnection = { ...rawConnection }
  delete publicConnection.refreshToken
  state.connections[provider] = {
    ...publicConnection,
    status: 'connected',
    accountId,
    token: encryptSocialToken(accessToken, stateSecret, `${provider}:${accountId}`),
    ...(refreshToken ? { refreshToken: encryptSocialToken(refreshToken, stateSecret, `${provider}:${accountId}:refresh`) } : {}),
    connectedAt: new Date().toISOString(),
    checkedAt: new Date().toISOString(),
  }
  await writePublishingState(db, state)
  return { provider, accountId, account: String(connection.account || connection.pageName || connection.username || '') }
}

export async function publishFacebookStory(connection, content = {}, env = {}, fetchImpl = fetch) {
  const pageToken = facebookConnectionToken(connection, env)
  const appSecret = String(env.META_APP_SECRET || '').trim()
  const imageUrl = String(content.imageUrl || '').trim()
  if (!connection?.pageId || !pageToken || !appSecret) throw new Error('Facebook Page publishing is not connected.')
  if (!imageUrl) throw new Error('Facebook Story publishing requires a public image URL.')

  const proof = appSecretProof(pageToken, appSecret)
  const photoBody = new URLSearchParams()
  photoBody.set('url', imageUrl)
  photoBody.set('published', 'false')
  photoBody.set('access_token', pageToken)
  photoBody.set('appsecret_proof', proof)
  const photo = await checkedFetch(metaUrl(`${connection.pageId}/photos`, env), {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: photoBody,
  }, fetchImpl, 'Facebook')
  if (!photo.id) throw new Error('Facebook did not create a Story photo container.')

  const storyBody = new URLSearchParams()
  storyBody.set('photo_id', String(photo.id))
  storyBody.set('access_token', pageToken)
  storyBody.set('appsecret_proof', proof)
  const story = await checkedFetch(metaUrl(`${connection.pageId}/photo_stories`, env), {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: storyBody,
  }, fetchImpl, 'Facebook')
  const id = String(story.post_id || story.id || photo.id)
  return { id, url: `https://www.facebook.com/${connection.pageId}` }
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
  const connection = cleanObject(content.connection)
  const userId = String(connection.accountId || env.THREADS_USER_ID || '').trim()
  const token = envOrConnectionToken(connection, 'threads', 'THREADS_ACCESS_TOKEN', env)
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

export async function publishX(content = {}, env = {}, fetchImpl = fetch) {
  const connection = cleanObject(content.connection)
  const token = await currentProviderToken(content.db, 'x', connection, env, fetchImpl)
  if (!token) throw new Error('X publishing is not connected.')
  const result = await checkedFetch('https://api.x.com/2/tweets', {
    method: 'POST',
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: String(content.text || '').slice(0, 280) }),
  }, fetchImpl, 'X')
  const id = String(result?.data?.id || '')
  return { id, url: id ? `https://x.com/i/web/status/${id}` : 'https://x.com/' }
}

export async function publishTikTok(content = {}, env = {}, fetchImpl = fetch) {
  const connection = cleanObject(content.connection)
  const token = await currentProviderToken(content.db, 'tiktok', connection, env, fetchImpl)
  if (!token) throw new Error('TikTok publishing is not connected.')
  if (String(env.TIKTOK_PUBLIC_POST_APPROVED || '').toLowerCase() !== 'true') {
    throw new Error('TikTok public posting needs Content Posting API audit approval; private-only automation is intentionally disabled.')
  }
  const imageUrl = String(content.imageUrl || '').trim()
  if (!imageUrl) throw new Error('TikTok photo publishing requires a public image URL.')
  const creator = await checkedFetch('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', {
    method: 'POST',
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: '{}',
  }, fetchImpl, 'TikTok')
  const options = creator?.data?.privacy_level_options || []
  if (!options.includes('PUBLIC_TO_EVERYONE')) throw new Error('TikTok does not currently allow public posting for this account and app.')
  const result = await checkedFetch('https://open.tiktokapis.com/v2/post/publish/content/init/', {
    method: 'POST',
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({
      post_info: {
        title: String(content.tiktokTitle || 'Build what you imagine with Beslyfe').slice(0, 90),
        description: String(content.text || '').slice(0, 4000),
        privacy_level: 'PUBLIC_TO_EVERYONE',
        disable_comment: false,
        auto_add_music: true,
        brand_content_toggle: false,
        brand_organic_toggle: true,
      },
      source_info: { source: 'PULL_FROM_URL', photo_images: [imageUrl], photo_cover_index: 0 },
      post_mode: 'DIRECT_POST',
      media_type: 'PHOTO',
    }),
  }, fetchImpl, 'TikTok')
  const id = String(result?.data?.publish_id || '')
  return { id, url: 'https://www.tiktok.com/@bes_lyfe' }
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
      ready: !!((connections.threads?.accountId && connections.threads?.token && env.SOCIAL_OAUTH_STATE_SECRET) || (env.THREADS_USER_ID && env.THREADS_ACCESS_TOKEN)),
      account: connections.threads?.account || env.THREADS_USERNAME || '',
      appReady: !!(env.THREADS_APP_ID && env.THREADS_APP_SECRET),
    },
    tiktok: {
      ready: !!((connections.tiktok?.accountId && connections.tiktok?.token && env.SOCIAL_OAUTH_STATE_SECRET) || env.TIKTOK_ACCESS_TOKEN),
      account: connections.tiktok?.account || env.TIKTOK_USERNAME || '',
      appReady: !!(env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET),
      publicPostingApproved: String(env.TIKTOK_PUBLIC_POST_APPROVED || '').toLowerCase() === 'true',
    },
    x: {
      ready: !!((connections.x?.accountId && connections.x?.token && env.SOCIAL_OAUTH_STATE_SECRET) || env.X_ACCESS_TOKEN),
      account: connections.x?.account || env.X_USERNAME || '',
      appReady: !!env.X_CLIENT_ID,
    },
  }
}

export function campaignDeliveryPlan(campaign = {}) {
  const requested = Array.isArray(campaign.channels) ? campaign.channels : ['facebook', 'instagram', 'threads', 'tiktok', 'x']
  const plan = []
  for (const channel of requested) {
    plan.push({ key: channel, publisher: channel, placement: String(campaign[`${channel}Placement`] || 'feed').toLowerCase() })
    if (campaign.storyCompanion === false) continue
    if (channel === 'facebook' && String(campaign.facebookPlacement || 'feed').toLowerCase() !== 'story') {
      plan.push({ key: 'facebook_story', publisher: 'facebook', placement: 'story' })
    }
    if (channel === 'instagram' && String(campaign.instagramPlacement || 'feed').toLowerCase() !== 'story') {
      plan.push({ key: 'instagram_story', publisher: 'instagram', placement: 'story' })
    }
  }
  return plan
}

export async function publishCampaign(db, campaign, env = {}, fetchImpl = fetch) {
  const state = await readPublishingState(db)
  const deliveries = campaignDeliveryPlan(campaign)
  const results = {}
  const publishAt = Date.parse(String(campaign.publishAfter || ''))
  if (Number.isFinite(publishAt) && publishAt > Date.now()) {
    for (const delivery of deliveries) {
      results[delivery.key] = { ok: true, skipped: true, status: 'scheduled', publishAfter: campaign.publishAfter }
    }
    return results
  }
  for (const delivery of deliveries) {
    const key = `${campaign.id}:${delivery.key}`
    const previous = cleanObject(state.deliveries[key])
    if (previous.status === 'published') {
      results[delivery.key] = { ok: true, skipped: true, ...previous }
      continue
    }
    try {
      const channelContent = cleanObject(campaign.channelContent)
      const publisherOverride = cleanObject(channelContent[delivery.publisher])
      const deliveryOverride = cleanObject(channelContent[delivery.key])
      const content = { ...campaign, ...publisherOverride, ...deliveryOverride }
      if (delivery.placement === 'story') {
        content.imageUrl = String(deliveryOverride.imageUrl || campaign.storyImageUrl || content.imageUrl || '')
        content.facebookPlacement = 'story'
        content.instagramPlacement = 'story'
      }
      let published
      if (delivery.key === 'facebook_story') published = await publishFacebookStory(state.connections.facebook, content, env, fetchImpl)
      else if (delivery.publisher === 'facebook') published = await publishFacebook(state.connections.facebook, content, env, fetchImpl)
      else if (delivery.publisher === 'instagram') published = await publishInstagram(content, env, fetchImpl)
      else if (delivery.publisher === 'threads') published = await publishThreads({ ...content, connection: state.connections.threads }, env, fetchImpl)
      else if (delivery.publisher === 'tiktok') published = await publishTikTok({ ...content, db, connection: state.connections.tiktok }, env, fetchImpl)
      else if (delivery.publisher === 'x') published = await publishX({ ...content, db, connection: state.connections.x }, env, fetchImpl)
      else throw new Error('Unsupported social channel.')
      const record = { status: 'published', publishedAt: new Date().toISOString(), externalId: published.id, url: published.url }
      state.deliveries[key] = record
      results[delivery.key] = { ok: true, ...record }
    } catch (error) {
      const record = {
        status: /not connected|needs/i.test(error?.message || '') ? 'blocked' : 'failed',
        attemptedAt: new Date().toISOString(),
        error: String(error?.message || 'Publishing failed.').slice(0, 500),
      }
      state.deliveries[key] = record
      results[delivery.key] = { ok: false, ...record }
    }
    await writePublishingState(db, state)
  }
  return results
}

export const LAUNCH_CAMPAIGN = Object.freeze({
  id: 'beslyfe-launch-2026-07-18',
  text: 'Beslyfe is live. Build communities, coordinate work, and turn ideas into meaningful action from one living platform. Join the founding community at https://beslyfe.com/?utm_source=social&utm_medium=organic&utm_campaign=beslyfe_launch #Beslyfe #CommunityBuilding #Automation',
  imageUrl: 'https://beslyfe.com/assets/images/beslyfe-social-preview-v2.png',
  storyImageUrl: 'https://beslyfe.com/assets/images/campaigns/beslyfe-free-opportunity-journey-vertical-v1.png',
  linkUrl: 'https://beslyfe.com/?utm_source=facebook&utm_medium=organic&utm_campaign=beslyfe_launch',
  channels: ['facebook', 'instagram', 'threads', 'tiktok', 'x'],
})

export const FREE_OPPORTUNITY_CAMPAIGNS = Object.freeze([
  Object.freeze({
    id: 'beslyfe-free-opportunity-01-first-step-2026-07-18',
    publishAfter: '2026-07-18T20:30:00Z',
    text: 'What if the idea you keep thinking about had somewhere to begin?\n\nBeslyfe is 100% free. Bring the dream—a blog, creative career, online store, retail operation, property-management system, community, event, or something nobody has named yet. Beslyfe helps you shape it, connect it, and automate repetitive work so you can spend more time doing what you love.\n\nStart free at https://beslyfe.com/signup?utm_source=social&utm_medium=organic&utm_campaign=free_opportunity&utm_content=first_step\n\n#Beslyfe #BuildYourFuture #FreeOpportunity #GrowTogether',
    imageUrl: 'https://beslyfe.com/assets/images/campaigns/beslyfe-free-opportunity-first-step-v1.png',
    storyImageUrl: 'https://beslyfe.com/assets/images/campaigns/beslyfe-free-opportunity-story-v1.png',
    linkUrl: 'https://beslyfe.com/signup?utm_source=facebook&utm_medium=organic&utm_campaign=free_opportunity&utm_content=first_step',
    altText: 'A creator takes the first step on an idea while a warm, connected path opens toward future work and community.',
    channels: ['facebook', 'instagram', 'threads', 'tiktok', 'x'],
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
    storyImageUrl: 'https://beslyfe.com/assets/images/campaigns/beslyfe-free-opportunity-journey-vertical-v1.png',
    linkUrl: 'https://beslyfe.com/signup?utm_source=facebook&utm_medium=organic&utm_campaign=free_opportunity&utm_content=grow_together',
    altText: 'A warm, diverse group helps one another turn creative and business ideas into practical next steps.',
    channels: ['facebook', 'instagram', 'threads', 'tiktok', 'x'],
    channelContent: {
      threads: {
        text: 'Big changes rarely begin with a perfect plan. They begin when someone shares the idea, asks a useful question, and finds people willing to help. Beslyfe is a 100% free place to begin—and a growing community to move forward with. https://beslyfe.com/signup?utm_source=threads&utm_medium=organic&utm_campaign=free_opportunity&utm_content=grow_together #Beslyfe #GrowTogether',
      },
    },
  }),
])

export const SOCIAL_CAMPAIGNS = Object.freeze([LAUNCH_CAMPAIGN, ...FREE_OPPORTUNITY_CAMPAIGNS])
