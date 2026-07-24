import { getDatabase } from '@netlify/database'

// Hourly safety net for interrupted chunked uploads. The interactive endpoint
// also removes expired rows opportunistically; the scheduled sweep ensures
// abandoned chunks do not wait for another member upload.
export default async () => {
  const db = getDatabase()
  const expired = await db.sql`
    DELETE FROM social_media_uploads
    WHERE "expires_at" < ${new Date().toISOString()}
    RETURNING "id"
  `
  return Response.json({ ok: true, removed: expired.length })
}

export const config = {
  schedule: '@hourly',
}
