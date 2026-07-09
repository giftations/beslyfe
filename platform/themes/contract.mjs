// platform/themes/contract.mjs - reusable theme contract.
//
// Themes let ecosystems differ without forking code. A theme is presentation
// and default module intent, not a second product, permission system, or data
// store. Bak'd On The Bay is the flagship theme; future events, venues,
// communities, and industries should use the same contract.

export const THEME_RECORD_TYPES = [
  {
    key: 'theme-preset',
    label: 'Theme Preset',
    purpose: 'Names a reusable visual and module preset an ecosystem can start from.',
  },
  {
    key: 'branding-token',
    label: 'Branding Token',
    purpose: 'Defines CSS-compatible colors and presentation values consumed by public and admin surfaces.',
  },
  {
    key: 'module-default',
    label: 'Module Default',
    purpose: 'Declares which platform modules are expected to be active for an ecosystem using the theme.',
  },
  {
    key: 'copy-default',
    label: 'Copy Default',
    purpose: 'Provides default tagline and descriptive copy that organizers may override per ecosystem.',
  },
  {
    key: 'ecosystem-override',
    label: 'Ecosystem Override',
    purpose: 'Stores event or community-specific branding and content overrides without changing the base theme.',
  },
]

export const THEME_REQUIRED_FIELDS = [
  'key',
  'name',
  'category',
  'description',
  'branding',
  'tagline',
  'modules',
]

export const THEME_BRANDING_FIELDS = [
  'brand',
  'bg',
  'surface',
  'accent',
  'headingFont',
  'bodyFont',
]

export const THEME_OVERRIDE_FIELDS = [
  'theme',
  'branding',
  'modules',
  'pageContent',
  'media',
  'sectionOrder',
]

export const THEME_RESOLUTION_RULES = [
  'unknown theme keys fall back to the configured default theme',
  'event theme is the base presentation layer',
  'CMS page theme overrides compose on top of event theme',
  'theme modules record intent and do not replace permissions',
  'browser surfaces consume themes through API responses, not direct platform imports',
]

export const THEME_TRUST_CONTROLS = [
  'themes contain no secrets',
  'theme changes are admin-only',
  'theme registry remains serializable',
  'branding must preserve readable contrast',
  'meaningful images still require alt text in content records',
  'theme selection must not rename product ownership boundaries',
  'theme defaults must be overrideable per ecosystem',
]

export function themeRecordTypeKeys() {
  return THEME_RECORD_TYPES.map((type) => type.key)
}

export function themeContractSummary() {
  return {
    recordTypes: THEME_RECORD_TYPES.map((type) => ({
      key: type.key,
      label: type.label,
      purpose: type.purpose,
    })),
    requiredFields: [...THEME_REQUIRED_FIELDS],
    brandingFields: [...THEME_BRANDING_FIELDS],
    overrideFields: [...THEME_OVERRIDE_FIELDS],
    resolutionRules: [...THEME_RESOLUTION_RULES],
    trustControls: [...THEME_TRUST_CONTROLS],
  }
}
