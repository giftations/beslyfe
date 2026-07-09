# `platform/` — the architecture layer Bak'd On The Bay runs on

This directory is the **platform layer**: the description of the system as an
event *operating system*, not a single website. Bak'd On The Bay is one theme on
it. The point of this layer is that adding a new event is **configuration** —
pick a theme, enter the details — not code.

It is deliberately thin. The platform is not a rewrite; it is a **map of, and a
small amount of glue over, the system that already exists** in `netlify/functions`
and the Netlify Database. The folders below mirror the target architecture, and
every entry names the real tables and functions that implement it. See
`docs/PLATFORM_ARCHITECTURE.md` for the full audit, ADRs and roadmap.

```
platform/
├── core/         cross-cutting entities every event shares (manifest.mjs)
├── modules/      capabilities an event can run (manifest.mjs)
├── themes/       named presets: branding + copy + default modules
│   ├── registry.mjs          single source of truth + resolver
│   ├── bakd-on-the-bay/       ← the flagship, now just a theme
│   ├── food-festival/
│   ├── comic-con/
│   └── business-expo/
└── (api)         the public API is the existing Netlify Functions surface
```

## How a theme becomes a running event

1. **Definition** — each `themes/<key>/theme.mjs` declares `branding` (the CSS
   custom properties the whole site already reads), a default `tagline`, and the
   `modules` an organizer on that theme expects to run.
2. **Resolution** — `themes/registry.mjs` resolves a chosen theme key into the
   fragment stored on `events.settings` (`{ theme, branding, modules }`). No
   schema change: `events.settings` is an existing `jsonb` column.
3. **Creation** — the Admin OS *Events* form offers the theme picker (fed by
   `GET events?themes`). Creating an event stamps the resolved theme onto it.
4. **Rendering** — the public site applies the active event's `branding` as
   `:root` CSS variables (`platform-theme.js`), so a new edition *looks* like its
   theme with zero code. The CMS (`site_settings`) remains an explicit per-page
   override on top.

## Core & modules are a map, not a switch

`core/manifest.mjs` and `modules/manifest.mjs` are **documentation-as-data**:
they name each domain/capability and the concrete tables and functions that
already implement it, and are served read-only via `GET events?platform` (the
Admin OS *System* view reads them). Nothing here gates behavior — the platform
layer describes the real system so future work extends it instead of forking a
parallel one. Module flags on a theme record *intent*, not access control.

`contracts.mjs` gathers the reusable ecosystem, module, relationship, consent,
AI, analytics, and data-boundary contracts behind one registry. The same
`GET events?platform` response exposes it as `contracts` so tools and future
admin surfaces can inspect the whole platform contract without adding a second
endpoint.

Theme shape, override behavior, and accessibility/trust controls are captured in
`themes/contract.mjs` and registered through `contracts.mjs`.

Operator workspace shape, navigation, mutation policies, and Admin OS trust
controls are captured in `admin/os-contract.mjs`.

Authentication, sessions, roles, same-origin writes, password policy, rate
limits, and server-derived identity are captured in `auth/access-control-contract.mjs`.

## Why this and not more folders

The biggest risk called out for this project was bolting on features until the
system fragments. So this layer adds exactly one new runtime concept — the
**theme** — and otherwise just *names* what already exists. Every future module
(AI, notifications broadcast, organization-above-event) lands as another manifest
entry plus a function, never a parallel app or a second datastore.

---

The vision that motivated this layer is recorded verbatim in
`docs/PHASE-16-PLATFORM-BLUEPRINT.md`; `docs/PLATFORM_ARCHITECTURE.md` §7 maps
each blueprint item to what is built versus what remains on the roadmap.
