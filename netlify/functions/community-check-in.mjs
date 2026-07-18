import { getDatabase } from '@netlify/database'
import { runWeeklyCommunityCare } from './lib/community-care.mjs'

export default async () => {
  const result = await runWeeklyCommunityCare(getDatabase(), new Date())
  return Response.json({ ok: true, ...result })
}

// Monday at 14:00 UTC (10:00 AM EDT / 9:00 AM EST). Netlify schedules use UTC.
export const config = {
  schedule: '0 14 * * 1',
}
