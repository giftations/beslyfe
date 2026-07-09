// platform/themes/registry.mjs — the theme registry.
//
// A theme is a named preset of branding (the CSS custom properties the site
// already reads), default copy, and the set of modules an organizer expects to
// run. Creating a new edition becomes "pick a theme + enter details" instead of
// writing code: the chosen theme is resolved here into the event's `settings`
// document (events.settings.theme / .branding / .modules), which the public
// site and Admin OS then read.
//
// This module is the single source of truth. It is imported server-side by the
// events function (esbuild bundles it) and its output is served to the browser
// via `GET /.netlify/functions/events?themes` — the browser never imports it
// directly, so there is no cross-directory static-import coupling to maintain.

import bakdOnTheBay from './bakd-on-the-bay/theme.mjs'
import foodFestival from './food-festival/theme.mjs'
import comicCon from './comic-con/theme.mjs'
import businessExpo from './business-expo/theme.mjs'

// Order here is the order themes are presented in the picker.
export const THEMES = [bakdOnTheBay, foodFestival, comicCon, businessExpo]

// The theme the flagship edition seeds with and the fallback for any event
// whose stored theme key is unknown (e.g. a theme later renamed).
export const DEFAULT_THEME_KEY = 'bakd-on-the-bay'

const BY_KEY = new Map(THEMES.map((t) => [t.key, t]))

export function getTheme(key) {
  return BY_KEY.get(key) || null
}

// A safe, serializable summary of every theme — what the picker needs. Excludes
// nothing sensitive (themes are pure presentation), but keeps the shape stable.
export function listThemes() {
  return THEMES.map((t) => ({
    key: t.key,
    name: t.name,
    category: t.category,
    description: t.description,
    branding: t.branding,
    tagline: t.tagline,
    modules: t.modules,
  }))
}

// Resolve a theme key into the fragment stored on events.settings. Unknown or
// missing keys fall back to the default theme so an event is never theme-less.
// The returned object is deliberately flat and JSON-safe.
export function resolveThemeSettings(key) {
  const theme = getTheme(key) || getTheme(DEFAULT_THEME_KEY)
  return {
    theme: theme.key,
    branding: { ...theme.branding },
    modules: [...theme.modules],
  }
}
