/* ============================================================================
   Beslyfe — public ad serving
   A tiny, dependency-free renderer for the advertising platform. Any page can
   opt into an ad slot by adding an element:

       <div data-ad-slot="homepage_banner"></div>

   On load this finds every slot, asks the ads function which creatives are
   eligible for that placement right now (the server logs an impression per
   creative it returns), and renders them. Clicks go through the same-origin
   click tracker, which logs the click and 302-redirects to the advertiser.

   It is defensive by design: any network or data error leaves the slot empty
   and hidden, so an ad outage can never break the page it lives on. Styles are
   injected once and namespaced (.beslyfe-ad-*) so the script is self-contained and
   works identically on the homepage, the directory, or anywhere else.
   ========================================================================== */
(function () {
  'use strict';
  var ENDPOINT = '/.netlify/functions/ads';

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Inject the namespaced styles a single time.
  var STYLE_ID = 'beslyfe-ad-styles';
  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      '[data-ad-slot]{margin:0}' +
      '.beslyfe-ads{display:grid;gap:16px}' +
      '.beslyfe-ads.banner{grid-template-columns:1fr}' +
      '.beslyfe-ads.grid{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}' +
      '.beslyfe-ad{position:relative;display:flex;gap:16px;align-items:center;text-decoration:none;' +
        'background:rgba(159,226,45,.06);border:1px solid rgba(159,226,45,.35);border-radius:16px;' +
        'padding:18px 20px;color:inherit;overflow:hidden;transition:transform .15s ease,box-shadow .15s ease}' +
      '.beslyfe-ad:hover{transform:translateY(-2px);box-shadow:0 10px 30px rgba(0,0,0,.18)}' +
      '.beslyfe-ad:focus-visible{outline:3px solid #9FE22D;outline-offset:2px}' +
      '.beslyfe-ad.stack{flex-direction:column;align-items:flex-start;text-align:left}' +
      '.beslyfe-ad-img{flex:0 0 auto;width:120px;height:90px;object-fit:cover;border-radius:10px;background:#0002}' +
      '.beslyfe-ad.stack .beslyfe-ad-img{width:100%;height:150px}' +
      '.beslyfe-ad-body{flex:1 1 auto;min-width:0}' +
      '.beslyfe-ad-tag{display:inline-block;font-size:.62rem;letter-spacing:.08em;text-transform:uppercase;' +
        'font-weight:800;opacity:.65;margin-bottom:4px}' +
      '.beslyfe-ad-h{font-size:1.05rem;font-weight:800;margin:0 0 4px;line-height:1.25}' +
      '.beslyfe-ad-p{font-size:.9rem;margin:0;opacity:.85;line-height:1.4}' +
      '.beslyfe-ad-cta{display:inline-block;margin-top:10px;font-weight:800;font-size:.85rem;' +
        'background:#9FE22D;color:#0b1220;padding:8px 16px;border-radius:999px}' +
      '@media (max-width:640px){.beslyfe-ad{flex-direction:column;align-items:flex-start;text-align:left}' +
        '.beslyfe-ad-img{width:100%;height:150px}}';
    var el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    document.head.appendChild(el);
  }

  function renderCreative(ad, stacked) {
    var img = ad.imageUrl ? '<img class="beslyfe-ad-img" src="' + esc(ad.imageUrl) + '" alt="" loading="lazy">' : '';
    var cta = ad.ctaLabel ? '<span class="beslyfe-ad-cta">' + esc(ad.ctaLabel) + '</span>' : '';
    var body = ad.body ? '<p class="beslyfe-ad-p">' + esc(ad.body) + '</p>' : '';
    return '<a class="beslyfe-ad' + (stacked ? ' stack' : '') + '" href="' + esc(ad.clickUrl) + '" ' +
      'rel="sponsored noopener" target="_blank" data-ad-id="' + esc(ad.id) + '">' + img +
      '<span class="beslyfe-ad-body"><span class="beslyfe-ad-tag">Sponsored</span>' +
      '<span class="beslyfe-ad-h">' + esc(ad.headline || '') + '</span>' + body + cta + '</span></a>';
  }

  function fillSlot(slot) {
    var placement = slot.getAttribute('data-ad-slot');
    if (!placement) return;
    var count = parseInt(slot.getAttribute('data-ad-count'), 10) || 1;
    var stacked = placement !== 'homepage_banner' || count > 1;
    var qs = '?resource=serve&placement=' + encodeURIComponent(placement) +
      '&count=' + count + '&path=' + encodeURIComponent(location.pathname);
    fetch(ENDPOINT + qs, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : { items: [] }; })
      .then(function (d) {
        var items = (d && d.items) || [];
        if (!items.length) { slot.hidden = true; return; }
        ensureStyles();
        slot.hidden = false;
        slot.innerHTML = '<div class="beslyfe-ads ' + (placement === 'homepage_banner' && count === 1 ? 'banner' : 'grid') + '">' +
          items.map(function (ad) { return renderCreative(ad, stacked); }).join('') + '</div>';
      })
      .catch(function () { slot.hidden = true; });
  }

  function init() {
    var slots = document.querySelectorAll('[data-ad-slot]');
    if (!slots.length) return;
    Array.prototype.forEach.call(slots, fillSlot);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
