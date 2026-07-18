import { COMMUNITY_FEDERATION_PROTOCOL } from '../../platform/communities/federation-contract.mjs'

export const COMMUNITY_SOURCES = Object.freeze([
  Object.freeze({
    id: 'cannadispo',
    name: 'Cannadispo',
    bridgeUrl: 'https://cannadispo.com/.netlify/functions/community-bridge',
    canonicalUrl: 'https://cannadispo.com/community',
    localUrl: '/community/cannadispo',
    minimumAge: 18,
    contentRating: 'adult-cannabis',
    proof: true,
  }),
])

function json(body, status = 200, cache = 'public, max-age=30, stale-while-revalidate=120') {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache },
  })
}

export function sourceById(id) {
  return COMMUNITY_SOURCES.find((source) => source.id === String(id || '').trim()) || null
}

export function buildSourceUrl(source, type, params = {}) {
  if (!sourceById(source && source.id)) throw new Error('Community source is not allowlisted.')
  const url = new URL(source.bridgeUrl)
  url.searchParams.set('type', type)
  for (const [key, value] of Object.entries(params)) {
    if (value !== '' && value !== null && value !== undefined) url.searchParams.set(key, String(value))
  }
  return url.toString()
}

export function ageConfirmed(url) {
  return url.searchParams.get('ageConfirmed') === '1'
}

async function fetchJson(url, options = {}, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    ...options,
    headers: { Accept: 'application/json', ...(options.headers || {}) },
    signal: AbortSignal.timeout(6000),
  })
  let data = null
  try { data = await response.json() } catch { data = null }
  if (!response.ok) {
    const error = new Error((data && data.error) || `Community source returned ${response.status}.`)
    error.status = response.status
    error.data = data
    throw error
  }
  return data
}

function publicSource(source, result = null) {
  return {
    id: source.id,
    name: source.name,
    protocolVersion: result?.manifest?.protocolVersion || COMMUNITY_FEDERATION_PROTOCOL,
    description: result?.manifest?.description || '',
    status: result ? 'available' : 'unavailable',
    minimumAge: source.minimumAge,
    contentRating: source.contentRating,
    canonicalUrl: source.canonicalUrl,
    localUrl: source.localUrl,
    proof: source.proof,
    counts: result?.counts || { members: 0, contributions: 0, reels: 0 },
  }
}

export default async (req) => {
  if (req.method !== 'GET') return json({ error: 'Method Not Allowed' }, 405, 'no-store')
  const url = new URL(req.url)
  const type = url.searchParams.get('type') || 'manifest'

  if (type === 'manifest') {
    const results = await Promise.all(COMMUNITY_SOURCES.map(async (source) => {
      try {
        const data = await fetchJson(buildSourceUrl(source, 'manifest'))
        return publicSource(source, data)
      } catch {
        return publicSource(source)
      }
    }))
    return json({ protocolVersion: COMMUNITY_FEDERATION_PROTOCOL, sources: results })
  }

  const source = sourceById(url.searchParams.get('ecosystem'))
  if (!source) return json({ error: 'Unknown community space.' }, 404, 'no-store')
  if (source.minimumAge > 0 && !ageConfirmed(url)) {
    return json({
      error: `Confirm that you are ${source.minimumAge} or older before opening ${source.name}.`,
      code: 'AGE_CONFIRMATION_REQUIRED',
      minimumAge: source.minimumAge,
      source: publicSource(source),
    }, 403, 'no-store')
  }

  const allowedTypes = new Set(['profiles', 'profile', 'feed'])
  if (!allowedTypes.has(type)) return json({ error: 'Unknown community network request.' }, 400, 'no-store')
  const params = { ageConfirmed: 1, limit: Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 50))) }
  if (type === 'profile') params.id = String(url.searchParams.get('id') || '').replace(/^cannadispo:/, '').slice(0, 160)

  try {
    const data = await fetchJson(buildSourceUrl(source, type, params), { headers: { 'X-Beslyfe-Age-Confirmed': '18+' } })
    return json({ ...data, source: publicSource(source, { manifest: { protocolVersion: COMMUNITY_FEDERATION_PROTOCOL }, counts: {} }) })
  } catch (error) {
    const status = error.status === 404 ? 404 : 502
    return json({
      error: status === 404 ? 'That community profile could not be found.' : `${source.name} is temporarily unavailable. Beslyfe is still online.`,
      code: status === 404 ? 'NOT_FOUND' : 'SOURCE_UNAVAILABLE',
    }, status, 'no-store')
  }
}
