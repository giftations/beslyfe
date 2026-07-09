# Bak'd On The Bay — Event OS Architecture

This document is the architectural source of truth for the platform. It records
what exists today (a full repository audit), the target architecture (a
multi-tenant Event Operating System), the decisions taken so far, and a phased
roadmap. Read it before making structural changes so we **refactor and
consolidate** rather than duplicate or fork parallel systems.

---

## 1. What this platform is

Bak'd On The Bay is not a website — it is an **Event Operating System**: one
codebase and one database that runs the public marketing site, the application
and approval pipeline, a member community, a directory, a floor plan, a media
library, and a unified admin. The long-term goal is to run **unlimited editions,
venues, and organizations** off the same system, with CRM, advertising, and
business-intelligence layered on top.

The guiding principles:

- **Everything belongs to an event.** No edition, venue, date, or price is
  hardcoded. Adding "Bak'd On The Bay 2027" or a new expo is data entry, not a
  code change.
- **One system, not many.** New capability extends the existing admin shell,
  functions, and schema. We do not stand up parallel apps or duplicate storage.
- **One database.** All application data — including image and video bytes —
  lives in a single Netlify Postgres database. There is no external store.
- **Configurable over hardcoded.** Content, theme, links, and copy are edited in
  the CMS/admin, never in source.

---

## 2. Repository audit (as-built)

### 2.1 Stack & hosting

- **Static frontend** served from the repo root (HTML/CSS/vanilla JS, no build
  step). `netlify.toml` publishes `.` with a no-op build.
- **Netlify Functions** (`netlify/functions/*.mjs`) provide the API using the
  native `@netlify/database` driver (`getDatabase()` + `db.sql` tagged
  templates).
- **Netlify Database (Postgres)** is the single datastore. Drizzle ORM
  (`db/schema.ts`) is the schema source of truth and generates migrations into
  `netlify/database/migrations/`. Functions themselves use raw SQL, not Drizzle.
- **Routing** via `_redirects`: clean public URLs rewrite to the HTML pages, and
  `/admin/*` rewrites into the single Admin OS shell.

### 2.2 Data model (before this change)

| Table | Purpose |
| --- | --- |
| `applications` | Public vendor/sponsor/speaker/DJ/attendee submissions + workflow (status, internal notes, activity timeline). |
| `profiles` | Self-authored public directory listings; free-form `details` jsonb. |
| `accounts` | Member login credentials (PBKDF2), each linked to one profile. |
| `social_posts` / `_comments` / `_likes` / `_follows` | Community feed (posts, reels, stories). |
| `social_messages` | 1:1 direct messages. |
| `social_groups` / `_group_members` / `_group_messages` | Group chats. |
| `social_media` | Member personal media library (bytes in-row). |
| `social_locations` | Shared places on the community map. |
| `site_settings` | Per-page admin-controlled site config (hero, theme, copy, section order, ticketing links). |
| `site_media` | Site-wide media library (bytes in-row). |
| `floorplan` | Draft & published floor-plan layouts. |
| `sessions` | Server-stored login sessions; identity is read from here (never the request body) via the httpOnly `bakd_sid` cookie. |
| `password_resets` | Single-use, expiring, hashed password-reset tokens. |
| `audit_log` | Append-only trail of privileged admin mutations (actor, action, resource, before/after diff, IP). |
| `auth_attempts` | Sliding-window throttling ledger for login/signup/reset/access lookups. |

### 2.3 API surface (Netlify Functions)

`applications`, `auth`, `floorplan`, `groups`, `locations`, `media-library`,
`messages`, `profiles`, `site-media`, `site-settings`, `social`, `events`, and
`audit-log` (an admin-only read view over the audit trail). Each is a single
default-export handler switching on HTTP
method and an `action`/`type`/`kind` parameter. Identity is resolved
server-side from the httpOnly session cookie via `lib/session.mjs`
(`readSession` / `requireSession` / `requireAdmin`) — never from a caller-supplied
id — and admin authority is re-derived from the live account on every privileged
call. See §6 for the full security posture.

### 2.4 Admin OS

