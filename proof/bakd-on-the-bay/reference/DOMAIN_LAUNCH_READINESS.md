# Beslyfe Domain Launch Readiness

Beslyfe.com will become the official public home of the Beslyfe platform when the platform is ready.

Bak'd On The Bay remains the proof ecosystem: the first ecosystem product created with Beslyfe software, showing that the system can turn an event into a living network of people, businesses, communities, opportunities, and experiences.

This document prevents premature domain changes. The domain should not become official until the platform story, technical routing, trust posture, and ecosystem boundaries are clear.

## Current Live State

As of the latest audit:

- `https://beslyfe.com` redirects to `https://cannadispo.com`.
- `http://beslyfe.com` redirects to `https://cannadispo.com`.
- `https://www.beslyfe.com` does not resolve.
- `http://www.beslyfe.com` does not resolve.
- `https://cannadispo.com` serves Bak'd On The Bay.
- `https://www.cannadispo.com` redirects to `https://cannadispo.com/`.
- `http://cannadispo.com` redirects to `https://cannadispo.com/`.
- `http://www.cannadispo.com` ultimately resolves to `https://cannadispo.com/`.

## Future Domain Intent

Beslyfe.com should become the official platform domain only when it can clearly communicate:

- Beslyfe is the Community Operating System.
- Beslyfe helps people build better lives through intelligent communities.
- Artificial Intelligence should maximize opportunity, not engagement.
- Bak'd On The Bay is the first ecosystem product powered by Beslyfe software.
- Cannadispo is not the long-term platform identity.

## Do Not Launch Beslyfe.com Until

The following must be true before `beslyfe.com` becomes the official public site:

- The platform homepage exists and explains Beslyfe clearly.
- The Constitution is publicly accessible.
- The Manifesto is publicly accessible.
- The relationship between Beslyfe and Bak'd On The Bay is obvious.
- The page does not look like an event site.
- The page does not redirect users into Cannadispo.
- The page does not confuse Beslyfe with Bak'd On The Bay.
- The page has platform-specific metadata, canonical URL, and social preview image.
- `www.beslyfe.com` resolves and redirects or canonicalizes intentionally.
- HTTPS works for both apex and `www`.
- DNS, hosting, and redirects are documented.
- A rollback path exists.

## Launch Architecture

Recommended domain responsibilities:

- `beslyfe.com`: official platform and company site.
- `www.beslyfe.com`: redirect or canonical host for the official platform site.
- `cannadispo.com`: legacy/current operational host until retired or repurposed.
- Bak'd On The Bay product domain: event ecosystem public experience.

The final Bak'd On The Bay domain should be decided deliberately. Until then, `cannadispo.com` remains the current operational domain for the proof ecosystem.

## Launch Phases

### Phase 1: Stabilize Current Proof Ecosystem

Keep Bak'd On The Bay working.

Remove old Netlify metadata leaks.

Keep canonical URLs aligned with the current live domain.

Do not disrupt event operations.

### Phase 2: Prepare Beslyfe Platform Site

Create the official Beslyfe public site.

Publish the Constitution, Manifesto, platform mission, and proof ecosystem story.

Make Bak'd On The Bay a proof point, not the homepage experience.

### Phase 3: Configure Domain Routing

Point `beslyfe.com` to the platform site.

Fix `www.beslyfe.com` DNS.

Confirm HTTPS certificates.

Confirm canonical behavior.

Confirm redirect behavior.

### Phase 4: Launch And Verify

Run route checks.

Run browser console checks.

Run social metadata checks.

Run SEO canonical checks.

Run post-launch tests.

Confirm Bak'd On The Bay remains reachable and operational.

## Required Checks

Before launch:

- `beslyfe.com` resolves directly to the Beslyfe platform site.
- `www.beslyfe.com` resolves and redirects intentionally.
- No Beslyfe page redirects to Cannadispo by accident.
- Bak'd On The Bay remains reachable.
- The proof ecosystem relationship is explicit.
- The platform pages reflect the Constitution and Manifesto.

After launch:

- Re-run domain audit.
- Re-run browser audit.
- Re-run repository tests.
- Check social sharing metadata.
- Check mobile rendering.
- Check accessibility basics.

## North Star

When `beslyfe.com` goes official, it should make one thing unmistakable:

Beslyfe helps people find the people who can help make their dreams happen.
