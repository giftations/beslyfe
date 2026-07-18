import { getDatabase } from '@netlify/database'

import { json, readJsonBody, recordAudit, requireAdmin, requireSameOrigin } from './lib/session.mjs'
import {
  bootstrapFacebookConnection,
  LAUNCH_CAMPAIGN,
  publishCampaign,
  readPublishingState,
  socialReadiness,
} from './lib/social-publishing.mjs'

function publicState(state, env) {
  const deliveries = Object.fromEntries(Object.entries(state.deliveries || {}).map(([key, value]) => [key, {
    status: value.status || '',
    publishedAt: value.publishedAt || '',
    attemptedAt: value.attemptedAt || '',
    url: value.url || '',
    error: value.error || '',
  }]))
  return { readiness: socialReadiness(state, env), deliveries, updatedAt: state.updatedAt || '' }
}

export default async (req) => {
  const db = getDatabase()
  const admin = await requireAdmin(req, db)
  if (admin instanceof Response) return admin
  const env = globalThis.process?.env || {}

  if (req.method === 'GET') {
    const state = await readPublishingState(db)
    return json(publicState(state, env))
  }
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405, { Allow: 'GET, POST' })
  const cross = requireSameOrigin(req)
  if (cross) return cross
  const body = await readJsonBody(req)
  if (body instanceof Response) return body

  if (body.action === 'bootstrap-facebook') {
    try {
      const connection = await bootstrapFacebookConnection(db, env)
      await recordAudit(db, req, admin, {
        action: 'social.facebook.connected',
        resourceType: 'social_connection',
        resourceId: connection.pageId,
        details: { pageName: connection.pageName, tasks: connection.tasks },
      })
      const state = await readPublishingState(db)
      return json({ ok: true, connection, ...publicState(state, env) })
    } catch (error) {
      return json({ error: String(error?.message || 'Facebook connection failed.').slice(0, 500) }, 502)
    }
  }

  if (body.action === 'publish-launch') {
    const results = await publishCampaign(db, LAUNCH_CAMPAIGN, env)
    await recordAudit(db, req, admin, {
      action: 'social.launch.publish',
      resourceType: 'social_campaign',
      resourceId: LAUNCH_CAMPAIGN.id,
      details: { results: Object.fromEntries(Object.entries(results).map(([key, value]) => [key, { ok: value.ok, status: value.status, externalId: value.externalId || '' }])) },
    })
    return json({ ok: Object.values(results).some((result) => result.ok), results })
  }

  return json({ error: 'Unknown social publishing action.' }, 400)
}