A single-page shell (`admin/index.html` → `assets/js/admin-os.js`) with a
persistent sidebar, command palette (⌘K), drawer, toasts, dark/light theme, and
keyboard shortcuts. Modules are self-contained render functions; the rich legacy
editors (Website CMS, Floor Plan, Schedule) are embedded via iframe so **no
functionality was lost** in the consolidation. Modules present: Dashboard,
Analytics, Website CMS, Media Library, Floor Plan, Schedule, Applications, Users,
Vendors, Sponsors, Speakers, Entertainment, Attendees, Directory, Community,
Messages, Finance, Settings, Audit Log, System — and Events.

### 2.5 Gap analysis vs. the Event OS vision

Already strong: unified admin, CMS, media, directory, applications workflow with
CRM-lite (notes + timeline), community, single-database discipline.

Missing (roadmap below): **multi-event scoping** (addressed now), a
**Companies** entity separate from People, full **CRM** fields on people and
companies, an **Advertising** platform, a system-wide **Audit Log**, **marketing
segmentation**, and automatic **SEO** primitives (structured data, sitemap).

---

## 3. Multi-event architecture (this change)

The single most foundational gap was that every entity implicitly belonged to one
hidden event. That blocks running 2027, a second venue, or a different organizer
without cloning the system — the exact anti-pattern this platform exists to
avoid. This change introduces the **event as the tenant root** without disturbing
any existing behavior.

### 3.1 The `events` table

`events` is the top of the ownership hierarchy. Each row is one edition/expo/venue
production with its own name, tagline, venue, location, dates, lifecycle
`status` (`planning` → `active` → `archived`), free-form per-event `settings`
jsonb, and an `is_active` flag. **Exactly one event is active** at a time — the
edition that new public submissions attach to and that the admin operates.

### 3.2 Event scoping of entities

`applications` and `profiles` each gained a nullable-safe `event_id` (text, indexed).
These are the two entities created directly by the public, so they are scoped
first. The relationship is intentionally soft (an id, not a hard FK) to keep
backfill and cross-edition reporting simple, matching the codebase's existing
id-reference style.

### 3.3 Non-breaking rollout

The change is additive and safe by construction:

- New `event_id` columns default to `''` — existing rows and any code that
  ignores the column keep working untouched.
- `events.mjs` **lazily seeds** the flagship edition ("Bak'd On The Bay 2026")
  on first use and **backfills** every unscoped application/profile to it — the
  same self-healing pattern `auth.mjs` uses to ensure a default admin. No data
  migration script or manual step is required.
- New public submissions stamp the active event id. The lookup is best-effort:
  if the events table is ever unavailable, the submission still succeeds with an
  empty `event_id` and is backfilled later. **A member can never be blocked from
  applying by the event layer.**

### 3.4 The Events admin module

A new first-class **Events** module (top "Platform" group in the sidebar) lists
every edition with live per-event counts, lets an admin create editions, edit
their details, and switch which one is active — with the active edition visually
distinguished and protected from deletion. Editions holding applications or
profiles are archived rather than deleted, so history is never orphaned.

---

## 4. Architectural decisions (ADRs, condensed)

- **ADR-1 — Event as tenant root, not per-org multi-tenancy.** We scope by event
  first because the near-term need is multiple editions/venues under one
  operator. Organizations can later become a parent of events without reworking
  event scoping.
- **ADR-2 — Soft `event_id` reference over hard foreign keys.** Matches the
  existing id-reference convention, enables zero-downtime backfill, and keeps
  cross-edition analytics (e.g. "returning vendors") a simple query.
- **ADR-3 — Lazy seed + backfill over a data migration.** Schema migrations stay
  pure DDL (clean `drizzle-kit generate` output); data lifecycle lives in code,
  mirroring the established `auth.mjs` admin-seed pattern. Idempotent and cheap.
- **ADR-4 — Single active event enforced in code.** Activating one edition demotes
  all others, guaranteeing one unambiguous "current" edition without a fragile
  partial unique index.
- **ADR-5 — Extend the Admin OS, never fork it.** Events is a module in the same
  shell; the pattern for every future module (Companies, Advertising, CRM) is the
  same registry entry + render function.

---

