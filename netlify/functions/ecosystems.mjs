import { getDatabase } from '@netlify/database'
import {
  ensureProfileForAccount,
  json,
  newId,
  readSession,
  requireSameOrigin,
  requireSession,
} from './lib/session.mjs'
import {
  PRODUCT_BLUEPRINTS,
  PRODUCT_OUTCOMES,
  productBlueprintSummary,
  recommendCapabilities,
} from '../../platform/ecosystems/product-blueprints.mjs'
import {
  SALES_MODES,
  SALES_PROVIDERS,
  paymentDestinationFromHandle,
  salesEngineContractSummary,
} from '../../platform/growth/sales-engine-contract.mjs'
import { communityNetworkContractSummary } from '../../platform/communities/network-contract.mjs'
import { communityBridgeDefaults } from '../../platform/communities/federation-contract.mjs'
import { ensureActionPlan } from './lib/action-plans.mjs'

const PRODUCT_KEYS = new Set(PRODUCT_BLUEPRINTS.map((item) => item.key))
const OUTCOME_KEYS = new Set(PRODUCT_OUTCOMES.map((item) => item.key))
const SALES_MODE_KEYS = new Set(SALES_MODES.map((item) => item.key))
const SALES_PROVIDER_KEYS = new Set(SALES_PROVIDERS.map((item) => item.key))
const STATUS_KEYS = new Set(['draft', 'active', 'paused', 'archived'])
const MINIMUM_AGES = new Set([0, 13, 18, 21])
const CONTENT_RATINGS = new Set(['general', 'regulated-adult'])
const MAX_NAME = 160
const MAX_DESCRIPTION = 1200
const MAX_URL = 1000

function str(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max)
}

export function slugify(value) {
  return str(value, MAX_NAME)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'my-ecosystem'
}

export function safeDestination(value, provider = 'external') {
  const raw = str(value, MAX_URL)
  if (provider === 'contact-form' && (!raw || raw.startsWith('/'))) {
    return raw || '/contact?source=beslyfe'
  }
  if (!/^https:\/\//i.test(raw)) return ''
  try {
    const url = new URL(raw)
    return url.username || url.password ? '' : url.toString().slice(0, MAX_URL)
  } catch {
    return ''
  }
}

function parseJson(value, fallback) {
  if (value && typeof value === 'object') return value
  if (typeof value !== 'string') return fallback
  try { return JSON.parse(value) } catch { return fallback }
}

function ecosystemRow(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description || '',
    productType: row.product_type || 'website',
    primaryOutcome: row.primary_outcome || 'community-growth',
    ownerProfileId: row.owner_profile_id || '',
    parentEcosystemId: row.parent_ecosystem_id || 'beslyfe-network',
    status: row.status || 'draft',
    visibility: row.visibility || 'public',
    capabilities: parseJson(row.capabilities, []),
    answers: parseJson(row.answers, {}),
    settings: parseJson(row.settings, {}),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  }
}

function growthRow(row) {
  return {
    id: row.id,
    ecosystemId: row.ecosystem_id,
    mode: row.mode,
    provider: row.provider,
    offerName: row.offer_name,
    actionLabel: row.action_label,
    destinationUrl: row.destination_url,
    status: row.status,
    attribution: parseJson(row.attribution, {}),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  }
}

async function uniqueSlug(db, requested, ignoreId = '') {
  const base = slugify(requested)
  for (let suffix = 0; suffix < 50; suffix += 1) {
    const candidate = suffix ? `${base.slice(0, 54)}-${suffix + 1}` : base
    const rows = ignoreId
      ? await db.sql`SELECT id FROM ecosystems WHERE slug = ${candidate} AND id <> ${ignoreId} LIMIT 1`
      : await db.sql`SELECT id FROM ecosystems WHERE slug = ${candidate} LIMIT 1`
    if (!rows.length) return candidate
  }
  return `${base.slice(0, 45)}-${Date.now().toString(36)}`
}

async function canManage(db, ecosystemId, profileId) {
  const rows = await db.sql`
    SELECT e.id
    FROM ecosystems e
    LEFT JOIN ecosystem_memberships m
      ON m.ecosystem_id = e.id AND m.profile_id = ${profileId} AND m.status = 'active'
    WHERE e.id = ${ecosystemId}
      AND (e.owner_profile_id = ${profileId} OR m.role IN ('owner', 'admin'))
    LIMIT 1
  `
  return rows.length > 0
}

