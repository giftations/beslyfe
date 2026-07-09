/* ============================================================================
   Bak'd On The Bay — public ad serving
   A tiny, dependency-free renderer for the advertising platform. Any page can
   opt into an ad slot by adding an element:

       <div data-ad-slot="homepage_banner"></div>

   On load this finds every slot, asks the ads function which creatives are
   eligible for that placement right now (the server logs an impression per
   creative it returns), and renders them. Clicks go through the same-origin
   click tracker, which logs the click and 302-redirects to the advertiser.

   It is defensive by design: any network or data error leaves the slot empty
   and hidden, so an ad outage can never break the page it lives on. Styles are
   injected once and namespaced (.bakd-ad-*) so the script is self-contained and
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
  var STYLE_ID = 'bakd-ad-styles';
  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      '[data-ad-slot]{margin:0}' +
      '.bakd-ads{display:grid;gap:16px}' +
      '.bakd-ads.banner{grid-template-columns:1fr}' +
      '.bakd-ads.grid{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}' +
      '.bakd-ad{position:relative;display:flex;gap:16px;align-items:center;text-decoration:none;' +
        'background:rgba(159,226,45,.06);border:1px solid rgba(159,226,45,.35);border-radius:16px;' +
        'padding:18px 20px;color:inherit;overflow:hidden;transition:transform .15s ease,box-shadow .15s ease}' +
      '.bakd-ad:hover{transform:translateY(-2px);box-shadow:0 10px 30px rgba(0,0,0,.18)}' +
      '.bakd-ad:focus-visible{outline:3px solid #9FE22D;outline-offset:2px}' +
      '.bakd-ad.stack{flex-direction:column;align-items:flex-start;text-align:left}' +
      '.bakd-ad-img{flex:0 0 auto;width:120px;height:90px;object-fit:cover;border-radius:10px;background:#0002}' +
      '.bakd-ad.stack .bakd-ad-img{width:100%;height:150px}' +
      '.bakd-ad-body{flex:1 1 auto;min-width:0}' +
      '.bakd-ad-tag{display:inline-block;font-size:.62rem;letter-spacing:.08em;text-transform:uppercase;' +
        'font-weight:800;opacity:.65;margin-bottom:4px}' +
      '.bakd-ad-h{font-size:1.05rem;font-weight:800;margin:0 0 4px;line-height:1.25}' +
      '.bakd-ad-p{font-size:.9rem;margin:0;opacity:.85;line-height:1.4}' +
      '.bakd-ad-cta{display:inline-block;margin-top:10px;font-weight:800;font-size:.85rem;' +
        'background:#9FE22D;color:#0b1220;padding:8px 16px;border-radius:999px}' +
      '@media (max-width:640px){.bakd-ad{flex-direction:column;align-items:flex-start;text-align:left}' +
        '.bakd-ad-img{width:100%;height:150px}}';
    var el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    document.head.appendChild(el);
  }

  function renderCreative(ad, stacked) {
    var img = ad.imageUrl ? '<img class="bakd-ad-img" src="' + esc(ad.imageUrl) + '" alt="" loading="lazy">' : '';
    var cta = ad.ctaLabel ? '<span class="bakd-ad-cta">' + esc(ad.ctaLabel) + '</span>' : '';
    var body = ad.body ? '<p class="bakd-ad-p">' + esc(ad.body) + '</p>' : '';
    return '<a class="bakd-ad' + (stacked ? ' stack' : '') + '" href="' + esc(ad.clickUrl) + '" ' +
      'rel="sponsored noopener" target="_blank" data-ad-id="' + esc(ad.id) + '">' + img +
      '<span class="bakd-ad-body"><span class="bakd-ad-tag">Sponsored</span>' +
      '<span class="bakd-ad-h">' + esc(ad.headline || '') + '</span>' + body + cta + '</span></a>';
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
        slot.innerHTML = '<div class="bakd-ads ' + (placement === 'homepage_banner' && count === 1 ? 'banner' : 'grid') + '">' +
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
