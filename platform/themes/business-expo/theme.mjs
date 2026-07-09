// Theme: Business Expo — restrained corporate blue for trade shows and B2B
// conferences. The full revenue stack (CRM, advertising, sponsors) is on by
// default; community/entertainment are off.
export default {
  key: 'business-expo',
  name: 'Business Expo',
  category: 'Business & Trade',
  description:
    'Clean corporate blue for trade shows and conferences — sponsors, lead capture and the full CRM/advertising stack.',
  branding: {
    brand: '#2D7FF9',
    bg: '#0c1424',
    surface: '#13203a',
    accent: '#38BDF8',
    headingFont: '"Segoe UI", Arial, ui-sans-serif, system-ui, sans-serif',
    bodyFont: '"Segoe UI", Arial, ui-sans-serif, system-ui, -apple-system, sans-serif',
  },
  tagline: 'Where Business Gets Done',
  modules: [
    'ticketing', 'vendors', 'sponsors', 'speakers',
    'directory', 'floorplan', 'crm', 'advertising', 'cms',
  ],
}