## 5. Roadmap (phased, non-duplicating)

Each phase reuses the primitives established here (event scoping, the module
pattern, the single database). Recommended order by business value and dependency:

1. **Companies** — a `companies` table (independent of people), and a
   `company_id` on profiles/applications. People exist once; a company
   participates across editions. Enables sponsorship, advertising, and multi-booth
   modeling. *Value: separates B2B revenue relationships from individuals.*
2. **CRM fields** — extend people and companies with status, tags, lead source,
   pipeline stage, owner, follow-up date, last contact, lifetime value, and a
   unified activity timeline (generalize the one already on `applications`).
   *Value: turns the directory into a sales & relationship engine.*
3. **Advertising platform** — `ad_campaigns` + `ad_placements` + `ad_events`
   (impressions/clicks) scoped by event and sold to companies. *Value: recurring
   revenue; the reason to separate companies first.*
4. **Audit log** — one append-only `audit_log` table written by admin mutations,
   surfaced as a module. *Value: accountability across staff and editions.*
5. **Marketing segmentation** — dynamic audience filters over people/companies
   (region, role, tier, returning vs. first-time) feeding exports and campaigns.
6. **SEO primitives** — per-page metadata, JSON-LD (Organization/Event/FAQ/
   Breadcrumb/Vendor/Speaker), sitemap + image sitemap generation, slug-change
   redirects.
7. **Per-event settings & theming** — move `site_settings` and ticketing links
   under `event_id` so each edition has its own homepage, theme, and links via
   the `events.settings` document already provisioned here.

### Success criteria

The platform runs multiple editions from one admin, scopes every record to an
event, separates companies from people, generates recurring advertising revenue,
supports CRM workflows over a searchable directory, and exposes complete
administrative control — all without editing source code after deployment.

---

## 6. Security & operations hardening

The authentication and admin surface follows a defence-in-depth model. The
mechanisms below are all implemented in `netlify/functions/lib/session.mjs` and
consumed by the individual functions, so the policy lives in one place and
cannot drift between endpoints.

### 6.1 Trustworthy identity

Identity is never taken from the request. On login/signup `createSession` mints
an opaque, server-stored token (row in `sessions`) and returns an httpOnly,
`Secure`, `SameSite=Strict` cookie (`bakd_sid`). Every other function resolves
the caller via `readSession` / `requireSession` / `requireAdmin`, reading the
acting account/role from the session row.

### 6.2 Live admin re-validation

`requireAdmin` does not trust the role captured in the session at login. On every
privileged call it re-reads the account's current `role` and `status`; an admin
who was demoted, rejected, or suspended is refused immediately and their now
powerless session row is deleted, rather than remaining valid until the 30-day
session TTL expires. It fails safe: a transient database error falls back to the
session's captured role instead of locking every admin out.

### 6.3 CSRF: SameSite + same-origin

The session cookie is `SameSite=Strict`, so a browser never attaches it to a
request that originated on another site. As a second layer, state-changing
requests (`POST`/`PUT`/`PATCH`/`DELETE`) pass through `requireSameOrigin`, which
compares the `Origin`/`Referer` host to the request host and returns `403` on a
mismatch. Header-less non-browser clients (server-to-server, tests) are allowed
through so existing integrations keep working — browsers, which always send
`Origin` on cross-site writes, are the ones this blocks.

### 6.4 Rate limiting

Login, signup, password-reset request/confirm, and the public package-access
lookup are throttled by `rateLimit` against the `auth_attempts` table, keyed by
`action + client IP` over a sliding window. Failed logins accumulate toward the
limit and a successful login clears the bucket, so honest users are never
blocked while brute-force and email enumeration are bounded. Throttling fails
open on infrastructure error — it protects the login path, it must never take it
down. Rows are swept once they age past the window.

### 6.5 Audit log

Every privileged mutation appends one immutable row to `audit_log` via
`recordAudit`: actor account, action, resource, a small JSON diff (e.g. status
before/after), and client IP. Coverage now spans every admin surface —
application review/status/delete, event create/update/activate/delete, admin
sign-in, **profile status/featured/edit/delete, site-media delete, and
site-settings save**. Writes are best-effort and never fail the operation they
record. The table is insert-only in application code.

