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

Status:

- Initial trust, data ownership, consent, analytics, and AI launch gate standards are tracked in `docs/TRUST_DATA_AI_FOUNDATION.md`.

Tasks:

- Define user data ownership rules.
- Define AI personalization controls.
- Define recommendation transparency requirements.
- Define analytics metrics around meaningful outcomes.
- Define privacy and consent boundaries for ecosystem data.

## Phase 5: Beslyfe Platform Core

Goal: turn the lessons from Bak'd On The Bay into reusable platform software.

Status:

- Initial reusable platform core contract is tracked in `docs/PLATFORM_CORE_CONTRACT.md`.
- Reusable module manifest contract fields are tracked in `platform/modules/manifest.mjs`.
- Reusable ecosystem configuration contract is tracked in `platform/ecosystems/config-contract.mjs`.
- Reusable access and application contract is tracked in `platform/access/application-contract.mjs`.
- Reusable person identity contract is tracked in `platform/identity/person-contract.mjs`.
- Reusable organization identity contract is tracked in `platform/identity/organization-contract.mjs`.
- Reusable community contract is tracked in `platform/communities/contract.mjs`.
- Reusable discovery and directory contract is tracked in `platform/discovery/directory-contract.mjs`.
- Reusable notification contract is tracked in `platform/notifications/contract.mjs`.
- Reusable moderation and trust safety contract is tracked in `platform/moderation/trust-safety-contract.mjs`.
- Reusable relationship contract is tracked in `platform/relationships/contract.mjs`.
- Reusable conversation contract is tracked in `platform/conversations/contract.mjs`.
- Reusable experience contract is tracked in `platform/experiences/contract.mjs`.
- Reusable scheduling contract is tracked in `platform/scheduling/contract.mjs`.
- Reusable places and maps contract is tracked in `platform/places/maps-contract.mjs`.
- Reusable content and CMS contract is tracked in `platform/content/cms-contract.mjs`.
- Reusable opportunity contract is tracked in `platform/opportunities/contract.mjs`.
- Reusable knowledge contract is tracked in `platform/knowledge/contract.mjs`.
- Reusable marketplace contract is tracked in `platform/marketplace/contract.mjs`.
- Reusable advertising and sponsorship contract is tracked in `platform/advertising/sponsorship-contract.mjs`.
- Reusable commerce and payments contract is tracked in `platform/commerce/payments-contract.mjs`.
- Reusable integrations and webhooks contract is tracked in `platform/integrations/webhooks-contract.mjs`.
- Consent and AI-use boundaries are tracked in `platform/trust/consent-ai-contract.mjs`.
- Explainable AI recommendation contract is tracked in `platform/ai/recommendation-contract.mjs`.
- Outcome analytics contract is tracked in `platform/analytics/outcome-contract.mjs`.
- Tenant and data-boundary contract is tracked in `platform/boundaries/data-boundary-contract.mjs`.
- Platform core contract registry is tracked in `platform/contracts.mjs`.
- Existing `GET events?platform` response exposes the platform contract registry as `contracts`.
- Admin System view displays the platform contract registry from the existing platform response.
- The platform response is regression-tested without requiring database setup.
- The platform response exposes registry-owned summary counts for admin and future tooling.
- Repository structure ownership is documented in `docs/REPO_STRUCTURE.md`.
- Pull request workflow guardrails are documented in `docs/PULL_REQUEST_WORKFLOW.md` and the GitHub PR template.
- GitHub Actions runs the Node test suite on pull requests and pushes to `main`.

Tasks:

- Create reusable ecosystem configuration.
- Create reusable module manifests.
- Create reusable tenant/community/event boundaries.
- Create data-driven relationships between people, organizations, communities, experiences, and opportunities.
- Keep Bak'd On The Bay working while extracting reusable platform patterns.

## North Star

If someone has a dream, Beslyfe should help them find the people who can make it happen.

Every phase must increase meaningful human opportunity.
