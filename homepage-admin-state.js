/**
 * homepage-admin-state.js  (site-wide CMS loader)
 * Fetches the published settings for the CURRENT page from the server (Netlify
 * Function backed by Netlify Blobs) and applies them so that admin changes
 * appear on the live site for every visitor, on every device — not just on the
 * homepage. Every page that includes this script becomes editable.
 *
 * Applies on any page: brand theme colors, editable page text (every [data-cms]
 * node) and editable buttons (every [data-cms-btn] anchor: label, link, show/
 * hide), plus the hero media (image OR uploaded video) when the page has a
 * .hero element.
 *
 * Homepage-only extras (publish "Coming Soon", featured event, section
 * visibility toggles, section reordering) apply only when the page key is
 * "homepage".
 *
 * The welcome-banner reset remains in localStorage because it is an
 * intentionally per-browser affordance (it re-shows the one-time welcome
 * overlay on this device only). It runs synchronously below so that main.js
 * reads the correct value when it checks the overlay on DOMContentLoaded.
 */
(function () {
  'use strict';

  /**
   * Derives a stable page key from the current path so each page stores its own
   * settings. "/" and "/index.html" map to "homepage"; "/about.html" -> "about";
   * "/vendor-application.html" -> "vendor-application". Must match the slugs the
   * admin editor saves under and the site-settings page validation.
   */
  function currentPageKey() {
    var path = (location.pathname || '/').toLowerCase();
    // Allow an explicit override (used by the admin preview iframe).
    var body = document.body;
    if (body && body.getAttribute('data-cms-page')) {
      return body.getAttribute('data-cms-page');
    }
    var file = path.replace(/\/+$/, '').split('/').pop() || '';
    if (path === '/' || file === '' || file === 'index.html' || file === 'index') {
      return 'homepage';
    }
    var slug = file.replace(/\.html?$/, '');
    if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(slug)) return 'homepage';
    return slug;
  }

  var PAGE_KEY = currentPageKey();
  var SETTINGS_ENDPOINT = '/.netlify/functions/site-settings?page=' + encodeURIComponent(PAGE_KEY);
  var STATE_KEY = 'bayfront.admin.state';
  // Per-page cache of the just-published hero media/overlay/position. Written
  // after every successful fetch and read by the inline preload script in the
  // page <head> so the saved hero paints on the first frame instead of the CSS
  // default swapping in after this fetch resolves (the "loads twice" flash).
  var HERO_CACHE_KEY = 'bayfront.hero.cache.' + PAGE_KEY;

  /**
   * Banner Reset (per-browser) — runs synchronously so main.js reads the
   * correct bakd_entered value on DOMContentLoaded. Clears the flag after
   * processing so it only fires once.
   */
  (function applyBannerReset() {
    try {
      var state = JSON.parse(localStorage.getItem(STATE_KEY) || '{}');
      if (!state.homepageBannerReset) return;
      localStorage.removeItem('bakd_entered');
      localStorage.setItem(
        STATE_KEY,
        JSON.stringify(Object.assign({}, state, { homepageBannerReset: false }))
      );
    } catch (_e) { /* ignore in restricted environments */ }
  })();

  /** Replaces main content with a "coming soon" notice when unpublished. */
  function applyPublishState(settings) {
    if (settings.published !== false) return true;
    var main = document.getElementById('main-content');
    if (main) {
      main.innerHTML =
        '<section class="section"><div class="container" style="text-align:center;padding:4rem 1rem;">' +
        '<h2>Coming Soon</h2>' +
        '<p>This page is currently unavailable. Please check back soon.</p>' +
        '</div></section>';
    }
    return false;
  }

  /** Shows/hides the #featured-event section based on settings. */
  function applyFeaturedEvent(settings) {
    var section = document.getElementById('featured-event');
    if (!section) return;
    var name = typeof settings.featuredEvent === 'string' ? settings.featuredEvent.trim() : '';
    if (name) {
      var nameEl = section.querySelector('.featured-event-name');
      if (nameEl) nameEl.textContent = name;
      section.hidden = false;
    } else {
      section.hidden = true;
    }
  }

  /**
   * Hides a section only when the admin has explicitly saved an empty string
   * for the matching content key. Undefined (never saved) leaves it visible.
   */
  function sectionEnabled(content, key) {
    return !(
      content &&
      Object.prototype.hasOwnProperty.call(content, key) &&
      content[key] === ''
    );
  }

  function applyContentToggles(settings) {
    var content = settings.content || {};
    var toggles = [
      { key: 'vendors',  id: 'vendors'           },
      { key: 'sponsors', id: 'sponsors'          },
      { key: 'speakers', id: 'education-station' },
    ];
    toggles.forEach(function (t) {
      var section = document.getElementById(t.id);
      if (section) section.hidden = !sectionEnabled(content, t.key);
    });
  }

  /**
   * Applies the admin-chosen hero media, overlay darkness and position. Supports
   * both an image (set as a CSS background) and an uploaded video (rendered as a
   * muted, looping, autoplaying <video> layer behind the hero content). The
   * overlay variables are set on the .hero element itself (not :root) so they
   * win over any page-level defaults.
   */
  function isVideoBackground(settings) {
    if (settings.heroBackgroundKind === 'video') return true;
    if (settings.heroBackgroundKind === 'image') return false;
    // Fall back to extension sniffing for older saved settings.
    var bg = settings.heroBackground;
    return typeof bg === 'string' && /\.(mp4|webm|ogv|ogg|mov)(\?|$)/i.test(bg);
  }

  function applyHeroVideo(hero, src) {
    var existing = hero.querySelector('video.cms-hero-video');
    if (existing && existing.getAttribute('data-src') === src) return;
    if (existing) existing.remove();

    var video = document.createElement('video');
    video.className = 'cms-hero-video';
    video.setAttribute('data-src', src);
    video.src = src;
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('aria-hidden', 'true');
    video.setAttribute('tabindex', '-1');
    // Cover the hero, sit behind its content.
    video.style.position = 'absolute';
    video.style.inset = '0';
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'cover';
    video.style.zIndex = '0';
    video.style.pointerEvents = 'none';

    var cs = window.getComputedStyle ? window.getComputedStyle(hero) : null;
    if (!cs || cs.position === 'static') hero.style.position = 'relative';
    // Keep hero text/buttons above the video.
    Array.prototype.forEach.call(hero.children, function (child) {
      var ccs = window.getComputedStyle ? window.getComputedStyle(child) : null;
      if (!ccs || ccs.position === 'static') child.style.position = 'relative';
      if (!child.style.zIndex) child.style.zIndex = '1';
    });
    // Remove any CSS image so it does not show through transparent video edges.
    hero.style.setProperty('--hero-image', 'none');
    hero.insertBefore(video, hero.firstChild);
    var p = video.play();
    if (p && typeof p.catch === 'function') p.catch(function () { /* autoplay blocked — first frame still shows */ });
  }

  function applyHeroBackground(settings) {
    // The homepage uses a .hero element; interior pages (applications,
    // directory, feed, profiles, …) use .page-hero. Targeting both lets every
    // page carry its own admin-chosen background image or video.
    var hero = document.querySelector('.hero') || document.querySelector('.page-hero');
    if (!hero) return;

    var bg = settings.heroBackground;
    if (bg && typeof bg === 'string') {
      if (isVideoBackground(settings)) {
        applyHeroVideo(hero, bg);
      } else {
        var stale = hero.querySelector('video.cms-hero-video');
        if (stale) stale.remove();
        // Only accept a relative path or an http(s) URL with no characters that
        // could break out of the CSS url() context. Anything else is ignored so
        // the hero background can never become a CSS-injection sink.
        if (/^(\/|https?:\/\/)[^'"()\s]+$/i.test(bg)) {
          var cssUrl = "url('" + bg + "')";
          hero.style.setProperty('--hero-image', cssUrl);
          document.documentElement.style.setProperty('--hero-image', cssUrl);
        }
      }
    } else {
      // No saved hero background. Clear any override the preload script applied
      // from a now-stale cache (and any leftover video) so the CSS default hero
      // image shows — the fetched settings are authoritative.
      var staleVideo = hero.querySelector('video.cms-hero-video');
      if (staleVideo) staleVideo.remove();
      hero.style.removeProperty('--hero-image');
      document.documentElement.style.removeProperty('--hero-image');
    }

    if (typeof settings.heroOverlay === 'number') {
      var a = Math.max(0, Math.min(90, settings.heroOverlay)) / 100;
      // Slightly stronger at the bottom for legible call-to-action buttons.
      var bottom = Math.min(0.95, a + 0.15);
      hero.style.setProperty('--site-bg-overlay-top', 'rgba(0,0,0,' + a.toFixed(2) + ')');
      hero.style.setProperty('--site-bg-overlay-bottom', 'rgba(0,0,0,' + bottom.toFixed(2) + ')');
      document.documentElement.style.setProperty('--site-bg-overlay-top', 'rgba(0,0,0,' + a.toFixed(2) + ')');
      document.documentElement.style.setProperty('--site-bg-overlay-bottom', 'rgba(0,0,0,' + bottom.toFixed(2) + ')');
    }

    if (typeof settings.heroPosition === 'string' && settings.heroPosition) {
      hero.style.setProperty('--hero-position', settings.heroPosition);
      document.documentElement.style.setProperty('--hero-position', settings.heroPosition);
    }
  }

  /**
   * Persists the hero-relevant settings so the inline preload script in the page
   * <head> can apply them before first paint on the next visit. Only the fields
   * that drive the hero background are stored; everything is re-validated by the
   * preload script before use.
   */
  function cacheHeroSettings(settings) {
    try {
      var payload = {
        heroBackground: typeof settings.heroBackground === 'string' ? settings.heroBackground : null,
        heroBackgroundKind: (settings.heroBackgroundKind === 'video' || settings.heroBackgroundKind === 'image')
          ? settings.heroBackgroundKind : null,
        heroOverlay: typeof settings.heroOverlay === 'number' ? settings.heroOverlay : null,
        heroPosition: typeof settings.heroPosition === 'string' ? settings.heroPosition : null,
      };
      localStorage.setItem(HERO_CACHE_KEY, JSON.stringify(payload));
    } catch (_e) { /* ignore in restricted environments */ }
  }

  /** Applies brand/background theme colors as CSS variables on :root. */
  function applyTheme(settings) {
    var theme = settings.theme;
    if (!theme || typeof theme !== 'object') return;
    var root = document.documentElement;
    if (!root) return;
    if (typeof theme.brand === 'string' && /^#[0-9a-fA-F]{6}$/.test(theme.brand)) {
      root.style.setProperty('--color-brand', theme.brand);
      root.style.setProperty('--focus-ring', theme.brand);
    }
    if (theme.bg === null) {
      root.style.removeProperty('--color-bg');
      root.style.removeProperty('--site-bg-color');
      return;
    }
    if (typeof theme.bg === 'string' && /^#[0-9a-fA-F]{6}$/.test(theme.bg)) {
      root.style.setProperty('--color-bg', theme.bg);
      root.style.setProperty('--site-bg-color', theme.bg);
    }
  }

  /** Overrides editable page copy for every [data-cms] node. */
  function applyTexts(settings) {
    var texts = settings.texts;
    if (!texts || typeof texts !== 'object') return;
    var nodes = document.querySelectorAll('[data-cms]');
    Array.prototype.forEach.call(nodes, function (el) {
      var key = el.getAttribute('data-cms');
      if (!key) return;
      var val = texts[key];
      // Apply only non-empty overrides; an empty/absent value keeps the default.
      if (typeof val === 'string' && val.trim() !== '') {
        el.textContent = val;
      }
    });
  }

  /** Overrides label, link and visibility for every [data-cms-btn] anchor. */
  function applyButtons(settings) {
    var buttons = settings.buttons;
    if (!buttons || typeof buttons !== 'object') return;
    var nodes = document.querySelectorAll('[data-cms-btn]');
    Array.prototype.forEach.call(nodes, function (el) {
      var key = el.getAttribute('data-cms-btn');
      if (!key) return;
      var cfg = buttons[key];
      if (!cfg || typeof cfg !== 'object') return;
      if (cfg.hidden === true) {
        el.hidden = true;
        el.style.display = 'none';
        return;
      }
      el.hidden = false;
      el.style.removeProperty('display');
      if (typeof cfg.label === 'string' && cfg.label.trim() !== '') {
        el.textContent = cfg.label;
      }
      if (typeof cfg.href === 'string' && cfg.href.trim() !== '') {
        el.setAttribute('href', cfg.href);
      }
      if (typeof cfg.bgColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(cfg.bgColor)) {
        el.style.setProperty('--btn-bg', cfg.bgColor);
        el.style.setProperty('--btn-shadow', hexToRgba(cfg.bgColor, 0.32));
      }
      if (typeof cfg.textColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(cfg.textColor)) {
        el.style.setProperty('--btn-text', cfg.textColor);
      }
    });
  }

  function hexToRgba(hex, alpha) {
    var m = /^#([0-9a-fA-F]{6})$/.exec(hex);
    if (!m) return 'rgba(159,226,45,' + alpha + ')';
    var n = parseInt(m[1], 16);
    var r = (n >> 16) & 255;
    var g = (n >> 8) & 255;
    var b = n & 255;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  /** Applies the admin-controlled navbar brand text and/or image. */
  function applyBrand(settings) {
    var brand = settings.brand;
    if (!brand || typeof brand !== 'object') return;
    var logo = document.querySelector('.logo, .site-logo');
    if (!logo) return;

    var text = typeof brand.text === 'string' && brand.text.trim() ? brand.text.trim() : logo.textContent.trim();
    var image = typeof brand.image === 'string' ? brand.image.trim() : '';
    var showImage = brand.showImage === true && image;
    var showText = brand.showText !== false;
    var style = brand.style && typeof brand.style === 'object' ? brand.style : {};
    var root = document.documentElement;

    if (typeof style.logoFontSize === 'number') {
      root.style.setProperty('--nav-logo-font-size', Math.max(1, Math.min(2, style.logoFontSize)) + 'rem');
    }
    if (typeof style.logoImageHeight === 'number') {
      root.style.setProperty('--nav-logo-image-height', Math.max(32, Math.min(88, style.logoImageHeight)) + 'px');
    }
    if (typeof style.linkFontSize === 'number') {
      root.style.setProperty('--nav-link-font-size', Math.max(0.75, Math.min(1.05, style.linkFontSize)) + 'rem');
    }

    logo.textContent = '';
    logo.classList.toggle('logo-has-image', !!showImage);
    logo.classList.toggle('logo-image-only', !!showImage && !showText);

    if (showImage) {
      var img = document.createElement('img');
      img.className = 'logo-image';
      img.src = image;
      img.alt = '';
      logo.appendChild(img);
    }
    if (showText) {
      var span = document.createElement('span');
      span.className = 'logo-text';
      span.textContent = text;
      logo.appendChild(span);
    }
    logo.setAttribute('aria-label', text ? text + ' home' : 'Home');
  }

  /** Makes selected homepage section bands transparent so the page background shows through. */
  function applySectionTransparency(settings) {
    var map = settings.sectionTransparency;
    if (!map || typeof map !== 'object') return;
    Object.keys(map).forEach(function (id) {
      var section = document.getElementById(id);
      if (section) section.classList.toggle('section-transparent', map[id] === true);
    });
  }

  /** Reorders the homepage sections after the hero to match saved order. */
  function applySectionOrder(settings) {
    var savedOrder = settings.sectionOrder;
    if (!Array.isArray(savedOrder) || savedOrder.length === 0) return;

    var main = document.getElementById('main-content');
    if (!main) return;
    var hero = main.querySelector('section.hero');
    if (!hero) return;

    var allSections = Array.prototype.slice
      .call(main.querySelectorAll(':scope > section'))
      .filter(function (s) { return s !== hero; });

    var byId = {};
    allSections.forEach(function (s) { if (s.id) byId[s.id] = s; });

    var placed = [];
    var newOrder = [];
    savedOrder.forEach(function (id) {
      var s = byId[id];
      if (s && placed.indexOf(s) === -1) {
        newOrder.push(s);
        placed.push(s);
      }
    });
    allSections.forEach(function (s) {
      if (placed.indexOf(s) === -1) newOrder.push(s);
    });

    // Skip the DOM moves when the sections are already in the desired order.
    // Re-appending nodes on every load forces a reflow that visibly flashes
    // the page (and floating UI such as the menu button) a second after load.
    var unchanged = newOrder.length === allSections.length &&
      newOrder.every(function (s, i) { return s === allSections[i]; });
    if (unchanged) return;

    newOrder.forEach(function (s) { main.appendChild(s); });
  }

  /** Applies the full settings document to the page. */
  function applyAdminState(settings) {
    var isHome = PAGE_KEY === 'homepage';
    // Theme, text, buttons and hero media apply to every page.
    applyTheme(settings);
    applyTexts(settings);
    applyButtons(settings);
    applyBrand(settings);
    applyHeroBackground(settings);
    // Homepage-only structural behaviors.
    if (isHome) {
      if (!applyPublishState(settings)) return; // unpublished — stop here
      applyFeaturedEvent(settings);
      applyContentToggles(settings);
      applySectionTransparency(settings);
      applySectionOrder(settings);
    }
  }

  /** Fetches settings, then applies them once the DOM is ready. */
  function init() {
    fetch(SETTINGS_ENDPOINT, { headers: { Accept: 'application/json' } })
      .then(function (res) { return res.ok ? res.json() : {}; })
      .then(function (settings) {
        if (!settings || typeof settings !== 'object') settings = {};
        // Refresh the per-page hero cache so the next visit's preload script can
        // paint the saved hero on the first frame (no post-fetch swap flash).
        cacheHeroSettings(settings);
        // Apply the settings (including the saved section order), then reveal the
        // sections the cms-ordering guard in index.html hid — so the page paints
        // once, already in order, instead of reshuffling after load. try/finally
        // guarantees the reveal even if applyAdminState throws.
        var run = function () {
          try { applyAdminState(settings); } finally { revealSections(); }
        };
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', run);
        } else {
          run();
        }
      })
      .catch(function () { revealSections(); /* network error: leave default homepage as-is */ });
  }

  /**
   * Reveal the homepage sections hidden by the `cms-ordering` guard in
   * index.html once the saved section order has been applied. Idempotent, and a
   * no-op on pages that don't carry the guard.
   */
  function revealSections() {
    var root = document.documentElement;
    if (root) root.classList.remove('cms-ordering');
  }

  init();
})();
