# Beslyfe

Beslyfe is the parent platform and long-term vision repository.

The production Bak'd On The Bay implementation lives in
[`giftations/bakd-on-the-bay`](https://github.com/giftations/bakd-on-the-bay).
Do not connect Netlify production to this repository.

This repo should stay focused on the Beslyfe Constitution, Manifesto, AI
principles, platform architecture, ecosystem contracts, roadmap, governance, and
other reusable platform decisions.

Completed implementation work that belongs in production should be moved into
`giftations/bakd-on-the-bay` through a focused pull request, then validated
against the live Netlify assumptions for `cannadispo.com`.

## Development

Install dependencies and run tests when changing contracts or docs with runnable
checks:

```sh
npm install
npm test
```

## Platform References

- [`docs/PLATFORM_ARCHITECTURE.md`](docs/PLATFORM_ARCHITECTURE.md)
- [`docs/PHASED_EXECUTION_PLAN.md`](docs/PHASED_EXECUTION_PLAN.md)
- [`docs/PRODUCT_IDENTITY_BOUNDARIES.md`](docs/PRODUCT_IDENTITY_BOUNDARIES.md)
- [`docs/PULL_REQUEST_WORKFLOW.md`](docs/PULL_REQUEST_WORKFLOW.md)
- [`platform/automation/execution-contract.mjs`](platform/automation/execution-contract.mjs) — internal, external, and hybrid automation authority.

## Release boundary

This repository is ready to publish the Beslyfe platform identity and reusable contracts, but it must not replace or deploy over the Bak'd On The Bay Netlify site. Connect `beslyfe.com` only to a separate platform site after DNS, apex/`www` HTTPS, canonical URLs, legal pages, and rollback are verified.
