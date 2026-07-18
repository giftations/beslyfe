# Beslyfe

Beslyfe is a free community and modular growth platform for people building
businesses, websites, events, creator projects, nonprofits, and communities.

The repository owns the Beslyfe public experience, shared community network,
guided builder, growth connections, reusable platform contracts, administration
tools, roadmap, and release infrastructure. Product capabilities are selected by
outcome: ticketing is optional, not a platform-wide assumption.

The original event implementation is retained only as an isolated proof under
[`proof/`](proof/). Historical documentation and event-specific assets stay
inside that boundary and do not supply Beslyfe defaults.

## Development

```sh
npm install
npm test
```

## Platform references

- [`docs/BESLYFE_ROADMAP.md`](docs/BESLYFE_ROADMAP.md) — authoritative roadmap
- [`docs/PHASED_EXECUTION_PLAN.md`](docs/PHASED_EXECUTION_PLAN.md) — compatibility pointer
- [`platform/README.md`](platform/README.md) — platform architecture overview
- [`platform/automation/execution-contract.mjs`](platform/automation/execution-contract.mjs) — automation authority model

## Release boundary

This repository publishes to the dedicated Beslyfe Netlify project and the
`beslyfe.com` domain. Releases must preserve HTTPS, canonical URLs, legal pages,
observability, data migrations, and a verified rollback path.
