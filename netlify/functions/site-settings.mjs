import { getDatabase } from '@netlify/database'
import { requireAdmin, requireSameOrigin, recordAudit, readSession, isLiveAdmin } from './lib/session.mjs'

// One JSON document per page describing every admin-controlled setting that
// should publish to the live site for all visitors. Read on every page load,
// written whenever an admin saves a change. The page is selected with a
// `?page=<slug>` query parameter; the homepage uses the historical `homepage`
// key so existing saved settings keep working. Stored as a row in the
// `site_settings` table so all of the site's data lives in the database.
const DEFAULT_PAGE = 'homepage'
const PAGE_RE = /^[a-z0-9][a-z0-9-]{0,59}$/

// Resolve the storage key for the requested page. Unknown/invalid slugs fall
// back to the homepage so a stray request can never read or write a junk key.
function pageKey(url) {
  const raw = (url.searchParams.get('page') || DEFAULT_PAGE).trim().toLowerCase()
  return PAGE_RE.test(raw) ? raw : DEFAULT_PAGE
}

// Content settings form fields. Their values double as section-visibility
// toggles on the homepage (an empty string hides the matching section).
const CONTENT_FIELDS = ['floorPlan', 'vendors', 'speakers', 'dj', 'sponsors', 'siteLayout', 'siteTheme']

// Homepage sections that may be reordered (must match the homepage DOM ids).
const SECTION_IDS = [
  'featured-event', 'about', 'stats', 'education-station',
  'sponsors', 'vendors', 'entertainment', 'venue', 'schedule', 'join',
]

// Background positions the admin may choose for the hero image.
const HERO_POSITIONS = new Set([
  'center', 'top', 'bottom', 'left', 'right',
  'top left', 'top right', 'bottom left', 'bottom right',
])

const MAX_CONTENT_LEN = 5000
const MAX_EVENT_NAME_LEN = 200
const MAX_TEXT_LEN = 2000      // per editable text node
const MAX_LABEL_LEN = 120      // per button label
const MAX_HREF_LEN = 500       // per button link
const MAX_KEYS = 300           // guard against unbounded maps
const MAX_SCHEDULE_SLOTS = 60  // a full event day at 30-minute resolution
const KEY_RE = /^[a-zA-Z0-9._-]{1,60}$/
const HEX_RE = /^#[0-9a-fA-F]{6}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

function defaults() {
  return {
    published: true,
    featuredEvent: null,
    // Eventbrite purchase links revealed only to approved vendors/sponsors.
    eventbriteVendorUrl: null,
    eventbriteSponsorUrl: null,
    // The shared password that unlocks the password-protected Eventbrite ticket
    // pages. Like the links above, it is a secret that must never ship to the
    // public site — it is stripped from the unauthenticated GET below and only
    // handed to an applicant the database confirms is approved.
    eventbritePassword: null,
    heroBackground: null,
    heroBackgroundKind: null, // 'image' | 'video' — how to render heroBackground
    heroOverlay: null,      // 0-90 darkness % over the hero image
    heroPosition: null,     // one of HERO_POSITIONS
    theme: null,            // { brand, bg } hex colors
    template: null,         // id of the last applied template (record only)
    texts: {},              // key -> string overrides for homepage copy
    buttons: {},            // key -> { label, href, hidden } overrides
    brand: null,            // { text, image, showText, showImage } for the navbar logo
    sectionTransparency: {}, // homepage section id -> true when its background should be transparent
    sectionOrder: null,
    content: {},
    speakerSchedule: [], // [{ time, name, topic, image, profileId }] for the homepage education schedule
    updatedAt: null,
  }
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  })
}

