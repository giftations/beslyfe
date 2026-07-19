import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { getDatabase } from '@netlify/database'

import { json, requireAdmin } from './lib/session.mjs'
import {
  appSecretProof,
  chooseManagedPage,
  saveSocialConnection,
} from './lib/social-publishing.mjs'

const BASE_URL = 'https://beslyfe.com/.netlify/functions/social-oauth'
const PROVIDERS = new Set(['facebook', 'threads', 'tiktok', 'x'])

function stateKey(secret) {
  return createHash('sha256').update(`beslyfe-social-oauth:${secret}`).digest()
}

export function sealOauthState(payload, secret) {
  if (!secret) throw new Error('SOCIAL_OAUTH_STATE_SECRET is not configured.')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', stateKey(secret), iv)
  cipher.setAAD(Buffer.from('beslyfe-social-oauth-v1'))
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.')
}

export function openOauthState(value, secret, now = Date.now()) {
  if (!secret) throw new Error('SOCIAL_OAUTH_STATE_SECRET is not configured.')
  const parts = String(value || '').split('.')
  if (parts.length !== 3) throw new Error('Invalid social connection state.')
  try {
    const decipher = createDecipheriv('aes-256-gcm', stateKey(secret), Buffer.from(parts[0], 'base64url'))
    decipher.setAAD(Buffer.from('beslyfe-social-oauth-v1'))
    decipher.setAuthTag(Buffer.from(parts[1], 'base64url'))
    const payload = JSON.parse(Buffer.concat([
      decipher.update(Buffer.from(parts[2], 'base64url')),
      decipher.final(),
    ]).toString('utf8'))
    if (!PROVIDERS.has(payload.provider) || Number(payload.expiresAt || 0) < now) throw new Error('Expired social connection state.')
    return payload
  } catch (error) {
    if (/Expired/.test(error?.message || '')) throw error
    throw new Error('Invalid social connection state.')
  }
}

function callbackUrl(provider) {
  if (provider === 'tiktok') return 'https://beslyfe.com/.netlify/functions/social-oauth-tiktok'
  return `${BASE_URL}?provider=${encodeURIComponent(provider)}`
}

function pkceChallenge(verifier) {
  return createHash('sha256').update(verifier).digest('base64url')
}

function authorizeUrl(provider, env, state, verifier) {
  const redirect = callbackUrl(provider)
  if (provider === 'facebook') {
    if (!env.META_APP_ID || !env.META_APP_SECRET) throw new Error('The Meta app ID and secret must be configured first.')
    const url = new URL(`https://www.facebook.com/${env.META_GRAPH_VERSION || 'v25.0'}/dialog/oauth`)
    url.search = new URLSearchParams({ client_id: env.META_APP_ID, redirect_uri: redirect, response_type: 'code', state, scope: 'pages_show_list,pages_read_engagement,pages_manage_posts' })
    return url
  }
  if (provider === 'threads') {
    if (!env.THREADS_APP_ID || !env.THREADS_APP_SECRET) throw new Error('The Threads app ID and secret must be configured first.')
    const url = new URL('https://threads.net/oauth/authorize')
    url.search = new URLSearchParams({ client_id: env.THREADS_APP_ID, redirect_uri: redirect, response_type: 'code', state, scope: 'threads_basic,threads_content_publish' })
    return url
  }
  if (provider === 'tiktok') {
    if (!env.TIKTOK_CLIENT_KEY || !env.TIKTOK_CLIENT_SECRET) throw new Error('The TikTok client key and secret must be configured first.')
    const url = new URL('https://www.tiktok.com/v2/auth/authorize/')
    url.search = new URLSearchParams({ client_key: env.TIKTOK_CLIENT_KEY, redirect_uri: redirect, response_type: 'code', state, scope: 'user.info.basic,video.publish' })
    return url
  }
  if (!env.X_CLIENT_ID) throw new Error('The X client ID must be configured first.')
  const url = new URL('https://x.com/i/oauth2/authorize')
  url.search = new URLSearchParams({ response_type: 'code', client_id: env.X_CLIENT_ID, redirect_uri: redirect, scope: 'tweet.read tweet.write users.read offline.access', state, code_challenge: pkceChallenge(verifier), code_challenge_method: 'S256' })
  return url
}