The log is surfaced read-only in the Admin OS under **Operations → Audit Log**,
backed by a dedicated admin-only endpoint (`audit-log`). The view is newest-first,
filterable by action and resource type, resolves each actor's current display
name from the live account, and pages older entries with a timestamp cursor. The
endpoint has no write path, preserving the append-only intent.

### 6.6 Password policy

Passwords are validated by a shared `passwordPolicyError` helper at every point
one is set (sign-up and password reset). Ordinary member credentials must be at
least 8 characters; an admin-capable account must be at least 12 and mix three of
four character classes (lowercase, uppercase, digits, symbols). The policy is
enforced only when a password is *set*, so existing accounts are never locked
out — the bar rises going forward. Client-side hints and `minlength` attributes
were aligned to the same floor.

### 6.7 Admin shell verification

`admin/index.html` and `admin-os.js` keep a `localStorage` fast-fail for a
flash-free load, but the shell now also verifies the session **server-side**
(`GET auth?action=session`, which reads the httpOnly cookie the client cannot
forge) before it is trusted; a non-admin response clears local state and
redirects to login. Privileged data was already protected server-side by
`requireAdmin`; this stops the shell painting for a spoofed client.

### 6.8 Server-side business rules & data integrity

Validation that used to rely on the client is enforced in the functions — e.g.
`events` rejects an edition whose end date precedes its start (`startsAt <=
endsAt`) on both create and update. Deleting a group an owner leaves now removes
its messages, memberships and the group itself in a **single atomic statement**
(a CTE), so a mid-way failure can no longer orphan messages or memberships. The
group-detail read also derives the viewer's membership from the roster it already
loads instead of issuing a separate existence query, removing a round-trip.

### 6.9 Release-candidate performance & bounded reads

A pass over the hot read/write paths removed avoidable per-row work and unbounded
reads without changing any response shape, URL or stored data:

- **Feed counts (`social.mjs`).** The reels, single-author and home-timeline
  queries previously carried two *correlated* count subqueries evaluated once per
  returned row (up to 2×N dependent scans). They now pre-aggregate likes and
  comments once via grouped `LEFT JOIN`s and `COALESCE` to zero — two aggregate
  scans regardless of page size. Output is identical.
- **DM thread list (`messages.mjs`).** The conversation list resolved each
  partner's profile with its own query (N+1). Partner ids are now fetched in a
  single `id = ANY(...)` batch and indexed in memory; the "Former member"
  fallback for a deleted profile is preserved.
- **CRM people (`crm.mjs`).** `listPeople` no longer reads the entire
  `crm_person_roles` table into JS to build role sets — the roles are aggregated
  database-side (`array_agg` / `GROUP BY`), bounding the returned volume to the
  people actually listed. Counts and role lists are unchanged.
- **Ad analytics (`dashboards.mjs`).** `loadAdCore` reads `ad_creatives` with
  `DISTINCT campaign_id, placement`, collapsing the per-creative rows to the
  campaign×placement pairs the ROI/email rollups consume, so a campaign with many
  creatives no longer scales the read. Delivery and invoice reads were already
  `GROUP BY`-aggregated.
- **Media uploads (`media-library.mjs`).** The size ceiling is now also checked
  *before* decoding, using the base64 length (`bytes ≈ len × 3/4`), so a single
  oversized request can no longer pin more than the ceiling in memory. The exact
  post-decode check remains the authority.
- **Event integrity (`events.mjs`).** Slug uniqueness relies on the
  `events_slug_idx` unique index — `INSERT … ON CONFLICT ("slug") DO NOTHING
  RETURNING` with a bounded suffix retry — instead of a check-then-act read that
  could 500 on a concurrent same-slug create. Deletion keeps its friendly,
  specific guard messages but performs the removal as a single atomic conditional
  `DELETE … WHERE … RETURNING`, so a state change racing in after the guards
  (a concurrent activation, or records attached to the edition) yields a `409`
  rather than an orphaning delete. This mirrors the group-deletion CTE pattern in
  6.8 and needs **no schema change**.

### 6.10 Release-candidate hardening (this change)

