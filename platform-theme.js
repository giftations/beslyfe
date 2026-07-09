/**
 * platform-theme.js — applies the ACTIVE event's theme to the public site.
 *
 * This is the front-end half of the platform theme layer. It fetches the active
 * edition (GET events?active), reads the branding that its theme stamped onto
 * events.settings, and sets the matching CSS custom properties on :root. The
 * result: a new edition created from a theme in the Admin OS *looks* like that
 * theme on the live site with no code change.
 *
 * Layering contract: this is the BASE layer. It loads before
 * homepage-admin-state.js, whose per-page CMS theme (site_settings.theme)
 * remains an explicit override on top — an admin who sets brand/bg colours in
 * the Website CMS still wins. If there is no active event, no branding, or the
 * request fails, the page keeps the hand-authored defaults from style.css. The
 * layer is purely additive and never blocks paint.
 */
(function () {
  'use strict';

  var HEX = /^#[0-9a-fA-F]{6}$/;
  var root = document.documentElement;

  // Only touch a variable when the theme supplies a valid hex, so a partial
  // theme never blanks a colour the stylesheet already defines.
  function setHex(name, value) {
    if (typeof value === 'string' && HEX.test(value)) root.style.setProperty(name, value);
  }

  // Font stacks are validated loosely: printable, comma-separated, no braces or
  // semicolons that could break out of the property value.
  function setFont(name, value) {
    if (typeof value === 'string' && value.length <= 200 && !/[{};<>]/.test(value)) {
      root.style.setProperty(name, value);
    }
  }

  function applyBranding(b) {
    if (!b || typeof b !== 'object') return;
    setHex('--color-brand', b.brand);
    setHex('--focus-ring', b.brand);
    setHex('--color-accent', b.accent);
    setHex('--color-surface', b.surface);
    if (HEX.test(b.bg || '')) {
      root.style.setProperty('--color-bg', b.bg);
      root.style.setProperty('--site-bg-color', b.bg);
    }
    setFont('--font-family-base', b.bodyFont);
    setFont('--font-family-display', b.headingFont);
  }

  fetch('/.netlify/functions/events?active', { headers: { Accept: 'application/json' } })
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (data) {
      var settings = data && data.item && data.item.settings;
      if (settings && settings.branding) applyBranding(settings.branding);
    })
    .catch(function () { /* offline / no events: keep style.css defaults */ });
})();
