# Beslyfe

Beslyfe is the parent platform, company, and dedicated public platform
repository.

The production Bak'd On The Bay implementation lives in
[`giftations/bakd-on-the-bay`](https://github.com/giftations/bakd-on-the-bay).
`beslyfe.com` is hosted from this repository on its own dedicated Netlify site.
Do not connect this repository to the Bak'd On The Bay/Cannadispo Netlify site.

This repository owns the Beslyfe public product surface, reusable platform
contracts and runtime, roadmap, governance, trust and AI standards, and shared
ecosystem architecture. Bak'd-specific content and operating workflows belong
in `giftations/bakd-on-the-bay`; reusable Beslyfe capability belongs here and
must be consumed through configuration rather than copied between products.

## Development

Install dependencies and run tests when changing contracts or docs with runnable
checks:

```sh
npm install
npm test
```

## Platform References

- [`docs/PLATFORM_ARCHITECTURE.md`](docs/PLATFORM_ARCHITECTURE.md)
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — authoritative product and platform roadmap.
- [`docs/PHASED_EXECUTION_PLAN.md`](docs/PHASED_EXECUTION_PLAN.md) — compatibility pointer for the original incomplete plan.
- [`docs/PRODUCT_IDENTITY_BOUNDARIES.md`](docs/PRODUCT_IDENTITY_BOUNDARIES.md)
- [`docs/PULL_REQUEST_WORKFLOW.md`](docs/PULL_REQUEST_WORKFLOW.md)
- [`platform/automation/execution-contract.mjs`](platform/automation/execution-contract.mjs) — internal, external, and hybrid automation authority.

## Release boundary

This repository publishes the Beslyfe platform identity and reusable contracts
to the dedicated Beslyfe Netlify site. It must never replace or deploy over the
Bak'd On The Bay/Cannadispo site. Future releases must preserve dedicated
hosting, apex/`www` HTTPS, canonical URLs, legal pages, observability, and a
verified rollback path.
