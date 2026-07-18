# Beslyfe Repository Structure

This repository contains both the current Bak'd On The Bay proof ecosystem and
the reusable Beslyfe platform layer that is being extracted from it.

The rule is simple: keep one working system while making reusable boundaries
clearer over time. Do not create parallel apps, duplicate data models, or move
product behavior before the platform contract for that behavior is clear.

## Top-Level Ownership

| Path | Ownership | Purpose |
| --- | --- | --- |
| `MANIFESTO.md` | Platform culture | North star for what Beslyfe builds and refuses to build. |
| `CONSTITUTION.md` | Platform governance | Rules every engineer, designer, and AI should honor. |
| `docs/` | Architecture and planning | Durable decisions, phased execution, trust rules, domain readiness, and extraction maps. |
| `platform/` | Reusable platform contracts | Documentation-as-data for modules, relationships, opportunities, consent, analytics, boundaries, themes, and core entities. |
| `netlify/functions/` | Runtime API | Netlify Functions that power the current product and future reusable platform capabilities. |
| `netlify/functions/lib/` | Shared API infrastructure | Session, security, email, and notification helpers used by runtime functions. |
| `netlify/database/migrations/` | Database history | Netlify Database migrations generated from the schema and preserved as history. |
| `db/` | Schema source | Drizzle schema and database configuration. |
| `admin/` | Admin entrypoint | Single Admin OS shell entry route. |
| `assets/` | Shared frontend assets | CSS, JavaScript, images, icons, and downloadable product assets. |
| root `*.html`, `*.js`, `*.css` | Current ecosystem surfaces | Public pages and feature screens for the Bak'd On The Bay proof ecosystem. |
| `tests/` | Regression safety | Fast Node tests for contracts, security helpers, platform responses, and integration-normalization logic. |

## What Belongs In `platform/`

`platform/` is the reusable architecture layer. It should name contracts and
configuration before runtime systems depend on them.

Good fits:

- Domain maps such as core entities, modules, relationships, opportunities, and
  data boundaries.
- Trust, consent, AI, and analytics contracts.
- Theme presets and registries that let ecosystems differ without forking code.
- Documentation-as-data used by Admin/System, tests, or future tooling.

Poor fits:

- Product-specific copy, pricing, event dates, venue layouts, or one-off rules.
- Runtime database mutations that belong in `netlify/functions/`.
- Temporary shortcuts that only make the current event easier to hardcode.

## What Belongs In `netlify/functions/`

Functions are the runtime API. They should implement behavior once and remain
scoped by ecosystem, event, account, role, consent, and data boundary.

When adding a function or endpoint:

- Reuse `netlify/functions/lib/session.mjs` for identity, admin checks, same
  origin protection, audit logging, request ids, and JSON parsing.
- Use existing event, account, profile, CRM, media, and audit patterns before
  creating new ones.
- Keep read-only platform metadata database-free when it does not need stored
  data.
- Record privileged mutations in `audit_log` where an admin decision changes
  platform data.

## What Belongs In `docs/`

`docs/` is for durable decisions, not scratch notes.

Add or update docs when a change affects:

- Platform identity, domain readiness, or product boundaries.
- Module extraction, data ownership, trust, AI, consent, or analytics.
- Repository structure, architecture direction, or phased execution status.

## What Belongs In Root Product Files

The root public files are the working proof ecosystem. They should keep Bak'd On
The Bay usable while reusable platform contracts are extracted.

Product-specific content can stay here until it is deliberately generalized.
When a pattern appears reusable across ecosystems, document the platform
contract first, then move behavior behind the existing runtime and Admin OS
patterns in a later PR.

## PR Boundary Rules

- Keep PRs under 20 changed files.
- Prefer adding or tightening one contract at a time.
- Double-test main after every merged PR before starting the next phase.
- Do not move files just to make the tree look cleaner; move only when the
  runtime boundary is understood and tested.
- Never duplicate working functionality to make a new platform layer appear
  complete.

## Current Direction

Beslyfe is moving from a working event ecosystem toward reusable enterprise
platform software. The structure should make future extraction obvious:

1. Define the reusable contract.
2. Expose it through the platform registry or Admin/System when useful.
3. Add tests that protect the contract.
4. Refactor runtime behavior only when the boundary is clear.