A follow-up pass closed the remaining audit items across the authentication,
advertising, reporting and admin-shell surfaces. Every change is additive and
required **no schema change**; no response shape, URL or stored record changed.

- **Administrator seeding cadence (`auth.mjs`).** Re-establishing the built-in
  admin credential used to run on *every* login — a PBKDF2 derivation plus a
  write to `accounts` on the busiest path. It now runs once per cold instance
  and additionally whenever a login explicitly targets an administrator identity,
  so rotation and self-healing are preserved while the per-sign-in write
  amplification (a minor DoS amplifier) is removed.
- **Constant-time password comparison (`auth.mjs` / `lib`).** Login compares the
  derived hash with `timingSafeEqualHex`, a fixed-work comparison, closing the
  timing side-channel a short-circuiting `!==` opened.
- **One password floor everywhere (`applications.mjs`).** Application intake
  enforced only six characters while sign-up and reset required eight. All three
  account-creation paths now call the shared `passwordPolicyError`, so no path
  admits a weaker credential. Client `minlength` hints were already at eight.
- **Audit-log filter allowlist (`audit-log.mjs`).** The `action` /
  `resourceType` filters are validated against the log's own distinct values
  before use; an unrecognised filter falls back to "no filter" and the applied
  filters are echoed back, so nothing attacker-controlled is reflected into the
  admin filter UI.
- **Operational visibility (`lib`, `dashboards.mjs`, `ads.mjs`).** A small
  structured JSON logger (`logEvent`/`logError`/`logWarn`, each carrying a
  scope and never able to throw) replaces scattered `console.warn(string)`
  calls. The executive-dashboard query helper now logs a genuine query *failure*
  (labelled by dataset) instead of silently returning an empty set, and ad
  impression/click logging failures are recorded rather than discarded — so a
  count that goes quiet is attributable to a fault, not mistaken for zero traffic.
- **Fair ad rotation (`ads.mjs`).** Weighted creative selection is seeded from
  the platform CSPRNG (`crypto.getRandomValues`, with rejection sampling to
  remove modulo bias) instead of the wall clock, so rotation is fair and
  unpredictable even under bursts within the same millisecond.
- **Sliding session renewal (`lib`).** An actively-used session slides its
  expiry forward when it enters its final third of life, and the refreshed cookie
  is re-armed on the `auth?action=session` read the shell polls on load, so an
  engaged member is not logged out on the fixed 30-day boundary while an idle
  token still lapses at its last-renewed deadline.
- **Shared request parsing & member-list paging.** A single `readJsonBody`
  helper collapses the duplicated parse/try-catch/validate block (adopted by
  auth, profiles, groups and media-library), and the admin member list gained
  optional `before`/`limit` keyset pagination whose defaults reproduce the prior
  single-shot behaviour.
- **Profile email validation (`profiles.mjs`).** A non-empty email on profile
  create/update is checked against a light format rule; blank remains allowed for
  name-only profiles.
- **Broader audit coverage (`media-library.mjs`).** Deleting member media — a
  destructive member-facing action — now appends an audit row, matching the
  coverage the admin surfaces already have.
- **Admin OS accessibility (`assets/js/admin-os.js`).** The drawer, command
  palette and confirm dialog are now proper `role="dialog"`/`aria-modal`
  overlays: opening one moves focus inside and traps Tab, Escape closes it, and
  focus returns to the triggering control on close. The palette exposes
  `role="listbox"`/`option` semantics with `aria-activedescendant` tracking the
  keyboard selection.

**Admin-shell session contract (localStorage).** The shell keeps a `localStorage`
mirror of the signed-in identity purely as a *flash-free paint hint*: it lets the
UI render immediately instead of blanking on every load. It is never trusted for
authority. On load the shell calls `GET auth?action=session` (which reads the
httpOnly cookie the client cannot forge) and reconciles: a non-admin or absent
server session clears the mirror and redirects to login, regardless of what
localStorage claimed. Every privileged datum is independently gated server-side
by `requireAdmin`. The mirror may therefore be stale or absent without any
security consequence — the server session is the sole source of truth.

