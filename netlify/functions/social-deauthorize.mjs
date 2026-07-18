import { createHmac, timingSafeEqual } from 'node:crypto'
import { getDatabase } from '@netlify/database'

import { json } from './lib/session.mjs'
import { readPublishingState, writePublishingState } from './lib/social-publishing.mjs'

function verifySignedRequest(value, secret) {
  const [signaturePart, payloadPart] = String(value || '').split('.')
  if (!signaturePart || !payloadPart || !secret) throw new Error('Invalid signed request.')
  const expected = createHmac('sha256', secret).update(payloadPart).digest()
  const actual = Buffer.from(signaturePart, 'base64url')
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Invalid signed request.')
  const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'))
  if (payload.algorithm && payload.algorithm !== 'HMAC-SHA256') throw new Error('Unsupported signed request.')
  return payload
}

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405, { Allow: 'POST' })
  const env = globalThis.process?.env || {}
  const url = new URL(req.url)
  const provider = String(url.searchParams.get('provider') || 'threads').toLowerCase()
  if (!['facebook', 'threads'].includes(provider)) return json({ error: 'Unknown provider.' }, 400)
  const contentType = req.headers.get('content-type') || ''
  let signedRequest = ''
  if (contentType.includes('application/json')) signedRequest = String((await req.json())?.signed_request || '')
  else signedRequest = String(new URLSearchParams(await req.text()).get('signed_request') || '')
  try {
    const secret = provider === 'threads' ? env.THREADS_APP_SECRET : env.META_APP_SECRET
    const payload = verifySignedRequest(signedRequest, secret)
    const db = getDatabase()
    const state = await readPublishingState(db)
    delete state.connections[provider]
    await writePublishingState(db, state)
    if (url.searchParams.get('action') === 'delete') {
      const confirmationCode = createHmac('sha256', String(env.SOCIAL_OAUTH_STATE_SECRET || secret)).update(String(payload.user_id || payload.user || '')).digest('hex').slice(0, 24)
      return json({ url: `https://beslyfe.com/privacy?deletion=${confirmationCode}`, confirmation_code: confirmationCode })
    }
    return json({ ok: true })
  } catch (error) {
    return json({ error: String(error?.message || 'Invalid signed request.') }, 400)
  }
}