async function readJson(response, provider) {
  let body = {}
  try { body = await response.json() } catch {}
  if (!response.ok || (body.error && body.error.code !== 'ok')) {
    const detail = body?.error_description || body?.error?.message || body?.message || `${provider} returned HTTP ${response.status}.`
    throw new Error(`${provider} connection failed: ${String(detail).slice(0, 300)}`)
  }
  return body
}

async function formPost(url, params, headers = {}, provider = 'Social provider') {
  return readJson(await fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams(params),
  }), provider)
}

async function connectFacebook(db, code, env) {
  const redirect = callbackUrl('facebook')
  const short = await formPost(`https://graph.facebook.com/${env.META_GRAPH_VERSION || 'v25.0'}/oauth/access_token`, {
    client_id: env.META_APP_ID, client_secret: env.META_APP_SECRET, redirect_uri: redirect, code,
  }, {}, 'Facebook')
  const exchange = new URL(`https://graph.facebook.com/${env.META_GRAPH_VERSION || 'v25.0'}/oauth/access_token`)
  exchange.search = new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: env.META_APP_ID, client_secret: env.META_APP_SECRET, fb_exchange_token: short.access_token })
  const longLived = await readJson(await fetch(exchange), 'Facebook')
  const pages = new URL(`https://graph.facebook.com/${env.META_GRAPH_VERSION || 'v25.0'}/me/accounts`)
  pages.search = new URLSearchParams({ fields: 'id,name,access_token,tasks', access_token: longLived.access_token, appsecret_proof: appSecretProof(longLived.access_token, env.META_APP_SECRET) })
  const page = chooseManagedPage((await readJson(await fetch(pages), 'Facebook')).data)
  return saveSocialConnection(db, 'facebook', { accountId: String(page.id), pageId: String(page.id), pageName: String(page.name), account: String(page.name), tasks: page.tasks || [] }, String(page.access_token), env)
}

async function connectThreads(db, code, env) {
  const token = await formPost('https://graph.threads.net/oauth/access_token', {
    client_id: env.THREADS_APP_ID, client_secret: env.THREADS_APP_SECRET, grant_type: 'authorization_code', redirect_uri: callbackUrl('threads'), code,
  }, {}, 'Threads')
  const longUrl = new URL('https://graph.threads.net/access_token')
  longUrl.search = new URLSearchParams({ grant_type: 'th_exchange_token', client_secret: env.THREADS_APP_SECRET, access_token: token.access_token })
  const longLived = await readJson(await fetch(longUrl), 'Threads')
  const meUrl = new URL('https://graph.threads.net/v1.0/me')
  meUrl.search = new URLSearchParams({ fields: 'id,username', access_token: longLived.access_token })
  const me = await readJson(await fetch(meUrl), 'Threads')
  return saveSocialConnection(db, 'threads', { accountId: String(me.id || token.user_id), username: String(me.username || ''), account: String(me.username || '') }, String(longLived.access_token), env)
}

async function connectTikTok(db, code, env) {
  const token = await formPost('https://open.tiktokapis.com/v2/oauth/token/', {
    client_key: env.TIKTOK_CLIENT_KEY, client_secret: env.TIKTOK_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: callbackUrl('tiktok'),
  }, {}, 'TikTok')
  const meUrl = new URL('https://open.tiktokapis.com/v2/user/info/')
  meUrl.searchParams.set('fields', 'open_id,display_name')
  const me = await readJson(await fetch(meUrl, { headers: { Authorization: `Bearer ${token.access_token}` } }), 'TikTok')
  const user = me?.data?.user || {}
  const username = String(env.TIKTOK_USERNAME || '').replace(/^@/, '')
  return saveSocialConnection(db, 'tiktok', {
    accountId: String(token.open_id || user.open_id), username, account: String(username || user.display_name || ''),
    refreshToken: String(token.refresh_token || ''), expiresAt: new Date(Date.now() + Number(token.expires_in || 86400) * 1000).toISOString(),
  }, String(token.access_token), env)
}

