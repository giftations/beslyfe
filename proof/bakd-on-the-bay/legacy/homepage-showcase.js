
/**
 * homepage-showcase.js
 * Renders the homepage "Featured Sponsors", "Featured Vendors" and
 * "DJs & Live Entertainment" strips. Every strip is drawn from approved
 * community profiles in the database (the profiles function) so that whatever
 * the admin approves in the dashboard appears on the live homepage — there is
 * no separate, hand-maintained data file to keep in sync.
 *
 * Respects the homepage CMS state exposed by homepage-admin-state.js: the whole
 * site can be unpublished, and each section can be toggled off, from the admin.
 */
(function () {
  var PROFILES = '/.netlify/functions/profiles';

  var adminApi = window.bayfrontAdmin || {};
  var adminState = (adminApi.getAdminState && adminApi.getAdminState()) || {};

  // Skip all rendering when the site is unpublished.
  if (adminState.published === false) return;

  function sectionEnabled(key) {
    return adminApi.sectionEnabled ? adminApi.sectionEnabled(key) : true;
  }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Only allow same-origin/relative links or explicit http(s) URLs. A
  // user-submitted website that uses any other scheme (javascript:, data:, …)
  // is rejected so it can never become a navigation or reverse-tabnabbing sink.
  function safeUrl(url) {
    var u = String(url == null ? '' : url).trim();
    if (!u) return '';
    if (u.charAt(0) === '/') return u;
    if (/^https?:\/\//i.test(u)) return u;
    return '';
  }

  function isFeatured(p) {
    var d = p.details || {};
    return d.featured === 'true' || d.featured === true;
  }

  // Promote admin-featured profiles: if any profile in the strip is marked
  // featured, show only those; otherwise fall back to showing everyone so the
  // homepage is never empty.
  function pickFeatured(items) {
    var featured = items.filter(isFeatured);
    return featured.length ? featured : items;
  }

  // Fetch approved profiles for a role and render a card per profile.
  function renderStrip(role, containerId, buildCard, limit) {
    var container = document.getElementById(containerId);
    if (!container) return;
    fetch(PROFILES + '?role=' + encodeURIComponent(role))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var items = pickFeatured((data && data.items) || []);
        if (limit) items = items.slice(0, limit);
        container.innerHTML = items.map(buildCard).join('');
        // Make whole cards with a link clickable (open in a new tab).
        Array.prototype.forEach.call(container.querySelectorAll('[data-href]'), function (el) {
          el.addEventListener('click', function () {
            var href = safeUrl(el.getAttribute('data-href'));
            if (href) window.open(href, '_blank', 'noopener,noreferrer');
          });
        });
      })
      .catch(function () { /* leave the section's CTA buttons in place on failure */ });
  }

  function initials(name) {
    var parts = String(name || '?').trim().split(/\s+/);
    return ((parts[0] || '')[0] || '?').toUpperCase() + ((parts[1] || '')[0] || '').toUpperCase();
  }

  // A profile's logo/photo, or an initials placeholder so a featured card never
  // renders blank when an image has not been set yet.
  function showcaseImage(p) {
    if (p.headshotUrl) return '<img class="showcase-logo" src="' + esc(p.headshotUrl) + '" alt="">';
    return '<div class="showcase-logo placeholder">' + esc(initials(p.displayName)) + '</div>';
  }

  if (sectionEnabled('sponsors')) {
    renderStrip('sponsor', 'homepage-sponsors', function (p) {
      var d = p.details || {};
      var tier = d.tier || p.company || '';
      var href = safeUrl(p.website) || ('/profile?id=' + encodeURIComponent(p.id));
      return '<div class="showcase-card" data-href="' + esc(href) + '">' + showcaseImage(p) +
        '<h3>' + esc(p.displayName || 'Sponsor') + '</h3>' +
        (tier ? '<p>' + esc(String(tier).toUpperCase()) + '</p>' : '') + '</div>';
    });
  }

  if (sectionEnabled('vendors')) {
    renderStrip('vendor', 'homepage-vendors', function (p) {
      var d = p.details || {};
      var sub = d.booth ? 'Booth ' + d.booth : (p.tagline || '');
      var href = safeUrl(p.website) || ('/profile?id=' + encodeURIComponent(p.id));
      return '<div class="showcase-card" data-href="' + esc(href) + '">' + showcaseImage(p) +
        '<h3>' + esc(p.displayName || 'Vendor') + '</h3>' +
        (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>';
    });
  }

  // DJ / live-entertainment lineup is drawn from approved "dj" profiles so the
  // homepage stays in sync with the directory.
  if (sectionEnabled('entertainment')) {
    renderStrip('dj', 'homepage-entertainment', function (p) {
      var d = p.details || {};
      var genre = d.genre || d.actType || p.tagline || '';
      return '<a class="showcase-card" href="/profile?id=' + encodeURIComponent(p.id) + '">' + showcaseImage(p) +
        '<h3>' + esc(p.displayName || 'Performer') + '</h3>' +
        (genre ? '<p>' + esc(String(genre).toUpperCase()) + '</p>' : '') + '</a>';
    }, 8);
  }
})();
