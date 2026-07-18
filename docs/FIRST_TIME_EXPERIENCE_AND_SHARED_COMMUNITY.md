# First-time experience and shared-community decision

Date reviewed: 2026-07-18

## Answer first

Beslyfe is visually inviting, understandable, and clearly free. It is not mysterious in a vague way; the useful curiosity comes from the promise that a build can connect to people, sales, and opportunity. That is the right balance for a product asking for trust.

The weak first impression was activity. The live site presented a polished community but reported 2 members and 0 contributions while Cannadispo already had 17 approved public profiles and 4 public posts. Beslyfe and Cannadispo were described as one network but remained separate databases and separate feeds. A first-time visitor therefore saw a good promise and an empty room.

This release replaces that label-only connection with a real protected federation:

- Beslyfe remains the canonical network and general-audience community.
- Cannadispo is an 18+ community space inside that network.
- Public-safe Cannadispo profiles render as federated Beslyfe community profiles with stable origin identifiers.
- Public Cannadispo contributions are available only after age confirmation and always show their origin.
- Email, phone, application answers, private messages, and limited-audience activity do not cross the boundary.
- Every future Beslyfe build receives the same community-bridge contract and an explicit audience-age decision.

## First-visit scorecard

| Question | Before this release | Release response |
| --- | --- | --- |
| Is it inviting? | Yes. Strong typography, calm color, clear actions. | Preserve the visual system. |
| Is it intriguing? | Somewhat. The network board suggests a larger system. | Make real connected spaces and activity the intrigue. |
| Is the value clear? | Yes: build, community, and growth are visible above the fold. | Keep “100% free” and the two primary actions. |
| Does it earn trust? | Mostly, but exact 2/0 activity totals undercut the promise. | Count live federated members and contributions without exposing protected content. |
| Does it create a repeat-use reason? | Features exist, but the general feed is empty. | Surface an active protected space, keep the general feed invitation, and build notifications/help loops next. |
| Are the communities actually one? | No. Cannadispo was only a seeded ecosystem record. | Yes for read/discovery through federation; cross-site writes remain bounded until explicit account linking. |

## The reusable model

Every build created by Beslyfe gets:

1. A network id and ecosystem id.
2. One-profile-many-memberships identity direction.
3. Public opt-in contribution rules with origin attribution.
4. Audience settings for general, 13+, 18+, or 21+ access.
5. Private-data export disabled by default.
6. Read-only federation until the member explicitly links an account for writes.
7. Independent failure behavior, so one external space cannot take down Beslyfe.

## What still needs depth

The federation shipped here is intentionally read-only across domains. The next identity milestone is an explicit account-link flow using one-time signed codes, verified ownership, revocation, and audit history. Email matching alone must never silently merge two people.

The next retention milestone is to seed and operate the general Beslyfe feed: welcome prompts, unanswered-question routing, weekly success-story requests, relevant notifications, and a visible path from a useful interaction to a customer, collaborator, booking, donation, or solved problem.

## Release guardrails

- Do not put 18+ Cannadispo posts into the general feed.
- Do not infer age from account data or ask for a birth date when self-attestation is sufficient for the current boundary.
- Do not copy private application fields into a public profile.
- Do not claim cross-site follows, messages, or edits work until account linking is complete.
- Do not count the same canonical member twice after account linking is introduced.
