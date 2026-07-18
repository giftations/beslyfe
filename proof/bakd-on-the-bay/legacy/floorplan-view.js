/* Public floor plan viewer: loads the published layout from the floorplan
   function and renders booths to scale. The stage auto-fits the viewport width;
   tapping a booth opens a details popup. */
(function () {
  var ENDPOINT = '/.netlify/functions/floorplan';

  var USE_COLORS = {
    vendor: '#9FE22D', food: '#FF7A45', sponsor: '#7C5CFF', stage: '#F472B6',
    entrance: '#22D3EE', restroom: '#64748b', lounge: '#F5B942', other: '#94a3b8'
  };
  // Premium vendor booths are drawn in gold so they read as a distinct class from
  // standard booths in both the plan and the legend.
  var PREMIUM_COLOR = '#FFC845';
  var USE_LABELS = {
    vendor: 'Vendor', food: 'Food', sponsor: 'Sponsor', stage: 'Stage / Entertainment',
    entrance: 'Entrance', restroom: 'Restroom', lounge: 'Lounge', other: 'Other'
  };
  var STATUS_LABELS = { available: 'Available', reserved: 'Reserved', sold: 'Booked' };

  // A vendor booth marked "premium" (via its tier) is a premium booth; every
  // other vendor booth is standard. Only vendor booths carry this distinction.
  function isPremiumBooth(b) {
    return !!b && b.use === 'vendor' && String(b.tier || '').toLowerCase() === 'premium';
  }
  function boothColor(b) {
    return isPremiumBooth(b) ? PREMIUM_COLOR : (USE_COLORS[b.use] || USE_COLORS.other);
  }
  // Human label for a booth's type — vendors split into Standard / Premium Booth.
  function boothTypeLabel(b) {
    if (b.use === 'vendor') return isPremiumBooth(b) ? 'Premium Booth' : 'Standard Booth';
    return USE_LABELS[b.use] || 'Booth';
  }

  var stage = document.getElementById('stage');
  var legend = document.getElementById('legend');
  var venueName = document.getElementById('venueName');
  var scaleNote = document.getElementById('scaleNote');
  var popOverlay = document.getElementById('popOverlay');
  var pop = document.getElementById('pop');
  var boothSearch = document.getElementById('boothSearch');
  var zoomIn = document.getElementById('zoomIn');
  var zoomOut = document.getElementById('zoomOut');
  var zoomReset = document.getElementById('zoomReset');

  var layout = null;
  var scale = 4;
  var zoom = 1;

  // Single reusable hover bubble, positioned over the hovered/focused booth.
  var tip = document.createElement('div');
  tip.className = 'booth-tip';
  tip.setAttribute('aria-hidden', 'true');
  document.body.appendChild(tip);

  function showTip(b, boothEl) {
    tip.innerHTML = tipHtml(b);
    tip.style.display = 'block';
    // Measure after content is in, then place centered above the booth, clamped to the viewport.
    var r = boothEl.getBoundingClientRect();
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    var left = Math.max(8, Math.min(window.innerWidth - tw - 8, r.left + r.width / 2 - tw / 2));
    var top = r.top - th - 10;
    if (top < 8) top = Math.min(window.innerHeight - th - 8, r.bottom + 10); // flip below if no room above
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
    requestAnimationFrame(function () { tip.classList.add('show'); });
  }
  function hideTip() {
    tip.classList.remove('show');
    tip.style.display = 'none';
  }

  function escHtml(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Initials for the logo placeholder when a booth has no logo image.
  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/);
    if (!parts[0]) return '•';
    return ((parts[0][0] || '') + (parts[1] ? parts[1][0] : '')).toUpperCase();
  }

  // The vendor/company name a booth carries — its assignment, falling back to its label.
  function boothName(b) {
    return (b.assignedTo && b.assignedTo.trim()) || (b.label ? 'Booth ' + b.label : boothTypeLabel(b));
  }

  // Inner HTML for the hover bubble: logo (or initials) + company info.
  function tipHtml(b) {
    var name = boothName(b);
    var color = boothColor(b);
    var logo = b.logoUrl
      ? '<img class="tip-logo" src="' + escHtml(b.logoUrl) + '" alt="" onerror="this.style.display=\'none\'">'
      : '<div class="tip-logo placeholder">' + escHtml(initials(name)) + '</div>';
    var meta = [boothTypeLabel(b), STATUS_LABELS[b.status] || b.status, b.price]
      .filter(Boolean).map(escHtml).join(' · ');
    return '<div class="tip-head">' + logo +
      '<div><div class="tip-name">' + escHtml(name) + '</div>' +
      (meta ? '<div class="tip-meta">' + meta + '</div>' : '') + '</div></div>' +
      (b.notes ? '<p class="tip-note">' + escHtml(b.notes) + '</p>' : '') +
      '<span class="tip-pill" style="background:' + color + '">' + escHtml(boothTypeLabel(b)) + '</span>';
  }

  function computeScale() {
    if (!layout) return 4;
    var avail = Math.min(stage.parentElement.clientWidth, 1160) - 4;
    var fit = avail / (layout.venue.widthFt || 200);
    return Math.max(2, Math.min(10, fit)) * zoom;
  }

  function boothText(b) {
    return [b.label, b.use, b.status, b.tier, b.price, b.assignedTo, b.notes].join(' ').toLowerCase();
  }

  function render() {
    if (!layout) return;
    scale = computeScale();
    venueName.textContent = layout.venue.name || '';
    stage.style.width = (layout.venue.widthFt * scale) + 'px';
    stage.style.height = (layout.venue.heightFt * scale) + 'px';
    stage.style.backgroundSize = (5 * scale) + 'px ' + (5 * scale) + 'px';
    stage.innerHTML = '';

    if (!layout.booths.length) {
      stage.style.height = 'auto';
      stage.innerHTML = '<p class="empty">The floor plan is being finalized — check back soon.</p>';
      scaleNote.textContent = '';
      legend.innerHTML = '';
      return;
    }

    layout.booths.forEach(function (b) {
      var el = document.createElement('div');
      el.className = 'booth status-' + (b.status || 'available');
      el.tabIndex = 0;
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', (b.label ? 'Booth ' + b.label : 'Floor space') + (b.assignedTo ? ', ' + b.assignedTo : '') + ', ' + (STATUS_LABELS[b.status] || b.status || ''));
      el.dataset.search = boothText(b);
      el.style.left = (b.x * scale) + 'px';
      el.style.top = (b.y * scale) + 'px';
      el.style.width = (b.wFt * scale) + 'px';
      el.style.height = (b.hFt * scale) + 'px';
      el.style.background = boothColor(b);
      el.innerHTML = '<span class="lbl">' + escHtml(b.label || '') + '</span>';
      el.addEventListener('click', function () { openPopup(b); });
      el.addEventListener('mouseenter', function () { showTip(b, el); });
      el.addEventListener('mouseleave', hideTip);
      el.addEventListener('focus', function () { showTip(b, el); });
      el.addEventListener('blur', hideTip);
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openPopup(b);
        }
      });
      stage.appendChild(el);
    });

    renderLegend();
    applySearch();
    scaleNote.textContent = 'Venue ' + layout.venue.widthFt + ' ft × ' + layout.venue.heightFt + ' ft · ' + layout.booths.length + ' spaces · drawn to scale';
  }

  function renderLegend() {
    var used = {};
    layout.booths.forEach(function (b) { used[b.use] = true; });
    var hasStandard = layout.booths.some(function (b) { return b.use === 'vendor' && !isPremiumBooth(b); });
    var hasPremium = layout.booths.some(isPremiumBooth);
    var parts = [];
    Object.keys(USE_LABELS).forEach(function (k) {
      if (!used[k]) return;
      if (k === 'vendor') {
        // Show standard and premium booths as separate keys, each in its color.
        if (hasStandard) parts.push('<span><i style="background:' + USE_COLORS.vendor + '"></i>Standard Booth</span>');
        if (hasPremium) parts.push('<span><i style="background:' + PREMIUM_COLOR + '"></i>Premium Booth</span>');
      } else {
        parts.push('<span><i style="background:' + USE_COLORS[k] + '"></i>' + USE_LABELS[k] + '</span>');
      }
    });
    legend.innerHTML = parts.join('') + '<span><i style="background:rgba(159,226,45,.45);border:1px dashed #fff"></i>Available</span><span><i style="background:rgba(255,255,255,.35)"></i>Booked / Reserved</span>';
  }

  function applySearch() {
    var q = boothSearch ? boothSearch.value.trim().toLowerCase() : '';
    Array.prototype.forEach.call(stage.querySelectorAll('.booth'), function (el) {
      var match = q && el.dataset.search.indexOf(q) !== -1;
      el.classList.toggle('is-match', Boolean(match));
      el.style.opacity = q && !match ? '.28' : '';
    });
  }

  function setZoom(next) {
    zoom = Math.max(.7, Math.min(2.2, next));
    if (zoomReset) zoomReset.textContent = Math.round(zoom * 100) + '%';
    render();
  }

  var lastFocused = null;

  function openPopup(b) {
    hideTip();
    lastFocused = document.activeElement;
    var color = boothColor(b);
    var typeLabel = boothTypeLabel(b);
    var rows = '';
    rows += '<dt>Type</dt><dd>' + escHtml(typeLabel) + '</dd>';
    if (b.tier) rows += '<dt>Tier</dt><dd>' + escHtml(b.tier.charAt(0).toUpperCase() + b.tier.slice(1)) + '</dd>';
    rows += '<dt>Status</dt><dd>' + escHtml(STATUS_LABELS[b.status] || b.status || '') + '</dd>';
    rows += '<dt>Size</dt><dd>' + b.wFt + ' ft × ' + b.hFt + ' ft</dd>';
    if (b.price) rows += '<dt>Price</dt><dd>' + escHtml(b.price) + '</dd>';
    if (b.assignedTo) rows += '<dt>Booked by</dt><dd>' + escHtml(b.assignedTo) + '</dd>';
    if (b.notes) rows += '<dt>Notes</dt><dd>' + escHtml(b.notes) + '</dd>';
    var name = boothName(b);
    var logoHtml = b.logoUrl
      ? '<img src="' + escHtml(b.logoUrl) + '" alt="" style="width:56px;height:56px;border-radius:12px;object-fit:cover;border:1px solid rgba(255,255,255,.14);flex:0 0 auto" onerror="this.style.display=\'none\'">'
      : '';
    pop.innerHTML = '<button class="close" aria-label="Close">&times;</button>' +
      '<span class="use-pill" style="background:' + color + '">' + escHtml(typeLabel) + '</span>' +
      '<div style="display:flex;align-items:center;gap:12px;margin-top:8px">' + logoHtml +
        '<h3 style="margin:0">' + escHtml(b.assignedTo ? name : (b.label ? 'Booth ' + b.label : typeLabel)) + '</h3></div>' +
      '<dl>' + rows + '</dl>' +
      (b.status !== 'sold' && b.use === 'vendor' ? '<p style="margin-top:14px"><a href="/vendors" style="color:var(--green);font-weight:700">Apply for this booth →</a></p>' : '');
    popOverlay.classList.add('open');
    popOverlay.setAttribute('role', 'dialog');
    popOverlay.setAttribute('aria-modal', 'true');
    popOverlay.setAttribute('aria-label', (b.label ? 'Booth ' + b.label : typeLabel) + ' details');
    var closeBtn = pop.querySelector('.close');
    closeBtn.addEventListener('click', closePopup);
    closeBtn.focus();
  }

  function closePopup() {
    popOverlay.classList.remove('open');
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
    lastFocused = null;
  }
  popOverlay.addEventListener('click', function (e) { if (e.target === popOverlay) closePopup(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && popOverlay.classList.contains('open')) closePopup();
  });
  if (boothSearch) boothSearch.addEventListener('input', applySearch);
  if (zoomIn) zoomIn.addEventListener('click', function () { setZoom(zoom + .15); });
  if (zoomOut) zoomOut.addEventListener('click', function () { setZoom(zoom - .15); });
  if (zoomReset) zoomReset.addEventListener('click', function () { setZoom(1); });

  var resizeTimer;
  window.addEventListener('resize', function () { hideTip(); clearTimeout(resizeTimer); resizeTimer = setTimeout(render, 150); });
  // Keep the bubble pinned to its booth: hide it the moment anything scrolls.
  window.addEventListener('scroll', hideTip, true);
  var stageScroll = document.querySelector('.stage-scroll');
  if (stageScroll) stageScroll.addEventListener('scroll', hideTip, { passive: true });

  fetch(ENDPOINT)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      layout = {
        venue: { name: (data.venue && data.venue.name) || 'Bayfront Convention Center', widthFt: (data.venue && data.venue.widthFt) || 200, heightFt: (data.venue && data.venue.heightFt) || 120 },
        booths: Array.isArray(data.booths) ? data.booths : []
      };
      render();
    })
    .catch(function () {
      stage.innerHTML = '<p class="empty">Could not load the floor plan right now.</p>';
    });
})();
