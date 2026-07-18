import { getDatabase } from '@netlify/database'

import {
  bootstrapFacebookConnection,
  LAUNCH_CAMPAIGN,
  publishCampaign,
  readPublishingState,
  socialReadiness,
} from './lib/social-publishing.mjs'

export const config = { schedule: '*/5 * * * *' }

function publicRunSummary({ bootstrap, readiness, results }) {
  return {
    bootstrap: {
      attempted: bootstrap.attempted,
      ok: bootstrap.ok,
      error: bootstrap.error,
    },
    readiness: {
      facebook: {
        ready: readiness.facebook.ready,
        bootstrapReady: readiness.facebook.bootstrapReady,
        pageName: readiness.facebook.pageName,
      },
      instagram: {
        ready: readiness.instagram.ready,
        account: readiness.instagram.account,
      },
      threads: {
        ready: readiness.threads.ready,
        account: readiness.threads.account,
        appReady: readiness.threads.appReady,
      },
    },
    results: Object.fromEntries(Object.entries(results).map(([channel, result]) => [channel, {
      ok: result.ok,
      skipped: !!result.skipped,
      status: result.status,
      error: result.error || '',
      externalId: result.externalId || '',
    }])),
  }
}

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
  console.info('social-launch result', JSON.stringify(publicRunSummary({ bootstrap, readiness, results })))
  return new Response(JSON.stringify({ ok: true, bootstrap, readiness, results }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

