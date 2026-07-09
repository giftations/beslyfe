# Tests

Automated checks for the platform's security-critical logic.

## Unit / smoke tests

```
npm test          # runs node --test over tests/**/*.test.mjs
```

`smoke.test.mjs` exercises the dependency-free helpers in
`netlify/functions/lib/session.mjs` that guard authentication and permissions:

- **`timingSafeEqualHex`** — constant-time password-hash comparison (no timing
  side-channel, correct on length mismatch and null input).
- **`passwordPolicyError`** — the single password floor enforced by sign-up,
  password reset and application intake (member ≥ 8 chars; admin ≥ 12 with a
  character-class mix).
- **`isSameOrigin` / `requireSameOrigin`** — the CSRF same-origin check: browser
  cross-origin writes are blocked, header-less server-to-server clients pass.
- **`readJsonBody`** — request-body parsing rejects malformed / non-object input.
- **`requestId` / `logEvent`** — structured logging is safe and never throws.

These are hermetic (no database, no network) and are **not** run by the Netlify
build; wire `npm test` into CI to gate merges.

## Manual permission / CSRF smoke checks

Against a local dev server (`netlify dev --port 8889`), the following confirm the
server-side guards are live. Identity is only ever taken from the httpOnly
session cookie, so an unauthenticated or cross-origin request must be refused:

```sh
BASE=http://localhost:8889/.netlify/functions

# Admin-only reads require a session → 401
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/dashboards"        # 401
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/audit-log"         # 401
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/ads?resource=campaigns"  # 401

# Cross-origin state change is blocked by requireSameOrigin → 403
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  -H 'Origin: https://evil.example' -H 'Content-Type: application/json' \
  -d '{"action":"login","email":"x","password":"y"}' "$BASE/auth"   # 403

# The public "who am I" read is anonymous, never an error → 200 with null account
curl -s "$BASE/auth?action=session"                                # {"account":null,...}
```
