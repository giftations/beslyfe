# Beslyfe

Beslyfe is the parent platform. Bak'd On The Bay is the first live event
ecosystem built on top of it.

This repository contains the current Bak'd On The Bay product, Netlify
Functions, Netlify Database migrations, GitHub CI, and reusable Beslyfe platform
architecture.

## Production Readiness

Before live production changes, use
[`docs/PRODUCTION_READINESS_CHECKLIST.md`](docs/PRODUCTION_READINESS_CHECKLIST.md).

Required email configuration is documented in `.env.example`. Resend is the
primary expected email provider; SendGrid is optional legacy fallback only.

## Development

Install dependencies and run the smoke test suite:

```sh
npm install
npm test
```

GitHub Actions runs `npm test` on pull requests and pushes to `main`.

## Architecture

- [`docs/PLATFORM_ARCHITECTURE.md`](docs/PLATFORM_ARCHITECTURE.md)
- [`docs/PHASED_EXECUTION_PLAN.md`](docs/PHASED_EXECUTION_PLAN.md)
- [`docs/PRODUCT_IDENTITY_BOUNDARIES.md`](docs/PRODUCT_IDENTITY_BOUNDARIES.md)
- [`docs/PULL_REQUEST_WORKFLOW.md`](docs/PULL_REQUEST_WORKFLOW.md)
