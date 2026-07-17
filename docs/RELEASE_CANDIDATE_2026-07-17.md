# Beslyfe Release Candidate — 2026-07-17

## Code gates complete

- Platform-specific homepage replaces the inherited Bak'd event homepage.
- `https://beslyfe.com/` is the canonical public identity in homepage metadata.
- Constitution, Manifesto, Privacy, and Terms routes exist.
- Bak'd On The Bay is presented as the proof ecosystem, not as Beslyfe itself.
- Internal, external, and hybrid automation authority is defined in the reusable contract registry.
- Netlify build runs the complete test suite before publishing.
- Static assets revalidate so releases are not trapped behind year-long immutable caching.
- GitHub workflows use Node 24 and current action majors.
- All repository tests pass.

## Required release-owner checks

- Create or select a Netlify site dedicated to Beslyfe. Never attach this repo to the Bak'd/Cannadispo production site.
- Point `beslyfe.com` and `www.beslyfe.com` to that dedicated site and verify HTTPS.
- Confirm `www` redirects to the chosen canonical apex host.
- Add a platform-specific social preview image before announcing broadly.
- Visually verify desktop and mobile layouts in the deployed preview.
- Verify every public route, canonical URL, privacy/terms page, and mail link.
- Confirm rollback to the previous dedicated Beslyfe deploy.
- Keep Cannadispo and Bak'd On The Bay reachable throughout the launch.

## Release decision

The repository is a code-complete release candidate. Domain, dedicated hosting, social-preview artwork, deployed-preview visual QA, and rollback verification are operational launch gates and cannot be proven from repository code alone.
