# Platform Lifecycle Governance

Beslyfe ecosystems should be reusable, recoverable, and trustworthy from the
first import through every public release. Bak'd On The Bay is the flagship
ecosystem, but these rules are platform-level.

## Import Governance

Imports are allowed when the source, consent basis, field mapping, validation
result, and rollback plan are explicit.

The reusable import contract lives at `platform/lifecycle/import-contract.mjs`.
It covers CSV, JSON, provider, ticketing, CRM, media, directory, sponsorship,
and event data imports without creating a second data system.

## Migration Governance

Migrations should be additive first, observable, and reversible. Existing
operational values must stay available until a migration and rollback path are
complete.

The reusable migration contract lives at
`platform/lifecycle/migration-contract.mjs`.

## Release Gates

Every production release should record the deploy reference, owner, evidence,
manual checks, decision, rollback reference, and post-merge verification.

The reusable release gate contract lives at
`platform/lifecycle/release-gate-contract.mjs`.

## Manual Verification

Before a public launch or risky deploy, verify DNS, Netlify deploy health,
database attachment, email, admin login, applications, approvals, profiles,
directory visibility, notifications, mobile navigation, redirects, and rollback.

The production checklist remains the operational checklist. Lifecycle contracts
make those checks reusable as platform data.

## Admin Visibility

The Admin OS System view reads `GET events?platform` and displays imports,
migrations, and release gates alongside the rest of the platform contract
registry. Operators should be able to see these lifecycle rules before future
runtime workflows are added.

The same view also surfaces the operating guardrails for imports, migrations,
and releases so operators can see the safety rules before running future
workflow tools.