export default async (req) => {
  const db = getDatabase()
  const url = new URL(req.url)

  if (req.method === 'GET') {
    const type = url.searchParams.get('type') || 'mine'
    if (type === 'blueprints') {
      return json({
        products: productBlueprintSummary(),
        sales: salesEngineContractSummary(),
        network: communityNetworkContractSummary(),
      }, 200, { 'Cache-Control': 'public, max-age=300' })
    }

    if (type === 'network-stats') {
      const [members, posts, reels, ecosystems, wins] = await Promise.all([
        db.sql`SELECT COUNT(*)::int AS n FROM profiles WHERE status = 'approved' AND COALESCE(details->>'hidden', 'false') <> 'true'`,
        db.sql`SELECT COUNT(*)::int AS n FROM social_posts WHERE visibility = 'public' AND post_type IN ('post', 'reel')`,
        db.sql`SELECT COUNT(*)::int AS n FROM social_posts WHERE visibility = 'public' AND post_type = 'reel'`,
        db.sql`SELECT COUNT(*)::int AS n FROM ecosystems WHERE status = 'active' AND visibility = 'public'`,
        db.sql`SELECT COUNT(*)::int AS n FROM social_posts WHERE visibility = 'public' AND (LOWER(body) LIKE '%success%' OR LOWER(body) LIKE '%win%')`,
      ])
      return json({
        members: members[0]?.n || 0,
        contributions: posts[0]?.n || 0,
        reels: reels[0]?.n || 0,
        ecosystems: ecosystems[0]?.n || 0,
        successStories: wins[0]?.n || 0,
      }, 200, { 'Cache-Control': 'public, max-age=60' })
    }

    if (type === 'public') {
      const rows = await db.sql`
        SELECT * FROM ecosystems
        WHERE status = 'active' AND visibility = 'public'
        ORDER BY created_at DESC
        LIMIT 100
      `
      return json({ items: rows.map(ecosystemRow) }, 200, { 'Cache-Control': 'public, max-age=60' })
    }

    const session = await requireSession(req, db)
    if (session instanceof Response) return session
    const profileId = await ensureProfileForAccount(db, session)
    const rows = await db.sql`
      SELECT DISTINCT e.*
      FROM ecosystems e
      LEFT JOIN ecosystem_memberships m ON m.ecosystem_id = e.id
      WHERE e.owner_profile_id = ${profileId}
         OR (m.profile_id = ${profileId} AND m.status = 'active')
      ORDER BY e.updated_at DESC
    `
    const ids = rows.map((row) => row.id)
    let channels = []
    if (ids.length) {
      channels = await db.sql`
        SELECT g.* FROM growth_channels g
        JOIN ecosystem_memberships m ON m.ecosystem_id = g.ecosystem_id
        WHERE m.profile_id = ${profileId} AND m.status = 'active'
        ORDER BY g.updated_at DESC
      `
    }
    return json({ items: rows.map(ecosystemRow), growthChannels: channels.map(growthRow) })
  }

  if (req.method !== 'POST' && req.method !== 'PUT') {
    return json({ error: 'Method Not Allowed' }, 405)
  }

  const cross = requireSameOrigin(req)
  if (cross) return cross
  const session = await requireSession(req, db)
  if (session instanceof Response) return session
  const profileId = await ensureProfileForAccount(db, session)
  if (!profileId) return json({ error: 'Create your member profile before building an ecosystem.' }, 400)

  let body
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  if (!body || typeof body !== 'object') return json({ error: 'Expected a JSON object' }, 400)
  const action = body.action || 'create'

  // Every verified account belongs to the shared network. This is idempotent
  // and also repairs older accounts that predate ecosystem memberships.
  await db.sql`
    INSERT INTO ecosystem_memberships (ecosystem_id, profile_id, role, source, status, joined_at)
    VALUES ('beslyfe-network', ${profileId}, 'member', 'account', 'active', ${new Date().toISOString()})
    ON CONFLICT (ecosystem_id, profile_id) DO UPDATE SET status = 'active'
  `

  if (action === 'create') {
    const name = str(body.name, MAX_NAME)
    if (name.length < 2) return json({ error: 'Give your project a name.' }, 400)
    const productType = PRODUCT_KEYS.has(body.productType) ? body.productType : 'website'
    const outcomes = Array.isArray(body.outcomes) ? body.outcomes.filter((key) => OUTCOME_KEYS.has(key)) : []
    const primaryOutcome = OUTCOME_KEYS.has(body.primaryOutcome) ? body.primaryOutcome : (outcomes[0] || 'community-growth')
    const selected = Array.isArray(body.capabilities) ? body.capabilities.filter((key) => typeof key === 'string') : []
    const capabilities = recommendCapabilities({ productType, outcomes, selected })
    const slug = await uniqueSlug(db, body.slug || name)
    const id = newId('eco_')
    const now = new Date().toISOString()
    const description = str(body.description, MAX_DESCRIPTION)
    const answers = body.answers && typeof body.answers === 'object' ? body.answers : {}
    const minimumAge = MINIMUM_AGES.has(Number(body.minimumAge)) ? Number(body.minimumAge) : 0
    const contentRating = CONTENT_RATINGS.has(body.contentRating) ? body.contentRating : (minimumAge >= 18 ? 'regulated-adult' : 'general')
    const settings = {
      communityBridge: communityBridgeDefaults({
        ecosystemId: id,
        minimumAge,
        contentRating,
      }),
    }
    await db.sql`
      INSERT INTO ecosystems (
        id, slug, name, description, product_type, primary_outcome,
        owner_profile_id, parent_ecosystem_id, status, visibility,
        capabilities, answers, settings, created_at, updated_at
      ) VALUES (
        ${id}, ${slug}, ${name}, ${description}, ${productType}, ${primaryOutcome},
        ${profileId}, 'beslyfe-network', 'draft', 'public',
        ${JSON.stringify(capabilities)}::jsonb, ${JSON.stringify(answers)}::jsonb,
        ${JSON.stringify(settings)}::jsonb, ${now}, ${now}
      )
    `
    await db.sql`
      INSERT INTO ecosystem_memberships (ecosystem_id, profile_id, role, source, status, joined_at)
      VALUES (${id}, ${profileId}, 'owner', 'builder', 'active', ${now})
      ON CONFLICT (ecosystem_id, profile_id) DO UPDATE SET role = 'owner', status = 'active'
    `
    const rows = await db.sql`SELECT * FROM ecosystems WHERE id = ${id} LIMIT 1`
    const item = ecosystemRow(rows[0])
    let actionPlan = null
    try {
      actionPlan = await ensureActionPlan(db, item, profileId)
    } catch (error) {
      // The ecosystem remains usable if a deploy is still applying its additive
      // action-workspace migration. Opening the workspace repairs the plan.
      console.error(JSON.stringify({ event:'ecosystem_action_plan_deferred', ecosystemId:id, message:String(error?.message||'unknown').slice(0,300) }))
    }
    return json({ ok: true, item, actionPlan }, 201)
  }

  const ecosystemId = str(body.ecosystemId, 100)
  if (!ecosystemId || !(await canManage(db, ecosystemId, profileId))) {
    return json({ error: 'You do not have permission to manage this ecosystem.' }, 403)
  }

  if (action === 'growth-channel') {
    const mode = SALES_MODE_KEYS.has(body.mode) ? body.mode : 'lead'
    const provider = SALES_PROVIDER_KEYS.has(body.provider) ? body.provider : 'external'
    const providerContract = SALES_PROVIDERS.find((item) => item.key === provider)
    if (!providerContract.supports.includes(mode)) {
      return json({ error: `${providerContract.label} does not support that sales action.` }, 400)
    }
    const paymentHandle = str(body.paymentHandle, 100)
    const handleDestination = paymentHandle ? paymentDestinationFromHandle(provider, paymentHandle) : ''
    if (paymentHandle && !handleDestination) {
      return json({ error: `Enter a valid ${providerContract.label} username.` }, 400)
    }
    const destinationUrl = handleDestination || safeDestination(body.destinationUrl, provider)
    if (!destinationUrl) return json({ error: 'Enter a payment username or connect a secure https checkout, booking, donation, or lead destination.' }, 400)
    const offerName = str(body.offerName, 200)
    if (!offerName) return json({ error: 'Name the offer customers will see.' }, 400)
    const actionLabel = str(body.actionLabel, 80) || (SALES_MODES.find((item) => item.key === mode)?.actionLabel || 'Get started')
    const id = newId('growth_')
    const now = new Date().toISOString()
    const attribution = { source: 'beslyfe', medium: 'ecosystem', campaign: slugify(offerName) }
    await db.sql`
      INSERT INTO growth_channels (
        id, ecosystem_id, owner_profile_id, mode, provider, offer_name,
        action_label, destination_url, status, attribution, created_at, updated_at
      ) VALUES (
        ${id}, ${ecosystemId}, ${profileId}, ${mode}, ${provider}, ${offerName},
        ${actionLabel}, ${destinationUrl}, 'active', ${JSON.stringify(attribution)}::jsonb, ${now}, ${now}
      )
    `
    await db.sql`UPDATE ecosystems SET status = 'active', updated_at = ${now} WHERE id = ${ecosystemId}`
    const rows = await db.sql`SELECT * FROM growth_channels WHERE id = ${id} LIMIT 1`
    return json({ ok: true, item: growthRow(rows[0]) }, 201)
  }

  if (action === 'status') {
    const status = STATUS_KEYS.has(body.status) ? body.status : 'draft'
    const now = new Date().toISOString()
    await db.sql`UPDATE ecosystems SET status = ${status}, updated_at = ${now} WHERE id = ${ecosystemId}`
    const rows = await db.sql`SELECT * FROM ecosystems WHERE id = ${ecosystemId} LIMIT 1`
    return json({ ok: true, item: ecosystemRow(rows[0]) })
  }

  return json({ error: 'Unknown action' }, 400)
}
