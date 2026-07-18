# Platform Extraction Map

Beslyfe must become reusable platform software without breaking Bak'd On The Bay.

This map identifies which working product capabilities should become reusable Beslyfe platform modules, which parts are product-specific, and what must be true before extraction begins.

The rule is simple: do not duplicate working functionality. Extract deliberately, keep one source of truth, and let Bak'd On The Bay remain the proof ecosystem while the reusable platform takes shape.

## Extraction Principles

- Keep Bak'd On The Bay operational during every extraction.
- Move behavior only when there is a reusable boundary.
- Keep product content, event copy, contracts, pricing, and operational details in the product layer.
- Keep identity, relationships, permissions, analytics, AI, trust, and reusable ecosystem modules in the platform layer.
- Prefer configuration over hardcoded product assumptions.
- Every extracted module must have a clear owner, data boundary, and test path.

## Core Domain Map

| Domain | Current Source | Reusable Platform Boundary | Product-Specific Boundary | Extraction Status |
| --- | --- | --- | --- | --- |
| Organizations | CRM companies | Parent entity above events, communities, businesses, and partner networks | Bak'd operator/sponsor-specific labels | Partial |
| Events | `events` table and events function | Tenant root for editions, experiences, venues, and community activations | Bak'd 2026 dates, venue, and event content | Live |
| People | Profiles, accounts, CRM people | Identity, public profile, roles, relationship graph, consent, data ownership | Event-specific profile prompts and copy | Live |
| Companies | CRM companies and company-event links | Businesses, sponsors, vendors, advertisers, employers, partners | Bak'd vendor/sponsor packages | Live |
| Permissions | Sessions, password resets, auth attempts | Account access, roles, admin authority, rate limits, same-origin protection | Product-specific seeded admin values until migrated | Live |
| Notifications | Messages and group messages | Member signals, reminders, opportunity alerts, future broadcast channels | Bak'd-specific notification copy | Partial |
| Analytics | Dashboards, audit log, ad events | Outcome metrics, trust auditability, performance, advertising reporting | Bak'd event KPIs and current dashboards | Live |

## Module Extraction Map

| Module | Current Implementation | Platform Opportunity | Keep Product-Specific | Next Step |
| --- | --- | --- | --- | --- |
| Ticketing | Package access and application approvals | Generic gated purchase/access flow for events, communities, and marketplaces | Eventbrite links, Bak'd package names, pricing | Define a reusable access contract |
| Applications | Vendor, sponsor, speaker, DJ flows | Configurable intake forms, review pipelines, notes, status, and approval emails | Role copy, contracts, event-specific questions | Map form fields into reusable schemas |
| CRM | People, companies, roles, notes | Relationship engine across people, businesses, organizations, and opportunities | Bak'd sales labels and pipeline stages | Separate reusable relationship model from product labels |
| Community | Feed, reels, stories, hub | Community engagement surfaces optimized for opportunity, not scrolling | Bak'd prompts, event timing, content categories | Define healthy-community and moderation requirements |
| Messaging | Direct messages and groups | Relationship-building conversations, groups, intros, and opportunity follow-up | Event-specific group defaults | Add trust, consent, and reporting boundaries |
| Directory | Profiles and public search | People/business discovery, ecosystem directories, mentorship and networking | Bak'd directory categories and copy | Define portable profile and listing types |
| Maps | Location sharing and floor plan | Place-based discovery, booths, venues, meetups, and opportunity proximity | Bayfront venue layout and booth assets | Split venue data from reusable map behavior |
| Scheduling | Education schedule and event timing | Sessions, appointments, office hours, mentor slots, and program calendars | Bak'd speaker lineup and session copy | Define reusable schedule/session model |
| Media Library | Site media and member media | User-owned media, organization media, content reuse, and consent-aware assets | Event-specific image sets | Add ownership and reuse permissions |
| Advertising | Campaigns, creatives, events | Ethical ecosystem advertising tied to businesses and outcomes | Bak'd sponsor/ad packages | Define advertiser and placement contracts |
| CMS | Site settings and homepage admin | Configurable pages, sections, themes, and content surfaces | Product homepage copy and event-specific sections | Keep as platform config layer |
| Themes | Platform theme registry | Reusable ecosystem presets for industries and communities | Bak'd visual identity | Expand theme contract only after a second product needs it |
| AI | Roadmap | Opportunity recommendations, introductions, summaries, discovery, trust explanations | Product-specific prompts until generalized | Define AI transparency and control rules first |

## Do Not Extract Yet

The following should remain product-specific until there is a deliberate migration:

- Bak'd On The Bay public copy.
- Current contracts and PDF assets.
- Current `cannadispo.com` metadata while it is the live product domain.
- Verified sender and admin seed values tied to current operations.
- Event-specific pricing, dates, venue content, sponsor tiers, and performer language.

## Extraction Readiness Checklist

Before moving any module into shared platform code, confirm:

- The module solves a reusable ecosystem need.
- The product-specific data can be represented as configuration.
- Existing Bak'd behavior remains unchanged.
- Tests cover the current product behavior before extraction.
- Tests cover the reusable module boundary after extraction.
- The database ownership model is clear.
- The user data and trust impact is understood.
- The change is small enough for a pull request under 20 files.

## Recommended Order

1. Identity, people, companies, and relationships.
2. Applications and configurable intake workflows.
3. Directory, CRM, and opportunity matching foundations.
4. Messaging, groups, and trust controls.
5. Scheduling, maps, and place-based opportunity.
6. Analytics and outcome measurement.
7. Advertising and marketplace modules.
8. AI recommendation and introduction systems.

AI should come after trust, data ownership, consent, and relationship boundaries are explicit.

## Success Criteria

The extraction is working when:

- A second ecosystem can reuse Beslyfe modules without cloning Bak'd On The Bay.
- Bak'd On The Bay still works as the flagship proof product.
- Product-specific content lives in configuration.
- Platform modules are reusable across industries.
- The system creates more meaningful opportunity with less manual glue.

## North Star

Beslyfe is the operating system for human opportunity.

Bak'd On The Bay is the proof that one ecosystem can become the seed of many.
