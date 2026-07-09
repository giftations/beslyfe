# Frontend Architecture

This document defines the Phase 1 frontend system for `bakd-on-the-bay`.

## Goals

- Long-term maintainability
- Reusable, consistent UI patterns
- Accessibility-first interaction patterns
- Scalable styling through design tokens
- No one-off visual hacks

## Styling model

The current architecture keeps a single CSS entrypoint (`assets/css/style.css`) but organizes rules in this order:

1. **Design tokens** (`:root` custom properties)
2. **Base/reset**
3. **Accessibility primitives**
4. **Layout primitives**
5. **Components**
6. **Section variants**
7. **Responsive behavior**
8. **Reduced-motion support**

## Design tokens

Token categories currently include:

- Color (`--color-*`)
- Spacing (`--space-*`)
- Radius (`--radius-*`)
- Shadow (`--shadow-*`)
- Typography (`--font-*`)
- Layout (`--container-max`, z-index tokens)

When adding new styles, consume tokens first. Add new tokens only when values are reused or represent design semantics.

## Components

Shared components:

- `.btn`
- `.btn-secondary`
- `.badge`
- `.card`
- `.stat`
- `.grid`
- `.grid-stats`

Component states should include hover/focus/active where applicable.

## Accessibility standards

- Skip link always present and keyboard reachable.
- `:focus-visible` treatment must remain high contrast.
- Avoid removing focus styles.
- Honor `prefers-reduced-motion` for all non-essential animation.
- Ensure CTA groups use semantic grouping (`role="group"` + `aria-label` when needed).

## JavaScript standards

`assets/js/main.js` should remain responsible for UI behavior only:

- Mobile navigation state
- Countdown rendering
- Smooth in-page navigation
- Progressive reveal animations
- Runtime homepage background settings

All new JS behavior should be:

- Defensive against missing DOM elements
- Idempotent where possible
- Accessibility-aware
- Performance-safe (e.g., passive listeners)

## Page data rendering (Phase 1.2)

To reduce inline-script duplication and improve maintainability/CSP readiness:

- Shared list rendering utilities are centralized in `assets/js/profile-listing.js`.
- Page-specific entrypoints live in:
  - `assets/js/pages/speakers.js`
  - `assets/js/pages/vendors.js`
  - `assets/js/pages/sponsors.js`

Guidelines:

- Keep `profile-listing.js` generic and role-agnostic.
- Keep page entrypoints thin wrappers around shared rendering APIs.
- Prefer external JS files over inline `<script>` blocks for all new pages.

## Next recommended phase

- Split CSS into dedicated files (`tokens.css`, `base.css`, `components.css`, `layout.css`) while keeping one bundled output.
- Add linting/formatting enforcement for HTML/CSS/JS.
- Introduce visual regression snapshots for homepage sections.
- Expand metadata strategy for route-level SEO pages.