**Testing.** A hermetic smoke suite (`tests/`, `npm test`, `node --test`) covers
the constant-time compare, password policy, CSRF same-origin guard and body
parsing; `tests/README.md` documents manual permission/CSRF checks against
`netlify dev`. The suite is not run by the Netlify build.

### Migrations

The `audit_log` and `auth_attempts` tables are added by a new roll-forward
Drizzle migration (`db/schema.ts` → `drizzle-kit generate`). No previously
applied migration is edited. The extended audit coverage, audit view, password
policy, group changes and the §6.10 release-candidate hardening above required
**no schema change** — they build on the existing tables. `ADMIN_PASSWORD` must
be set for the environment so the internal admin credential is established/rotated
on next login.

---

## 7. The theme layer (this change)

The multi-event work in §3 made every record belong to an event. This change
takes the next architectural step from the roadmap (item 5.7): it makes an event
belong to a **theme**, so **Bak'd On The Bay is now just one theme** on the
platform. Creating a new edition is "pick a theme + enter details" — not code.

### 7.1 Where themes live

A new top-level `platform/` directory is the architecture layer the rest of the
system runs on. It is intentionally thin — it *names* the system that already
exists and adds exactly one new runtime concept, the theme:

- `platform/themes/registry.mjs` — the single source of truth. Imports the four
  seed themes and exposes `listThemes()`, `getTheme()`, and
  `resolveThemeSettings(key)`.
- `platform/themes/<key>/theme.mjs` — one preset each for **bakd-on-the-bay**,
  **food-festival**, **comic-con** and **business-expo**. A theme declares
  `branding` (the CSS custom properties the whole site already reads), a default
  `tagline`, and the `modules` an organizer on that theme expects to run.
- `platform/core/manifest.mjs` and `platform/modules/manifest.mjs` —
  documentation-as-data mapping each core entity and module to the concrete
  tables/functions that already implement it. Served read-only via
  `GET events?platform`; they gate nothing.
- `platform/README.md` — the layer's own overview.

### 7.2 No schema change

A theme is stored on the existing `events.settings` `jsonb` column as
`{ theme, branding, modules }`. `resolveThemeSettings` turns a theme key into that
fragment. Nothing in the database changed — this builds entirely on the settings
document §3.1 already provisioned.

### 7.3 How it flows end to end

- **Seed.** The flagship edition is now seeded on the `bakd-on-the-bay` theme, so
  the platform is never in an un-themed state, and because that theme mirrors the
  site's original `style.css` palette, the live site is unchanged.
- **Create.** `events.mjs` accepts a `theme` key on create and stamps the
  resolved fragment onto the new edition. Unknown/absent keys fall back to the
  default so an event is never theme-less. The Admin OS *Events* form offers a
  theme picker (fed by `GET events?themes`) with a live palette preview and a
  default-tagline assist.
- **Update.** An admin may re-theme an existing edition, but only with a *known*
  key — an unrecognised value is ignored rather than silently reset to default,
  and the resolved fragment is merged over existing settings so other keys
  survive.
- **Render.** `platform-theme.js` (loaded on the public homepage before the CMS
  loader) reads the active edition's `branding` and applies it as `:root` CSS
  variables. It is the **base layer**: the per-page CMS theme
  (`site_settings.theme`) still applies on top as an explicit override, and if
  there is no active event or branding the hand-authored `style.css` defaults
  stand.

### 7.4 Decisions

- **ADR-6 — Theme as data on `events.settings`, not a new table.** Reuses the
  provisioned settings document, needs no migration, and keeps a theme a pure
  presentation preset. A theme table can come later if themes gain their own
  lifecycle.
- **ADR-7 — Registry as the single source; the browser reads it via the API.**
  The four theme folders honour the target architecture, but one registry module
  assembles them, and the browser consumes `GET events?themes` rather than
  importing across directories — no build-time coupling to maintain.
- **ADR-8 — Event theme is the base, CMS theme the override.** The two theming
  mechanisms compose by layering instead of competing: platform theme sets the
  defaults, the CMS wins where an admin has set explicit colours.

This required **no schema change** and is additive by construction; no response
shape, URL or stored record changed for any existing edition.
