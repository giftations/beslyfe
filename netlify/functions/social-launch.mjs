import { getDatabase } from '@netlify/database'

import {
  bootstrapFacebookConnection,
  LAUNCH_CAMPAIGN,
  publishCampaign,
  readPublishingState,
  socialReadiness,
} from './lib/social-publishing.mjs'

export const config = { schedule: '*/5 * * * *' }

export default async () => {
  const db = getDatabase()
  const env = globalThis.process?.env || {}
  let state = await readPublishingState(db)
  let readiness = socialReadiness(state, env)
  const bootstrap = { attempted: false, ok: false, error: '' }

  if (!readiness.facebook.ready && readiness.facebook.bootstrapReady) {
    bootstrap.attempted = true
    try {
      await bootstrapFacebookConnection(db, env)
      bootstrap.ok = true
      state = await readPublishingState(db)
      readiness = socialReadiness(state, env)
    } catch (error) {
      bootstrap.error = String(error?.message || 'Facebook bootstrap failed.').slice(0, 500)
    }
  }

  const results = await publishCampaign(db, LAUNCH_CAMPAIGN, env)
  return new Response(JSON.stringify({ ok: true, bootstrap, readiness, results }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

