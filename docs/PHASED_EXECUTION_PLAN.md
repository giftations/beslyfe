# Beslyfe Phased Execution Plan

Beslyfe is the parent platform and company repository.

Bak'd On The Bay is the first ecosystem product created with Beslyfe software.

This plan governs how the platform and first ecosystem product should evolve without sacrificing long-term architecture.

## Operating Rules

Never commit more than 20 files to a single pull request.

Every pull request must have a clear phase, scope, and reason.

Every pull request must preserve the distinction between:

- Beslyfe: platform vision, Constitution, architecture, AI principles, trust model, reusable ecosystem strategy.
- Bak'd On The Bay: first ecosystem product implementation, live-site fixes, event operations, product-specific workflows.

Every pull request must be tested before opening.

Every pull request must be tested again after merge.

If a merged pull request fails the second test pass, the next pull request must fix the regression before new feature work continues.

## Phase 0: Stabilize Source Of Truth

Goal: make sure every repository and domain has a clear responsibility.

Tasks:

- Keep `giftations/beslyfe` as the parent platform repository.
- Keep `giftations/bakd-on-the-bay` as the first ecosystem product repository.
- Make both repositories link to each other with clear ownership boundaries.
- Stop treating Cannadispo as the long-term platform identity.
- Record live-domain behavior before changing redirects.

Status:

- Beslyfe repository now contains the Constitution, Manifesto, platform vision, and repo relationship docs.
- Bak'd On The Bay repository is the active first ecosystem product.
- Live domain check shows `beslyfe.com` currently redirects to `cannadispo.com`.
- Live domain check shows `cannadispo.com` currently serves Bak'd On The Bay.
- Beslyfe domain launch requirements are tracked in `docs/DOMAIN_LAUNCH_READINESS.md`.
- Product identity boundaries are tracked in `docs/PRODUCT_IDENTITY_BOUNDARIES.md`.

## Phase 1: Live Site Scrub

Goal: remove errors and identity confusion from the current live experience.

Initial findings:

- `https://beslyfe.com` returns a 301 redirect to `https://cannadispo.com`.
- `https://www.beslyfe.com` currently fails to load.
- `https://cannadispo.com` serves the Bak'd On The Bay homepage.
- `https://www.cannadispo.com` redirects to `https://cannadispo.com/`.
- Main Bak'd On The Bay routes return HTTP 200.
- Browser homepage audit found no console errors and no broken images.
- Homepage canonical and Open Graph URLs still point to `https://bakdonthebay.netlify.app/`.
- Multiple product pages contain hardcoded `bakdonthebay.netlify.app` metadata.

Phase 1 pull requests must stay under 20 files and should be ordered:

1. Fix homepage metadata and canonical identity.
2. Fix high-traffic public page metadata.
3. Fix application and community page metadata.
4. Fix domain redirect behavior after confirming DNS and hosting ownership.
5. Re-crawl live routes and browser console after each merge.

Do not make `beslyfe.com` official until the launch readiness checklist is satisfied.

## Phase 2: Product Identity Cleanup

Goal: align the product with the new platform model.

Tasks:

- Use the product identity boundary guide before renaming public copy, metadata, credentials, routing, or configuration.
- Replace Cannadispo language where it represents the old platform identity.
- Preserve Cannadispo references only where they are still operationally required, such as verified sender addresses or legacy admin configuration.
- Ensure Bak'd On The Bay is described as the first ecosystem product.
- Ensure Beslyfe is described as the parent software platform.
- Update identity cleanup status after each product repository PR.

## Phase 3: Platform Extraction Map

Goal: identify reusable Beslyfe platform modules inside the Bak'd On The Bay product.

Status:

- Initial module-by-module extraction map is tracked in `docs/PLATFORM_EXTRACTION_MAP.md`.

Candidate reusable modules:

- Identity and accounts
- Profiles and directory
- CRM
- Applications
- Ticketing and package access
- Community feed
- Messaging and groups
- Media library
- Maps and location sharing
- Floor plan
- Notifications
- Advertising
- Analytics
- Admin OS
- Theme registry

Output:

- A module-by-module extraction map.
- Clear boundaries between product-specific event content and reusable platform capability.
- No duplicated implementation.

## Phase 4: Trust, Data, And AI Foundation

Goal: make the platform trustworthy before making it smarter.

Tasks:

- Define user data ownership rules.
- Define AI personalization controls.
- Define recommendation transparency requirements.
- Define analytics metrics around meaningful outcomes.
- Define privacy and consent boundaries for ecosystem data.

## Phase 5: Beslyfe Platform Core

Goal: turn the lessons from Bak'd On The Bay into reusable platform software.

Tasks:

- Create reusable ecosystem configuration.
- Create reusable module manifests.
- Create reusable tenant/community/event boundaries.
- Create data-driven relationships between people, organizations, communities, experiences, and opportunities.
- Keep Bak'd On The Bay working while extracting reusable platform patterns.

## North Star

If someone has a dream, Beslyfe should help them find the people who can make it happen.

Every phase must increase meaningful human opportunity.
