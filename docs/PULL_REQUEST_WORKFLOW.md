# Pull Request Workflow

Beslyfe grows in phases. Every pull request should make one clear improvement
without hiding risk in a large file set.

## Required Rules

- Keep every pull request under 20 changed files.
- Give every pull request one phase, one purpose, and one reason.
- Test before opening the pull request.
- After merge, pull main and test again before starting the next phase.
- If the post-merge test fails, the next pull request fixes that regression
  before new feature work continues.

## Architecture Rules

- Preserve the distinction between Beslyfe platform code and Bak'd On The Bay
  proof-ecosystem code.
- Do not duplicate working functionality to make a new platform layer appear
  complete.
- Do not move files just to make the tree look cleaner.
- Do not hardcode data that should become ecosystem, event, admin, or database
  configuration.
- Prefer contracts and tests before runtime extraction when the boundary is not
  clear yet.

## Recommended PR Shape

1. Start from fresh `main`.
2. Confirm the previous pull request was merged.
3. Run the test suite after pulling main.
4. Create a focused branch.
5. Change the fewest files that honestly complete the phase.
6. Update docs when the phase changes architecture, ownership, trust, AI,
   data, identity, or rollout state.
7. Run focused checks and the full test suite.
8. Open the pull request with changed-file count and test results.

## PR Body Checklist

Every PR should state:

- What changed.
- Why it supports the Beslyfe Manifesto, Constitution, or platform roadmap.
- Which files changed and whether the count is under 20.
- What tests were run.
- Whether follow-up work is intentionally left for a future phase.

## Merge Checklist

After a PR is merged:

- Pull the latest `main`.
- Run the full test suite.
- Confirm the live or local behavior affected by the PR still works when
  applicable.
- Only then begin the next phase.

## When To Stop And Redesign

Stop before opening a PR if the change:

- Creates a second source of truth.
- Mixes product-specific Bak'd content into reusable platform contracts.
- Introduces a temporary path that future contributors would have to unwind.
- Makes AI, personalization, or analytics less explainable.
- Weakens consent, privacy, data ownership, or auditability.
