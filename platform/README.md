# `platform/` — Beslyfe architecture contracts

This directory defines the reusable platform core behind every Beslyfe ecosystem. A product is configured from a blueprint and capabilities; it is never cloned from another product.

The neutral default is the Beslyfe theme. The original event remains an explicit proof theme under `themes/bakd-on-the-bay/` and never supplies default branding or capabilities.

## Main layers

- `core/`: cross-cutting identity and data primitives.
- `ecosystems/`: configuration contract and business, website, community, event, creator, and nonprofit blueprints.
- `communities/`: the shared-network membership and content-flow rules.
- `growth/`: sales, booking, lead, donation, and optional ticket actions.
- `modules/`: documentation-as-data for capabilities and their concrete runtime surfaces.
- `themes/`: neutral presentation plus isolated ecosystem presets.
- Domain contract folders: trust, consent, AI, analytics, CRM, commerce, conversations, moderation, lifecycle, automation, and operations.

`contracts.mjs` exposes the registry through the platform API so Admin OS and automation can inspect the same source of truth.

## Non-negotiable boundaries

- One identity may belong to many ecosystems.
- Public contributions may strengthen the shared network with origin shown.
- Private and limited-audience data stays inside its selected boundary.
- Ticketing, applications, floor plans, and schedules are optional event tools.
- Websites and businesses do not inherit event modules.
- Payment credentials remain with the chosen provider.
- Capability intent never replaces server-side authorization.

See [`../docs/BESLYFE_ROADMAP.md`](../docs/BESLYFE_ROADMAP.md) for phased execution. Historical proof-era contracts are isolated beneath [`../proof/`](../proof/).
