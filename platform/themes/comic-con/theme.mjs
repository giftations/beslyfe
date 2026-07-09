// Theme: Comic Con — electric violet and gold for fandom / pop-culture
// conventions. Leans on speakers (panels), entertainment, a directory of
// artists and a floor plan for the exhibitor hall.
export default {
  key: 'comic-con',
  name: 'Comic Con',
  category: 'Fandom & Pop Culture',
  description:
    'High-energy violet and gold for conventions — panels, artist alley, cosplay and a packed exhibitor floor.',
  branding: {
    brand: '#7B2FF7',
    bg: '#0d0b1f',
    surface: '#171331',
    accent: '#FFD23F',
    headingFont: '"Trebuchet MS", "Segoe UI", ui-sans-serif, system-ui, sans-serif',
    bodyFont: 'ui-sans-serif, "Segoe UI", system-ui, -apple-system, sans-serif',
  },
  tagline: 'Where Fandoms Collide',
  modules: [
    'ticketing', 'vendors', 'sponsors', 'speakers', 'entertainment',
    'community', 'messaging', 'directory', 'floorplan', 'cms',
  ],
}
