// Theme: Bak'd On The Bay — the flagship edition, now expressed as one theme
// among many. Bayfront / cannabis-lifestyle palette. This is the platform's
// default theme; every value here mirrors the site's original hand-authored
// look (assets/css/style.css :root) so activating it changes nothing visible.
export default {
  key: 'bakd-on-the-bay',
  name: "Bak'd On The Bay",
  category: 'Cannabis & Lifestyle',
  description:
    'The flagship bayfront look — lime-green on deep night, built for a cannabis-forward lifestyle expo.',
  // Maps 1:1 onto the CSS custom properties the whole site already reads.
  branding: {
    brand: '#9FE22D',
    bg: '#071008',
    surface: '#111111',
    accent: '#f5b942',
    headingFont: '"Aptos Display", "Segoe UI", ui-sans-serif, system-ui, sans-serif',
    bodyFont: 'ui-sans-serif, "Aptos", "Segoe UI", system-ui, -apple-system, sans-serif',
  },
  tagline: 'Be Part Of History',
  // Modules an edition on this theme has switched on by default. These are
  // capability flags read from platform/modules — they never gate code, they
  // describe which surfaces an organizer expects to run.
  modules: [
    'ticketing', 'vendors', 'sponsors', 'speakers', 'entertainment',
    'community', 'messaging', 'directory', 'floorplan', 'advertising', 'crm', 'cms',
  ],
}
