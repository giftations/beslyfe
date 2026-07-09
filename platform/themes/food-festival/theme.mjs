// Theme: Food Festival — warm tangerine/amber palette for food-and-drink
// events. Vendors, entertainment and a floor plan front and centre; no CRM or
// advertising by default (a lighter organizer footprint).
export default {
  key: 'food-festival',
  name: 'Food Festival',
  category: 'Food & Drink',
  description:
    'Warm, appetite-forward tangerine and amber — for tasting events, night markets and food-truck rallies.',
  branding: {
    brand: '#FF7A45',
    bg: '#1a1207',
    surface: '#241a0e',
    accent: '#FFD166',
    headingFont: 'Georgia, "Times New Roman", ui-serif, serif',
    bodyFont: 'ui-sans-serif, "Segoe UI", system-ui, -apple-system, sans-serif',
  },
  tagline: 'Taste the Local Legends',
  modules: [
    'ticketing', 'vendors', 'sponsors', 'entertainment',
    'community', 'directory', 'floorplan', 'cms',
  ],
}
