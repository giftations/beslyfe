# bakd-on-the-bay

Production website for the Bayfront Convention Center event experience.

## Frontend architecture (Phase 1)

The frontend uses a static HTML/CSS/JS architecture with a reusable design system foundation:

- **Design tokens** in `assets/css/style.css` (`:root` variables for color, spacing, radius, shadows, typography).
- **Layout primitives** (`.container`, `.section`, `.grid`, `.grid-stats`).
- **Reusable components** (`.btn`, `.btn-secondary`, `.card`, `.stat`, `.badge`).
- **A11y baseline** (skip link, visible focus styles, `aria-*` support, reduced-motion handling).
- **Performance-safe interactions** (passive scroll listener, reduced-motion checks).

## Key files

- `index.html` — homepage structure and metadata.
- `assets/css/style.css` — tokens + foundational styles + components.
- `assets/js/main.js` — countdown, nav behavior, animations, smooth scrolling, dynamic background settings.
- `docs/FRONTEND_ARCHITECTURE.md` — conventions and extension guidance.

## Local development

Open `index.html` in a local static server (recommended) to ensure all asset paths and scripts resolve correctly.