// The hero background is injected into a CSS url(...) on the homepage, so only
// allow safe, self-hosted references: site-relative paths and our own media
// function. Reject anything containing characters that could break out of the
// url() context.
function sanitizeHeroBackground(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') return null
  const v = value.trim()
  if (!v) return null
  if (/['"()\s;<>\\]/.test(v)) return null
  if (!v.startsWith('/')) return null // site-relative only
  return v
}

// Button links are applied to anchor href attributes. Only allow a safe set of
// schemes/prefixes so an admin (or a tampered request) cannot inject
// javascript: or data: URLs.
function sanitizeHref(value) {
  if (value === null || value === undefined) return undefined
  if (typeof value !== 'string') return undefined
  const v = value.trim().slice(0, MAX_HREF_LEN)
  if (v === '') return ''
  if (/[\s<>"'`\\]/.test(v)) return undefined
  if (v.startsWith('/') || v.startsWith('#')) return v
  if (/^https?:\/\//i.test(v)) return v
  if (/^mailto:/i.test(v) || /^tel:/i.test(v)) return v
  return undefined
}

// Eventbrite purchase links are surfaced to approved applicants and opened in a
// new tab, so they must be safe absolute https URLs. We reject anything that
// could break out of an href or carry an unexpected scheme, but we are forgiving
// about the scheme itself: an admin who pastes "eventbrite.com/e/123" or an
// "http://…" link gets a working https link saved rather than having the value
// silently discarded. Silent discarding was why the Finance section reported the
// links as "Not set" even though the admin believed they had entered them.
function sanitizeEventbriteUrl(value) {
  if (typeof value !== 'string') return null
  let v = value.trim().slice(0, MAX_HREF_LEN)
  if (!v) return null
  // Characters that could break out of an href / smuggle a scheme never appear
  // in a real ticket URL.
  if (/[\s<>"'`\\]/.test(v)) return null
  if (/^http:\/\//i.test(v)) v = 'https://' + v.slice(7)        // upgrade http → https
  else if (/^https:\/\//i.test(v)) { /* already an https URL */ }
  else if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return null          // any other explicit scheme → unsafe
  else v = 'https://' + v.replace(/^\/+/, '')                   // no scheme → assume https
  // Require a host that at least looks like a domain (has a dot before any path).
  const host = v.slice('https://'.length).split('/')[0]
  if (!host || host.indexOf('.') === -1) return null
  return v.slice(0, MAX_HREF_LEN)
}

// Settings fields that gate a purchase and therefore must never be exposed on the
// unauthenticated GET. They are read server-side (by the applications function,
// which only reveals them to an approved applicant) and returned by this endpoint
// only to a signed-in admin so the editor can display and edit them.
const SENSITIVE_FIELDS = ['eventbriteVendorUrl', 'eventbriteSponsorUrl', 'eventbritePassword']

// The Eventbrite access password is free-form text the applicant types into
// Eventbrite verbatim, so we only trim and length-cap it — no URL/scheme rules
// apply. An empty value clears it (keeps the ticket page from advertising a blank
// password).
function sanitizeEventbritePassword(value) {
  if (typeof value !== 'string') return null
  const v = value.trim().slice(0, MAX_LABEL_LEN)
  return v || null
}

function sanitizeContent(incoming) {
  const out = {}
  if (incoming && typeof incoming === 'object') {
    for (const field of CONTENT_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(incoming, field)) {
        const val = incoming[field]
        out[field] = typeof val === 'string' ? val.slice(0, MAX_CONTENT_LEN) : ''
      }
    }
  }
  return out
}

// Map of key -> string. Values are plain text (applied via textContent on the
// homepage, so no markup is interpreted). Unknown-shaped keys are dropped.
function sanitizeTexts(incoming) {
  const out = {}
  if (!incoming || typeof incoming !== 'object') return out
  let count = 0
  for (const key of Object.keys(incoming)) {
    if (count >= MAX_KEYS) break
    if (!KEY_RE.test(key)) continue
    const val = incoming[key]
    if (typeof val !== 'string') continue
    out[key] = val.slice(0, MAX_TEXT_LEN)
    count++
  }
  return out
}

function sanitizeHexColor(value) {
  if (typeof value !== 'string') return undefined
  const v = value.trim()
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : undefined
}

// Map of key -> { label?, href?, hidden?, bgColor?, textColor? }. Each field is
// optional so partial edits merge cleanly onto the stored button.
function sanitizeButtons(incoming) {
  const out = {}
  if (!incoming || typeof incoming !== 'object') return out
  let count = 0
  for (const key of Object.keys(incoming)) {
    if (count >= MAX_KEYS) break
    if (!KEY_RE.test(key)) continue
    const raw = incoming[key]
    if (!raw || typeof raw !== 'object') continue
    const btn = {}
    if (Object.prototype.hasOwnProperty.call(raw, 'label') && typeof raw.label === 'string') {
      btn.label = raw.label.slice(0, MAX_LABEL_LEN)
    }
    if (Object.prototype.hasOwnProperty.call(raw, 'href')) {
      const href = sanitizeHref(raw.href)
      if (href !== undefined) btn.href = href
    }
    if (Object.prototype.hasOwnProperty.call(raw, 'hidden')) {
      btn.hidden = !!raw.hidden
    }
    if (Object.prototype.hasOwnProperty.call(raw, 'bgColor')) {
      const bgColor = sanitizeHexColor(raw.bgColor)
      if (bgColor !== undefined) btn.bgColor = bgColor
    }
    if (Object.prototype.hasOwnProperty.call(raw, 'textColor')) {
      const textColor = sanitizeHexColor(raw.textColor)
      if (textColor !== undefined) btn.textColor = textColor
    }
    if (Object.keys(btn).length === 0) continue
    out[key] = btn
    count++
  }
  return out
}

function sanitizeTheme(value) {
  if (value === null) return null
  if (!value || typeof value !== 'object') return undefined
  const out = {}
  if (typeof value.brand === 'string' && HEX_RE.test(value.brand.trim())) {
    out.brand = value.brand.trim().toUpperCase()
  }
  if (Object.prototype.hasOwnProperty.call(value, 'bg') && value.bg === null) {
    out.bg = null
  }
  if (typeof value.bg === 'string' && HEX_RE.test(value.bg.trim())) {
    out.bg = value.bg.trim().toUpperCase()
  }
  return Object.keys(out).length ? out : undefined
}

function sanitizeBrand(value) {
  if (value === null) return null
  if (!value || typeof value !== 'object') return undefined
  const out = {}
  if (Object.prototype.hasOwnProperty.call(value, 'text')) {
    out.text = typeof value.text === 'string' ? value.text.trim().slice(0, MAX_LABEL_LEN) : ''
  }
  if (Object.prototype.hasOwnProperty.call(value, 'image')) {
    out.image = sanitizeImageRef(value.image)
  }
  if (Object.prototype.hasOwnProperty.call(value, 'showText')) {
    out.showText = value.showText !== false
  }
  if (Object.prototype.hasOwnProperty.call(value, 'showImage')) {
    out.showImage = value.showImage === true
  }
  if (value.style && typeof value.style === 'object') {
    const style = {}
    if (Object.prototype.hasOwnProperty.call(value.style, 'logoFontSize')) {
      const n = Number(value.style.logoFontSize)
      if (Number.isFinite(n)) style.logoFontSize = Math.max(1, Math.min(2, Math.round(n * 100) / 100))
    }
    if (Object.prototype.hasOwnProperty.call(value.style, 'logoImageHeight')) {
      const n = Number(value.style.logoImageHeight)
      if (Number.isFinite(n)) style.logoImageHeight = Math.max(32, Math.min(88, Math.round(n)))
    }
    if (Object.prototype.hasOwnProperty.call(value.style, 'linkFontSize')) {
      const n = Number(value.style.linkFontSize)
      if (Number.isFinite(n)) style.linkFontSize = Math.max(0.75, Math.min(1.05, Math.round(n * 100) / 100))
    }
    if (Object.keys(style).length) out.style = style
  }
  return out
}

function sanitizeSectionOrder(value) {
  if (!Array.isArray(value)) return undefined
  const seen = new Set()
  const order = []
  for (const id of value) {
    if (typeof id === 'string' && SECTION_IDS.includes(id) && !seen.has(id)) {
      seen.add(id)
      order.push(id)
    }
  }
  return order
}

function sanitizeSectionTransparency(value) {
  const out = {}
  if (!value || typeof value !== 'object') return out
  for (const id of SECTION_IDS) {
    if (Object.prototype.hasOwnProperty.call(value, id)) {
      out[id] = value[id] === true
    }
  }
  return out
}

// Image references for the speaker schedule are rendered into <img src> on the
// homepage. Accept only our own media function / site-relative paths and absolute
// https URLs, and reject anything carrying quotes, spaces or an unexpected scheme.
function sanitizeImageRef(value) {
  if (typeof value !== 'string') return ''
  const v = value.trim().slice(0, MAX_HREF_LEN)
  if (!v) return ''
  if (/[\s<>"'`\\]/.test(v)) return ''
  if (v.startsWith('/')) return v
  if (/^https:\/\//i.test(v)) return v
  return ''
}

// The homepage speaker schedule: an ordered list of 30-minute slots, each with a
// time, the speaker's name, an optional topic and an optional image (their
// headshot or an uploaded photo). Sorted by time so the running order is stable.
function sanitizeSpeakerSchedule(value) {
  if (!Array.isArray(value)) return undefined
  const out = []
  for (const raw of value) {
    if (out.length >= MAX_SCHEDULE_SLOTS) break
    if (!raw || typeof raw !== 'object') continue
    const time = typeof raw.time === 'string' && TIME_RE.test(raw.time.trim()) ? raw.time.trim() : ''
    const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, MAX_EVENT_NAME_LEN) : ''
    const topic = typeof raw.topic === 'string' ? raw.topic.trim().slice(0, MAX_TEXT_LEN) : ''
    const image = sanitizeImageRef(raw.image)
    const profileId = typeof raw.profileId === 'string' ? raw.profileId.trim().slice(0, 120) : ''
    // A slot needs at least a time and a name to be meaningful.
    if (!time || !name) continue
    out.push({ time, name, topic, image, profileId })
  }
  out.sort((a, b) => a.time.localeCompare(b.time))
  return out
}

// Build the next document by merging only the recognised fields present in the
// request body onto the current stored document, so each admin action can save
// just the field(s) it changes.
function mergeSettings(current, body) {
  const next = { ...defaults(), ...current }

  if (Object.prototype.hasOwnProperty.call(body, 'published')) {
    next.published = !!body.published
  }
  if (Object.prototype.hasOwnProperty.call(body, 'featuredEvent')) {
    const fe = body.featuredEvent
    next.featuredEvent = typeof fe === 'string' ? fe.trim().slice(0, MAX_EVENT_NAME_LEN) : null
  }
  if (Object.prototype.hasOwnProperty.call(body, 'eventbriteVendorUrl')) {
    next.eventbriteVendorUrl = sanitizeEventbriteUrl(body.eventbriteVendorUrl)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'eventbriteSponsorUrl')) {
    next.eventbriteSponsorUrl = sanitizeEventbriteUrl(body.eventbriteSponsorUrl)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'eventbritePassword')) {
    next.eventbritePassword = sanitizeEventbritePassword(body.eventbritePassword)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'heroBackground')) {
    next.heroBackground = sanitizeHeroBackground(body.heroBackground)
    if (next.heroBackground === null) next.heroBackgroundKind = null
  }
  if (Object.prototype.hasOwnProperty.call(body, 'heroBackgroundKind')) {
    const k = typeof body.heroBackgroundKind === 'string' ? body.heroBackgroundKind.trim().toLowerCase() : ''
    next.heroBackgroundKind = (k === 'image' || k === 'video') ? k : null
  }
  if (Object.prototype.hasOwnProperty.call(body, 'heroOverlay')) {
    const n = Number(body.heroOverlay)
    next.heroOverlay = Number.isFinite(n) ? Math.max(0, Math.min(90, Math.round(n))) : null
  }
  if (Object.prototype.hasOwnProperty.call(body, 'heroPosition')) {
    const p = typeof body.heroPosition === 'string' ? body.heroPosition.trim().toLowerCase() : ''
    next.heroPosition = HERO_POSITIONS.has(p) ? p : null
  }
  if (Object.prototype.hasOwnProperty.call(body, 'theme')) {
    const t = sanitizeTheme(body.theme)
    if (t !== undefined) next.theme = t
  }
  if (Object.prototype.hasOwnProperty.call(body, 'template')) {
    next.template = typeof body.template === 'string' ? body.template.slice(0, 60) : null
  }
  if (Object.prototype.hasOwnProperty.call(body, 'texts')) {
    next.texts = { ...(next.texts || {}), ...sanitizeTexts(body.texts) }
  }
  if (Object.prototype.hasOwnProperty.call(body, 'buttons')) {
    const merged = { ...(next.buttons || {}) }
    const incoming = sanitizeButtons(body.buttons)
    for (const key of Object.keys(incoming)) {
      merged[key] = { ...(merged[key] || {}), ...incoming[key] }
    }
    next.buttons = merged
  }
  if (Object.prototype.hasOwnProperty.call(body, 'brand')) {
    const brand = sanitizeBrand(body.brand)
    if (brand !== undefined) next.brand = brand
  }
  if (Object.prototype.hasOwnProperty.call(body, 'sectionTransparency')) {
    next.sectionTransparency = {
      ...(next.sectionTransparency || {}),
      ...sanitizeSectionTransparency(body.sectionTransparency),
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, 'sectionOrder')) {
    const order = sanitizeSectionOrder(body.sectionOrder)
    next.sectionOrder = body.sectionOrder === null ? null : (order ?? next.sectionOrder)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'content')) {
    next.content = { ...(next.content || {}), ...sanitizeContent(body.content) }
  }
  if (Object.prototype.hasOwnProperty.call(body, 'speakerSchedule')) {
    const schedule = sanitizeSpeakerSchedule(body.speakerSchedule)
    if (schedule !== undefined) next.speakerSchedule = schedule
  }

  next.updatedAt = new Date().toISOString()
  return next
}

export default async (req) => {
  const db = getDatabase()
  const url = new URL(req.url)
  const KEY = pageKey(url)

  if (req.method === 'GET') {
    const rows = await db.sql`SELECT "data" FROM site_settings WHERE "page" = ${KEY} LIMIT 1`
    const stored = rows.length ? rows[0].data : null
    const settings = { ...defaults(), ...(stored || {}) }
    // The purchase links and Eventbrite password gate a paid action, so they are
    // never returned to the public. Only a signed-in admin (who edits them) sees
    // them here; approved applicants receive them through the applications
    // function, which verifies approval first.
    const admin = await isLiveAdmin(await readSession(req, db), db)
    if (!admin) {
      for (const field of SENSITIVE_FIELDS) delete settings[field]
    }
    return json(settings, 200, { 'Cache-Control': 'no-store' })
  }

  if (req.method === 'PUT' || req.method === 'POST') {
    const cross = requireSameOrigin(req)
    if (cross) return cross
    const admin = await requireAdmin(req, db)
    if (admin instanceof Response) return admin
    let body
    try {
      body = await req.json()
    } catch {
      return json({ error: 'Invalid JSON' }, 400)
    }
    if (!body || typeof body !== 'object') {
      return json({ error: 'Expected a JSON object' }, 400)
    }
    const existing = await db.sql`SELECT "data" FROM site_settings WHERE "page" = ${KEY} LIMIT 1`
    const current = existing.length ? (existing[0].data || {}) : {}
    const next = mergeSettings(current, body)
    await db.sql`
      INSERT INTO site_settings ("page", "data", "updated_at")
      VALUES (${KEY}, ${JSON.stringify(next)}::jsonb, ${next.updatedAt})
      ON CONFLICT ("page") DO UPDATE SET "data" = EXCLUDED."data", "updated_at" = EXCLUDED."updated_at"
    `
    await recordAudit(db, req, admin, {
      action: 'settings.update', resourceType: 'site_settings', resourceId: KEY,
      details: { page: KEY, fields: Object.keys(body || {}).filter((k) => k !== 'updatedAt').slice(0, 30) },
    })
    return json({ ok: true, settings: next })
  }

  return json({ error: 'Method Not Allowed' }, 405)
}
