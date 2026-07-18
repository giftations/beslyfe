# Product Identity Boundaries

Beslyfe is the parent platform and company identity.

Bak'd On The Bay is the first ecosystem product created with Beslyfe software.

Cannadispo is not the long-term platform identity. It may remain in the system only where it is still operationally required until domains, verified senders, credentials, and legacy routing are intentionally migrated.

This document defines what each name is allowed to mean so future pull requests can clean up identity without breaking the live proof ecosystem.

## Identity Roles

### Beslyfe

Beslyfe should describe:

- The company and parent platform.
- The Community Operating System.
- The Constitution, Manifesto, opportunity philosophy, AI principles, and trust standards.
- Reusable platform architecture.
- Long-term ecosystem strategy.
- Future public platform pages on `beslyfe.com`.

Beslyfe should not describe a single event, a single cannabis vertical, or a temporary domain redirect.

### Bak'd On The Bay

Bak'd On The Bay should describe:

- The first ecosystem product built with Beslyfe software.
- The active event/community experience.
- Event-specific pages, tickets, applications, sponsors, vendors, speakers, attendees, maps, schedules, floor plans, media, and community workflows.
- The proof that Beslyfe can turn an event into a living ecosystem.

Bak'd On The Bay should not be described as the whole platform.

### Cannadispo

Cannadispo should describe only:

- Current or legacy domain routing that still points to the live product.
- Operational sender addresses that are already verified.
- Legacy credentials, usernames, or configuration values that cannot be renamed without migration.
- Historical context explaining what Beslyfe replaced.

Cannadispo should not describe:

- The long-term company identity.
- The parent platform.
- The product vision.
- New public-facing product language.
- New database concepts, modules, or architecture.

## Cleanup Rules

When replacing Cannadispo references, use this order:

1. Public product copy: replace with Bak'd On The Bay if the page is event-specific.
2. Platform copy: replace with Beslyfe if the language describes reusable software, company strategy, AI, trust, or ecosystem architecture.
3. Domains and metadata: keep `cannadispo.com` while it is the current live product domain.
4. Email and credentials: keep existing verified sender addresses and seeded admin credentials until a dedicated migration is planned.
5. Historical docs: keep Cannadispo only when explaining the transition from old identity to new platform.

Do not rename operational values just to make the text look clean. Identity cleanup must preserve authentication, email delivery, domain routing, and live event operations.

## Current Operational Exceptions

The following are allowed until explicitly migrated:

- `cannadispo.com` as the current live public domain for Bak'd On The Bay.
- `admin@cannadispo.com` as a verified sender address.
- Seeded admin credentials or reserved usernames that rely on Cannadispo.
- Documentation that records the current `beslyfe.com` redirect to `cannadispo.com`.

Each exception should be removed only with a migration plan, a rollback path, and post-merge testing.

## Pull Request Standard

Identity cleanup pull requests must:

- Stay under the 20-file limit.
- State whether the change affects public copy, platform copy, metadata, configuration, email, credentials, or routing.
- Preserve the Beslyfe/Bak'd On The Bay relationship.
- Avoid introducing new Cannadispo references unless they are operational exceptions.
- Run tests before opening and after merge.

## North Star

Public identity should make the platform model obvious:

Beslyfe builds the operating system for human opportunity.

Bak'd On The Bay proves it works.