async function connectX(db, code, verifier, env) {
  const headers = {}
  const params = { code, grant_type: 'authorization_code', redirect_uri: callbackUrl('x'), code_verifier: verifier }
  if (env.X_CLIENT_SECRET) headers.Authorization = `Basic ${Buffer.from(`${env.X_CLIENT_ID}:${env.X_CLIENT_SECRET}`).toString('base64')}`
  else params.client_id = env.X_CLIENT_ID
  const token = await formPost('https://api.x.com/2/oauth2/token', params, headers, 'X')
  const me = await readJson(await fetch('https://api.x.com/2/users/me?user.fields=username,name', { headers: { Authorization: `Bearer ${token.access_token}` } }), 'X')
  const user = me?.data || {}
  return saveSocialConnection(db, 'x', {
    accountId: String(user.id), username: String(user.username || ''), account: String(user.username || user.name || ''),
    refreshToken: String(token.refresh_token || ''), expiresAt: new Date(Date.now() + Number(token.expires_in || 7200) * 1000).toISOString(),
  }, String(token.access_token), env)
}

function successHtml(provider, account) {
  const safeProvider = String(provider).replace(/[^a-z]/gi, '')
  const safeAccount = String(account || '').replace(/[&<>"']/g, '')
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Connected</title><style>body{font:16px system-ui;background:#111027;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0}.card{max-width:560px;padding:42px;border:1px solid #4f4b78;border-radius:24px;background:#1b1938}a{color:#73e0c1}</style><div class="card"><h1>${safeProvider} connected</h1><p>${safeAccount ? `@${safeAccount} is` : 'The account is'} ready in Beslyfe's social publisher.</p><p><a href="/admin/#/social-publishing">Return to Social Publisher</a></p></div>`
}

export default async (req) => {
  const env = globalThis.process?.env || {}
  const url = new URL(req.url)
  const inferredProvider = url.pathname.endsWith('/social-oauth-tiktok') ? 'tiktok' : ''
  const provider = String(url.searchParams.get('provider') || inferredProvider).toLowerCase()
  if (!PROVIDERS.has(provider)) return json({ error: 'Unknown social provider.' }, 400)
  const db = getDatabase()
  const stateSecret = String(env.SOCIAL_OAUTH_STATE_SECRET || '')

  if (!url.searchParams.has('code')) {
    const admin = await requireAdmin(req, db)
    if (admin instanceof Response) return admin
    const verifier = randomBytes(48).toString('base64url')
    const state = sealOauthState({ provider, verifier, expiresAt: Date.now() + 10 * 60 * 1000 }, stateSecret)
    try {
      return Response.redirect(authorizeUrl(provider, env, state, verifier), 302)
    } catch (error) {
      return json({ error: String(error?.message || 'Social connection could not start.').slice(0, 500) }, 503)
    }
  }

  try {
    const state = openOauthState(url.searchParams.get('state'), stateSecret)
    if (state.provider !== provider) throw new Error('The social provider did not match the connection request.')
    const code = String(url.searchParams.get('code') || '')
    let result
    if (provider === 'facebook') result = await connectFacebook(db, code, env)
    else if (provider === 'threads') result = await connectThreads(db, code, env)
    else if (provider === 'tiktok') result = await connectTikTok(db, code, env)
    else result = await connectX(db, code, state.verifier, env)
    return new Response(successHtml(provider, result.account), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
  } catch (error) {
    const message = String(error?.message || 'Social connection failed.').slice(0, 500)
    console.error(`[social-oauth] ${provider} connection failed: ${message}`)
    return json({ error: message }, 502)
  }
}
