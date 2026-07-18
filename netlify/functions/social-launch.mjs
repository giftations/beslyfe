import { getDatabase } from '@netlify/database'

import {
  bootstrapFacebookConnection,
  SOCIAL_CAMPAIGNS,
  LAUNCH_CAMPAIGN,
  publishCampaign,
  readPublishingState,
  socialReadiness,
} from './lib/social-publishing.mjs'

export const config = { schedule: '*/5 * * * *' }

function safeResults(results = {}) {
  return Object.fromEntries(Object.entries(results).map(([channel, result]) => [channel, {
    ok: result.ok,
    skipped: !!result.skipped,
    status: result.status,
    error: result.error || '',
    externalId: result.externalId || '',
    publishAfter: result.publishAfter || '',
  }]))
}

function publicRunSummary({ bootstrap, readiness, campaigns }) {
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
        pageName: readiness.facebook.account,
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
      tiktok: {
        ready: readiness.tiktok.ready,
        account: readiness.tiktok.account,
        appReady: readiness.tiktok.appReady,
        publicPostingApproved: readiness.tiktok.publicPostingApproved,
      },
      x: {
        ready: readiness.x.ready,
        account: readiness.x.account,
        appReady: readiness.x.appReady,
      },
    },
    results: safeResults(campaigns[LAUNCH_CAMPAIGN.id]),
    campaigns: Object.fromEntries(Object.entries(campaigns).map(([id, results]) => [id, safeResults(results)])),
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

  const campaigns = {}
  for (const campaign of SOCIAL_CAMPAIGNS) campaigns[campaign.id] = await publishCampaign(db, campaign, env)
  const summary = publicRunSummary({ bootstrap, readiness, campaigns })
  console.info('social-launch result', JSON.stringify(summary))
  return new Response(JSON.stringify({ ok: true, bootstrap, readiness, ...summary }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

