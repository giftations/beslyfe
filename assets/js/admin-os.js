/* ============================================================================
   Bak'd Admin OS — Shell runtime
   A single-page "mission control" that unifies every admin workspace behind one
   persistent sidebar, one command palette, and one design language. Modules are
   self-contained render functions; rich existing editors (Website CMS, Floor
   Plan, Schedule) are embedded so no functionality is lost.
   ========================================================================== */
(function () {
  'use strict';

  // ── Endpoints ─────────────────────────────────────────────────────────────
  var API = {
    apps: '/.netlify/functions/applications',
    profiles: '/.netlify/functions/profiles',
    social: '/.netlify/functions/social',
    auth: '/.netlify/functions/auth',
    media: '/.netlify/functions/site-media',
    settings: '/.netlify/functions/site-settings?page=homepage',
    floorplan: '/.netlify/functions/floorplan',
    events: '/.netlify/functions/events',
    audit: '/.netlify/functions/audit-log',
    crm: '/.netlify/functions/crm',
    ads: '/.netlify/functions/ads',
    dashboards: '/.netlify/functions/dashboards',
    tickets: '/.netlify/functions/tickets',
    dataExport: '/.netlify/functions/data-export',
  };

  // ── Session gate ──────────────────────────────────────────────────────────
  var session = null;
  try { session = JSON.parse(localStorage.getItem('bakd_session') || 'null'); } catch (e) {}
  if (!session || session.role !== 'admin') { location.replace('/admin-login.html'); return; }

  // Authoritative server check. The localStorage gate above is only a fast,
  // spoofable fast-fail — a forged `bakd_session` would pass it. Confirm with the
  // server, which derives identity from the httpOnly session cookie the client
  // cannot read or set, that this browser really holds an approved admin session.
  // If not, clear local state and bounce to login. Runs in the background so the
  // shell still paints instantly for genuine admins; a network error leaves the
  // local gate in place rather than locking anyone out on a transient blip.
  fetch(API.auth + '?action=session', { headers: { Accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      var acct = d && d.account;
      if (!acct || acct.role !== 'admin') {
        try { localStorage.removeItem('bakd_session'); localStorage.removeItem('bay_active_profile'); } catch (e) {}
        location.replace('/admin-login.html');
      }
    })
    .catch(function () { /* transient network error — keep the local gate */ });

  // ── Tiny helpers ──────────────────────────────────────────────────────────
  function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function h(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function initials(n) { var p = String(n || '?').trim().split(/\s+/); return ((p[0] || '')[0] || '?').toUpperCase() + ((p[1] || '')[0] || '').toUpperCase(); }
  function fmtDate(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
  function fmtDateTime(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  function debounce(fn, ms) { var t; return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); }; }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function avatar(url, name, sq) { return url ? '<img class="avatar' + (sq ? ' sq' : '') + '" src="' + esc(url) + '" alt="">' : '<div class="avatar' + (sq ? ' sq' : '') + '">' + esc(initials(name)) + '</div>'; }

  function api(url, opts) {
    return fetch(url, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || ('Request failed (HTTP ' + r.status + ')'));
        return d;
      });
    });
  }

  // ── Toasts (with optional undo) ───────────────────────────────────────────
  var toastHost;
  function toast(msg, opts) {
    opts = opts || {};
    var t = h('<div class="toast ' + (opts.type || '') + '"><span class="grow">' + esc(msg) + '</span></div>');
    if (opts.undo) {
      var u = h('<button class="undo">Undo</button>');
      u.onclick = function () { opts.undo(); dismiss(); };
      t.appendChild(u);
    }
    var x = h('<button class="x" aria-label="Dismiss">×</button>');
    x.onclick = dismiss; t.appendChild(x);
    toastHost.appendChild(t);
    var timer = setTimeout(dismiss, opts.undo ? 6000 : 3200);
    function dismiss() { clearTimeout(timer); t.style.opacity = '0'; setTimeout(function () { t.remove(); }, 200); }
    return dismiss;
  }

  // ── Drawer ────────────────────────────────────────────────────────────────
  var scrim, drawer, drawerBody, drawerTitle, drawerFoot;

  // Focus management shared by the drawer and command palette. Keeping keyboard
  // focus inside an open overlay (and returning it to the trigger on close) is a
  // baseline requirement for keyboard and screen-reader users; without it Tab
  // walks off into the page behind the overlay.
  var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  function focusablesIn(el) {
    return Array.prototype.filter.call(el.querySelectorAll(FOCUSABLE), function (n) {
      return n.offsetWidth > 0 || n.offsetHeight > 0 || n === document.activeElement;
    });
  }
  // Confine Tab/Shift+Tab to `el` while it is open. Returns a handler to detach.
  function trapFocus(el) {
    function onKey(e) {
      if (e.key !== 'Tab') return;
      var items = focusablesIn(el);
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    el.addEventListener('keydown', onKey);
    return function () { el.removeEventListener('keydown', onKey); };
  }

  var drawerReturnFocus = null, drawerUntrap = null;
  function openDrawer(title, bodyEl, footEl) {
    drawerTitle.textContent = title;
    drawerBody.innerHTML = ''; drawerBody.appendChild(bodyEl);
    drawerFoot.innerHTML = ''; if (footEl) drawerFoot.appendChild(footEl);
    drawerFoot.style.display = footEl ? 'flex' : 'none';
    scrim.classList.add('open'); drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    // Remember where focus was so it can be restored, then move focus into the
    // panel (its first field if there is one, otherwise the close button).
    drawerReturnFocus = document.activeElement;
    if (drawerUntrap) { drawerUntrap(); }
    drawerUntrap = trapFocus(drawer);
    var first = drawerBody.querySelector(FOCUSABLE);
    (first || document.getElementById('drawerClose')).focus();
  }
  function closeDrawer() {
    if (!drawer.classList.contains('open')) return;
    scrim.classList.remove('open'); drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    if (drawerUntrap) { drawerUntrap(); drawerUntrap = null; }
    if (drawerReturnFocus && drawerReturnFocus.focus) drawerReturnFocus.focus();
    drawerReturnFocus = null;
  }

  // ── Modal (confirm) ───────────────────────────────────────────────────────
  function confirmModal(opts) {
    return new Promise(function (resolve) {
      var m = h('<div class="modal open" role="dialog" aria-modal="true"><div class="modal-card"></div></div>');
      var card = $('.modal-card', m);
      var titleId = 'confirmTitle' + Date.now();
      card.innerHTML = '<h2 id="' + titleId + '" style="font-size:1.15rem">' + esc(opts.title) + '</h2>' +
        '<p class="muted mt-2">' + esc(opts.body || '') + '</p>' +
        '<div class="hstack mt-4" style="justify-content:flex-end">' +
        '<button class="btn ghost" data-x>Cancel</button>' +
        '<button class="btn ' + (opts.danger ? 'red' : 'brand') + '" data-ok>' + esc(opts.confirm || 'Confirm') + '</button></div>';
      m.setAttribute('aria-labelledby', titleId);
      var returnFocus = document.activeElement;
      document.body.appendChild(m);
      var untrap = trapFocus(m);
      function done(v) {
        untrap();
        document.removeEventListener('keydown', onKey, true);
        m.remove();
        if (returnFocus && returnFocus.focus) returnFocus.focus();
        resolve(v);
      }
      function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); done(false); } }
      document.addEventListener('keydown', onKey, true);
      $('[data-x]', card).onclick = function () { done(false); };
      $('[data-ok]', card).onclick = function () { done(true); };
      m.onclick = function (e) { if (e.target === m) done(false); };
      // Focus the confirming action so the dialog is operable from the keyboard.
      $('[data-ok]', card).focus();
    });
  }

  // ── Module registry ───────────────────────────────────────────────────────
  // group order defines the sidebar sections; each module has a render(host).
  var GROUPS = [
    { id: 'platform', label: 'Platform' },
    { id: 'crm', label: 'CRM' },
    { id: 'ticketing', label: 'Ticketing' },
    { id: 'advertising', label: 'Advertising' },
    { id: 'overview', label: 'Overview' },
    { id: 'website', label: 'Website' },
    { id: 'people', label: 'People & Applications' },
    { id: 'community', label: 'Community' },
    { id: 'operations', label: 'Operations' },
  ];
  var MODULES = [
    { id: 'events', label: 'Events', icon: '🎪', group: 'platform', render: renderEvents },
    { id: 'crm-people', label: 'People', icon: '🧑‍🤝‍🧑', group: 'crm', render: renderCrmPeople },
    { id: 'crm-companies', label: 'Companies', icon: '🏢', group: 'crm', render: renderCrmCompanies },
    { id: 'ticket-sales', label: 'Ticket Sales', icon: '🎟️', group: 'ticketing', render: renderTicketSales },
    { id: 'ticket-connections', label: 'Connections', icon: '🔌', group: 'ticketing', render: renderTicketConnections },
    { id: 'ads-campaigns', label: 'Campaigns', icon: '📣', group: 'advertising', render: renderAdCampaigns },
    { id: 'ads-reports', label: 'Ad Reports', icon: '📊', group: 'advertising', render: renderAdReports },
    { id: 'ads-invoices', label: 'Invoices', icon: '🧾', group: 'advertising', render: renderAdInvoices },
    { id: 'dashboard', label: 'Dashboard', icon: '📊', group: 'overview', render: renderDashboard },
    { id: 'executive', label: 'Executive', icon: '🧭', group: 'overview', render: renderExecutive },
    { id: 'analytics', label: 'Analytics', icon: '📈', group: 'overview', render: renderAnalytics },
    { id: 'cms', label: 'Website CMS', icon: '🎨', group: 'website', render: embed('/admin-homepage.html', 'Website CMS & Builder', 'Edit every homepage section — hero, copy, buttons, media, theme, section order — then preview & publish.') },
    { id: 'media', label: 'Media Library', icon: '🖼️', group: 'website', render: renderMedia },
    { id: 'floorplan', label: 'Floor Plan', icon: '🗺️', group: 'website', render: embed('/floorplan-editor.html', 'Interactive Floor Plan', 'Create, move, resize and assign booths, then publish the printable map.') },
    { id: 'schedule', label: 'Schedule', icon: '🗓️', group: 'website', render: embed('/education-schedule.html', 'Schedule', 'The published education & entertainment schedule. Speaker slots are managed inside the Website CMS.') },
    { id: 'applications', label: 'Applications', icon: '📥', group: 'people', render: renderApplications, badge: 'appsPending' },
    { id: 'users', label: 'Users', icon: '👥', group: 'people', render: renderUsers },
    { id: 'vendors', label: 'Vendors', icon: '🏪', group: 'people', render: profileModule('vendor', 'Vendors') },
    { id: 'sponsors', label: 'Sponsors', icon: '🤝', group: 'people', render: profileModule('sponsor', 'Sponsors') },
    { id: 'speakers', label: 'Speakers', icon: '🎤', group: 'people', render: profileModule('speaker', 'Speakers') },
    { id: 'entertainment', label: 'Entertainment', icon: '🎧', group: 'people', render: profileModule('dj', 'Entertainment') },
    { id: 'attendees', label: 'Attendees', icon: '🎟️', group: 'people', render: profileModule('attendee', 'Attendees') },
    { id: 'directory', label: 'Directory', icon: '📇', group: 'people', render: renderDirectory },
    { id: 'community', label: 'Community', icon: '💬', group: 'community', render: renderCommunity },
    { id: 'messages', label: 'Messages', icon: '✉️', group: 'community', render: renderMessages },
    { id: 'finance', label: 'Finance', icon: '💳', group: 'operations', render: renderFinance },
    { id: 'data-export', label: 'Data Export', icon: '📦', group: 'operations', render: renderDataExport },
    { id: 'settings', label: 'Settings', icon: '⚙️', group: 'operations', render: renderSettings },
    { id: 'audit', label: 'Audit Log', icon: '📜', group: 'operations', render: renderAudit },
    { id: 'system', label: 'System', icon: '🩺', group: 'operations', render: renderSystem },
  ];
  var moduleById = {}; MODULES.forEach(function (m) { moduleById[m.id] = m; });
  // Path aliases so old bookmarked URLs land on the right module.
  var ALIAS = { homepage: 'cms', profiles: 'directory', overview: 'dashboard', members: 'users' };

  var badgeCounts = {};

  // ── Shell construction ────────────────────────────────────────────────────
  var app, sideNav, crumbEl, content;
  function buildShell() {
    document.title = "Admin OS · Bak'd On The Bay";
    var root = document.getElementById('app-root');
    root.innerHTML =
      '<div class="app" id="app">' +
        '<div class="side-scrim" id="sideScrim"></div>' +
        '<aside class="side">' +
          '<div class="side-brand">' +
            '<div class="logo">B</div>' +
            '<div class="txt"><b>Bak\'d Admin OS</b><small>Event Control</small></div>' +
          '</div>' +
          '<nav class="side-nav" id="sideNav"></nav>' +
          '<div class="side-foot">' +
            '<div class="row" style="padding:8px 10px;gap:10px;background:none;border:0">' +
              avatar('', session.name || 'Admin') +
              '<div class="grow" style="min-width:0"><div class="name" style="font-size:.85rem">' + esc(session.name || 'Admin') + '</div>' +
              '<div class="meta">' + esc(session.email || '') + '</div></div>' +
            '</div>' +
            '<button class="btn ghost sm block" id="logoutBtn">⎋ Log out</button>' +
          '</div>' +
        '</aside>' +
        '<main class="main">' +
          '<header class="topbar">' +
            '<button class="icon-btn" id="sideToggle" title="Toggle sidebar ([)">☰</button>' +
            '<div class="crumb" id="crumb">Dashboard</div>' +
            '<div class="spacer"></div>' +
            '<button class="global-search" id="paletteBtn"><span>🔍 Search everything</span><kbd>⌘K</kbd></button>' +
            '<button class="icon-btn" id="themeToggle" title="Toggle theme (t)">🌓</button>' +
            '<a class="icon-btn" href="/" target="_blank" title="View live site">🌐</a>' +
          '</header>' +
          '<div class="content" id="content"><div class="content-inner"></div></div>' +
        '</main>' +
      '</div>' +
      '<div class="scrim" id="scrim"></div>' +
      '<aside class="drawer" id="drawer" role="dialog" aria-modal="true" aria-labelledby="drawerTitle" aria-hidden="true">' +
        '<div class="drawer-head"><h2 id="drawerTitle">Details</h2><button class="icon-btn" id="drawerClose" aria-label="Close panel">×</button></div>' +
        '<div class="drawer-body" id="drawerBody"></div>' +
        '<div class="drawer-foot" id="drawerFoot"></div>' +
      '</aside>' +
      '<div class="palette" id="palette" role="dialog" aria-modal="true" aria-label="Command palette" aria-hidden="true"><div class="palette-card">' +
        '<div class="palette-input">🔍<input id="paletteInput" placeholder="Jump to a module or action…" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="paletteResults" aria-label="Search modules and actions"></div>' +
        '<div class="palette-results" id="paletteResults" role="listbox" aria-label="Results"></div>' +
      '</div></div>' +
      '<div class="toasts" id="toasts"></div>';

    app = document.getElementById('app');
    sideNav = document.getElementById('sideNav');
    crumbEl = document.getElementById('crumb');
    content = document.querySelector('#content .content-inner');
    toastHost = document.getElementById('toasts');
    scrim = document.getElementById('scrim');
    drawer = document.getElementById('drawer');
    drawerBody = document.getElementById('drawerBody');
    drawerTitle = document.getElementById('drawerTitle');
    drawerFoot = document.getElementById('drawerFoot');

    document.getElementById('logoutBtn').onclick = function () {
      try { localStorage.removeItem('bakd_session'); localStorage.removeItem('bay_active_profile'); } catch (e) {}
      location.replace('/admin-login.html');
    };
    document.getElementById('sideToggle').onclick = toggleSidebar;
    document.getElementById('sideScrim').onclick = function () { app.classList.remove('mobile-open'); };
    document.getElementById('themeToggle').onclick = toggleTheme;
    document.getElementById('paletteBtn').onclick = openPalette;
    document.getElementById('drawerClose').onclick = closeDrawer;
    scrim.onclick = closeDrawer;

    buildNav();
    wirePalette();
  }

  function buildNav() {
    var openGroups = {};
    try { openGroups = JSON.parse(localStorage.getItem('admin_groups') || '{}'); } catch (e) {}
    sideNav.innerHTML = '';
    GROUPS.forEach(function (g) {
      var closed = openGroups[g.id] === false;
      var grp = h('<div class="nav-group' + (closed ? ' closed' : '') + '" data-group="' + g.id + '"></div>');
      var lbl = h('<button class="nav-group-label"><span>' + esc(g.label) + '</span><span class="chev">▾</span></button>');
      lbl.onclick = function () {
        grp.classList.toggle('closed');
        openGroups[g.id] = !grp.classList.contains('closed');
        localStorage.setItem('admin_groups', JSON.stringify(openGroups));
      };
      grp.appendChild(lbl);
      var items = h('<div class="nav-group-items"></div>');
      MODULES.filter(function (m) { return m.group === g.id; }).forEach(function (m) {
        var it = h('<a class="nav-item" href="#/' + m.id + '" data-mod="' + m.id + '">' +
          '<span class="ic">' + m.icon + '</span><span class="lbl">' + esc(m.label) + '</span>' +
          (m.badge ? '<span class="count" data-badge="' + m.badge + '" hidden>0</span>' : '') + '</a>');
        items.appendChild(it);
      });
      grp.appendChild(items);
      sideNav.appendChild(grp);
    });
    refreshBadges();
  }

  function setActiveNav(id) {
    Array.prototype.forEach.call(sideNav.querySelectorAll('.nav-item'), function (n) {
      n.classList.toggle('active', n.getAttribute('data-mod') === id);
    });
  }

  function refreshBadges() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-badge]'), function (b) {
      var v = badgeCounts[b.getAttribute('data-badge')] || 0;
      b.textContent = v; b.hidden = !v;
    });
  }

  // ── Sidebar / theme state ─────────────────────────────────────────────────
  function toggleSidebar() {
    if (window.matchMedia('(max-width:900px)').matches) { app.classList.toggle('mobile-open'); return; }
    app.classList.toggle('collapsed');
    localStorage.setItem('admin_collapsed', app.classList.contains('collapsed') ? '1' : '0');
  }
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('admin_theme', t);
  }
  function toggleTheme() {
    applyTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
  }

  // ── Router ────────────────────────────────────────────────────────────────
  function currentRoute() {
    var hash = (location.hash || '').replace(/^#\/?/, '').split('/')[0];
    if (!hash) {
      // Fall back to the path so /admin/applications deep-links work.
      var seg = (location.pathname || '').replace(/^\/admin\/?/, '').split('/')[0];
      hash = seg || 'dashboard';
    }
    hash = ALIAS[hash] || hash;
    return moduleById[hash] ? hash : 'dashboard';
  }
  function navigate(id) { location.hash = '#/' + id; }
  function route() {
    var id = currentRoute();
    var mod = moduleById[id];
    setActiveNav(id);
    crumbEl.innerHTML = '<span class="ic" style="font-size:1.1rem">' + mod.icon + '</span> ' + esc(mod.label);
    document.getElementById('content').scrollTop = 0;
    app.classList.remove('mobile-open');
    closeDrawer();
    content.innerHTML = '';
    try { mod.render(content); } catch (e) { content.innerHTML = errorBox(e.message); }
  }
  function errorBox(msg) { return '<div class="empty"><span class="ic">⚠️</span><b>Something went wrong</b>' + esc(msg) + '</div>'; }

  // ── Command palette ───────────────────────────────────────────────────────
  var palette, paletteInput, paletteResults, paletteItems = [], paletteSel = 0;
  function wirePalette() {
    palette = document.getElementById('palette');
    paletteInput = document.getElementById('paletteInput');
    paletteResults = document.getElementById('paletteResults');
    paletteInput.addEventListener('input', renderPalette);
    paletteInput.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); paletteSel = Math.min(paletteSel + 1, paletteItems.length - 1); markSel(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); paletteSel = Math.max(paletteSel - 1, 0); markSel(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (paletteItems[paletteSel]) paletteItems[paletteSel].run(); }
    });
    palette.addEventListener('click', function (e) { if (e.target === palette) closePalette(); });
  }
  var paletteReturnFocus = null, paletteUntrap = null;
  function openPalette() {
    paletteReturnFocus = document.activeElement;
    palette.classList.add('open'); palette.setAttribute('aria-hidden', 'false');
    paletteInput.value = ''; renderPalette();
    if (paletteUntrap) { paletteUntrap(); }
    paletteUntrap = trapFocus(palette);
    paletteInput.focus();
  }
  function closePalette() {
    if (!palette.classList.contains('open')) return;
    palette.classList.remove('open'); palette.setAttribute('aria-hidden', 'true');
    if (paletteUntrap) { paletteUntrap(); paletteUntrap = null; }
    if (paletteReturnFocus && paletteReturnFocus.focus) paletteReturnFocus.focus();
    paletteReturnFocus = null;
  }
  function renderPalette() {
    var q = paletteInput.value.trim().toLowerCase();
    var actions = MODULES.map(function (m) {
      return { icon: m.icon, label: m.label, grp: (GROUPS.filter(function (g) { return g.id === m.group; })[0] || {}).label, run: function () { closePalette(); navigate(m.id); } };
    });
    actions.push({ icon: '🌓', label: 'Toggle light / dark theme', grp: 'Action', run: function () { closePalette(); toggleTheme(); } });
    actions.push({ icon: '🌐', label: 'Open live site', grp: 'Action', run: function () { closePalette(); window.open('/', '_blank'); } });
    paletteItems = actions.filter(function (a) { return !q || a.label.toLowerCase().indexOf(q) >= 0; });
    paletteSel = 0;
    paletteResults.innerHTML = paletteItems.length ? paletteItems.map(function (a, i) {
      return '<div class="palette-item' + (i === 0 ? ' sel' : '') + '" id="paletteItem' + i + '" role="option" aria-selected="' + (i === 0 ? 'true' : 'false') + '" data-i="' + i + '"><span class="ic">' + a.icon + '</span><span>' + esc(a.label) + '</span><span class="grp">' + esc(a.grp || '') + '</span></div>';
    }).join('') : '<div class="palette-item muted">No matches</div>';
    Array.prototype.forEach.call(paletteResults.querySelectorAll('[data-i]'), function (el) {
      el.onmouseenter = function () { paletteSel = +el.getAttribute('data-i'); markSel(); };
      el.onclick = function () { paletteItems[+el.getAttribute('data-i')].run(); };
    });
    markSel();
  }
  function markSel() {
    Array.prototype.forEach.call(paletteResults.querySelectorAll('.palette-item'), function (el, i) {
      var on = i === paletteSel;
      el.classList.toggle('sel', on);
      if (el.hasAttribute('role')) el.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    var sel = paletteResults.querySelector('.palette-item.sel');
    if (sel) { sel.scrollIntoView({ block: 'nearest' }); if (sel.id) paletteInput.setAttribute('aria-activedescendant', sel.id); }
    else { paletteInput.removeAttribute('aria-activedescendant'); }
  }

  // ── Global keyboard shortcuts ─────────────────────────────────────────────
  document.addEventListener('keydown', function (e) {
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
    if (e.key === 'Escape') { closePalette(); closeDrawer(); return; }
    if (typing) return;
    if (e.key === '[') { toggleSidebar(); }
    else if (e.key === 't') { toggleTheme(); }
    else if (e.key === '/') { e.preventDefault(); openPalette(); }
  });

  /* ==========================================================================
     MODULES
     ======================================================================== */

  function pageHead(title, desc, actionsHtml) {
    return '<div class="page-head"><div><h1>' + esc(title) + '</h1>' +
      (desc ? '<p>' + esc(desc) + '</p>' : '') + '</div>' +
      (actionsHtml ? '<div class="actions">' + actionsHtml + '</div>' : '') + '</div>';
  }
  function loadingList() { return '<div class="list">' + Array(4).join('') + '<div class="skeleton" style="height:64px"></div><div class="skeleton" style="height:64px"></div><div class="skeleton" style="height:64px"></div></div>'; }

  // ── Dashboard ──────────────────────────────────────────────────────────────
  function renderDashboard(host) {
    host.innerHTML = pageHead('Dashboard', 'A live snapshot of your event. Every workspace is one click away in the sidebar or ⌘K.') +
      '<div class="stats" id="dStats">' + statSkeletons(4) + '</div>' +
      '<div class="grid cols-2">' +
      '<div class="card"><div class="card-title">🗂️ Applications by status<a class="sub" href="#/applications">Open →</a></div><div id="dApps" class="muted">Loading…</div></div>' +
      '<div class="card"><div class="card-title">⚡ Quick actions</div><div class="grid auto" id="dQuick"></div></div>' +
      '</div>' +
      '<div class="card mt-4"><div class="card-title">🕑 Recent applications<a class="sub" href="#/applications">All →</a></div><div id="dRecent">' + loadingList() + '</div></div>';

    var quick = [
      ['📥', 'Review applications', 'applications'], ['🎨', 'Edit the website', 'cms'],
      ['🖼️', 'Manage media', 'media'], ['🗺️', 'Floor plan', 'floorplan'],
      ['📇', 'Directory', 'directory'], ['⚙️', 'Settings', 'settings'],
    ];
    $('#dQuick', host).innerHTML = quick.map(function (q) {
      return '<a class="btn ghost" style="justify-content:flex-start" href="#/' + q[2] + '">' + q[0] + ' ' + esc(q[1]) + '</a>';
    }).join('');

    Promise.all([
      api(API.apps).catch(function () { return { items: [], counts: {} }; }),
      api(API.profiles + '?status=all').catch(function () { return { items: [] }; }),
      api(API.social + '?type=feed').catch(function () { return { items: [] }; }),
      api(API.auth).catch(function () { return { items: [] }; }),
    ]).then(function (r) {
      var apps = r[0], profs = r[1].items || [], posts = r[2].items || [], members = r[3].items || [];
      var c = apps.counts || {};
      badgeCounts.appsPending = c.pending || 0; refreshBadges();
      $('#dStats', host).innerHTML =
        stat((c.pending || 0), 'Applications pending', '📥', c.pending ? 'warn' : '') +
        stat(profs.length, 'Community profiles', '📇', 'accent') +
        stat(members.length, 'Registered users', '👥', '') +
        stat(posts.length, 'Community posts', '💬', '');
      var lanes = ['pending', 'needs_followup', 'awaiting_payment', 'approved', 'paid', 'rejected'];
      $('#dApps', host).innerHTML = lanes.map(function (s) {
        return '<div class="flex between" style="padding:7px 0;border-bottom:1px solid var(--line-soft)">' +
          statusBadge(s) + '<b>' + (c[s] || 0) + '</b></div>';
      }).join('');
      var recent = (apps.items || []).slice(0, 6);
      $('#dRecent', host).innerHTML = recent.length ? recent.map(function (a) {
        return '<div class="row" style="cursor:pointer" data-open="' + esc(a.id) + '">' +
          avatar('', a.name) + '<div class="grow"><div class="name">' + esc(a.name || '(no name)') + ' ' + roleBadge(a.type) + '</div>' +
          '<div class="meta">' + esc(a.email || 'no email') + ' · ' + fmtDate(a.createdAt) + '</div></div>' + statusBadge(a.status) + '</div>';
      }).join('') : emptyState('📭', 'No applications yet', 'Public forms feed straight into this dashboard.');
      Array.prototype.forEach.call($('#dRecent', host).querySelectorAll('[data-open]'), function (el) {
        el.onclick = function () { navigate('applications'); setTimeout(function () { openApplication(el.getAttribute('data-open')); }, 60); };
      });
    });
  }
  function statSkeletons(n) { var s = ''; for (var i = 0; i < n; i++) s += '<div class="skeleton" style="height:104px"></div>'; return s; }
  function stat(n, label, icon, cls) { return '<div class="stat ' + (cls || '') + '"><span class="ic">' + icon + '</span><div class="n">' + n + '</div><div class="l">' + esc(label) + '</div></div>'; }
  function emptyState(ic, title, sub) { return '<div class="empty"><span class="ic">' + ic + '</span><b>' + esc(title) + '</b>' + esc(sub || '') + '</div>'; }
  function statusBadge(s) { return '<span class="badge dot ' + esc(s) + '">' + esc(String(s).replace(/_/g, ' ')) + '</span>'; }
  function roleBadge(r) { return '<span class="badge role">' + esc(r) + '</span>'; }

  // ── Applications review center ─────────────────────────────────────────────
  var appState = { items: [], type: '', q: '', view: 'board' };
  var APP_STATUSES = ['pending', 'needs_followup', 'awaiting_payment', 'approved', 'paid', 'rejected'];
  function renderApplications(host) {
    host.innerHTML = pageHead('Applications', 'One review center for vendor, sponsor, speaker, entertainment & attendee submissions — with notes, timeline and payment workflow.',
      '<button class="btn ghost sm" id="aRefresh">↻ Refresh</button>') +
      '<div class="toolbar">' +
        '<div class="seg" id="aType">' +
          seg('', 'All') + seg('vendor', 'Vendors') + seg('sponsor', 'Sponsors') + seg('speaker', 'Speakers') + seg('dj', 'Entertainment') + seg('attendee', 'Attendees') +
        '</div>' +
        '<div class="search-box"><input type="search" id="aSearch" placeholder="Search name or email…"></div>' +
        '<div class="grow"></div>' +
        '<div class="seg" id="aView"><button data-v="board" class="active">Board</button><button data-v="list">List</button></div>' +
      '</div>' +
      '<div id="aBody">' + loadingList() + '</div>';

    $('#aType', host).onclick = function (e) { var b = e.target.closest('button'); if (!b) return; appState.type = b.getAttribute('data-v'); segActive($('#aType', host), b); load(); };
    $('#aView', host).onclick = function (e) { var b = e.target.closest('button'); if (!b) return; appState.view = b.getAttribute('data-v'); segActive($('#aView', host), b); paint(); };
    $('#aSearch', host).oninput = debounce(function (e) { appState.q = e.target.value.trim().toLowerCase(); paint(); }, 150);
    $('#aRefresh', host).onclick = load;

    function load() {
      $('#aBody', host).innerHTML = loadingList();
      var qs = appState.type ? '?type=' + appState.type : '';
      api(API.apps + qs).then(function (d) {
        appState.items = d.items || [];
        badgeCounts.appsPending = (d.counts && d.counts.pending) || 0; refreshBadges();
        paint();
      }).catch(function (e) { $('#aBody', host).innerHTML = errorBox(e.message); });
    }
    function visible() {
      return appState.items.filter(function (a) {
        return !appState.q || (a.name || '').toLowerCase().indexOf(appState.q) >= 0 || (a.email || '').toLowerCase().indexOf(appState.q) >= 0;
      });
    }
    function paint() {
      var body = $('#aBody', host); var items = visible();
      if (!items.length) { body.innerHTML = emptyState('📭', 'No applications', 'Nothing matches this filter yet.'); return; }
      if (appState.view === 'list') {
        body.innerHTML = '<div class="list">' + items.map(appRow).join('') + '</div>';
      } else {
        body.innerHTML = '<div class="kanban">' + APP_STATUSES.map(function (s) {
          var group = items.filter(function (a) { return a.status === s; });
          return '<div class="lane"><div class="lane-head">' + statusBadge(s) + '<span class="n">' + group.length + '</span></div>' +
            '<div class="lane-body">' + (group.map(appKard).join('') || '<div class="muted small" style="padding:8px">Empty</div>') + '</div></div>';
        }).join('') + '</div>';
      }
      Array.prototype.forEach.call(body.querySelectorAll('[data-open]'), function (el) {
        el.onclick = function () { openApplication(el.getAttribute('data-open')); };
      });
    }
    function appKard(a) {
      return '<div class="kard" data-open="' + esc(a.id) + '"><div class="kname">' + esc(a.name || '(no name)') + '</div>' +
        '<div class="kmeta">' + esc(a.email || 'no email') + '</div><div class="krow">' + roleBadge(a.type) +
        '<span class="muted small" style="margin-left:auto">' + fmtDate(a.createdAt) + '</span></div></div>';
    }
    function appRow(a) {
      return '<div class="row" style="cursor:pointer" data-open="' + esc(a.id) + '">' + avatar('', a.name) +
        '<div class="grow"><div class="name">' + esc(a.name || '(no name)') + ' ' + roleBadge(a.type) + '</div>' +
        '<div class="meta">' + esc(a.email || 'no email') + ' · ' + fmtDate(a.createdAt) + '</div></div>' + statusBadge(a.status) + '</div>';
    }
    load();
    renderApplications._reload = load;
  }

  function openApplication(id) {
    var a = null; for (var i = 0; i < appState.items.length; i++) if (appState.items[i].id === id) a = appState.items[i];
    if (!a) { api(API.apps + '?id=' + encodeURIComponent(id)).then(function (d) { showApp(d.item); }); return; }
    showApp(a);
  }
  function showApp(a) {
    if (!a) return;
    var fields = a.fields || {};
    var skip = { accountId: 1, profileId: 1, password: 1, contractAccepted: 1 };
    var fieldRows = Object.keys(fields).filter(function (k) { return !skip[k] && String(fields[k]).trim(); })
      .map(function (k) { return '<dt>' + esc(k.replace(/([A-Z])/g, ' $1')) + '</dt><dd>' + esc(fields[k]) + '</dd>'; }).join('');
    var body = h('<div></div>');
    body.innerHTML =
      '<div class="hstack mb-4">' + roleBadge(a.type) + statusBadge(a.status) + '<span class="muted small">Submitted ' + fmtDate(a.createdAt) + '</span></div>' +
      '<div class="card mb-4"><div class="card-title">👤 Applicant</div>' +
        '<dl class="kv"><dt>Name</dt><dd>' + esc(a.name || '—') + '</dd><dt>Email</dt><dd>' + (a.email ? '<a href="mailto:' + esc(a.email) + '">' + esc(a.email) + '</a>' : '—') + '</dd></dl></div>' +
      (fieldRows ? '<div class="card mb-4"><div class="card-title">📋 Submission</div><dl class="kv">' + fieldRows + '</dl></div>' : '') +
      '<div class="card mb-4"><div class="card-title">🔒 Internal notes <span class="sub" id="noteState"></span></div>' +
        '<textarea id="noteBox" placeholder="Private staff notes — never shown to the applicant.">' + esc(a.internalNotes || '') + '</textarea></div>' +
      '<div class="card"><div class="card-title">🕑 Activity timeline</div>' +
        '<div class="hstack mb-4"><input id="tlInput" placeholder="Log a call, email or note…" style="flex:1">' +
          '<select id="tlKind" style="width:auto"><option value="note">Note</option><option value="email">Email</option><option value="call">Call</option><option value="payment">Payment</option></select>' +
          '<button class="btn brand sm" id="tlAdd">Add</button></div>' +
        '<div id="tlList" class="timeline"></div></div>';

    function renderTimeline(list) {
      var tl = (list || []).slice().reverse();
      $('#tlList', body).innerHTML = tl.length ? tl.map(function (e) {
        return '<div class="tl-item"><div class="tl-text">' + esc(e.text) + '</div><div class="tl-meta">' +
          esc(e.kind) + ' · ' + esc(e.by || 'Admin') + ' · ' + fmtDateTime(e.at) + '</div></div>';
      }).join('') : '<div class="muted small">No activity yet.</div>';
    }
    renderTimeline(a.timeline);

    // Autosave notes
    var noteState = $('#noteState', body);
    $('#noteBox', body).oninput = debounce(function (e) {
      noteState.textContent = 'Saving…';
      api(API.apps, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.id, internalNotes: e.target.value, actor: session.name || 'Admin' }) })
        .then(function (d) { a.internalNotes = d.item.internalNotes; a.timeline = d.item.timeline; noteState.textContent = 'Saved'; setTimeout(function () { noteState.textContent = ''; }, 1500); syncItem(d.item); })
        .catch(function (err) { noteState.textContent = ''; toast(err.message, { type: 'err' }); });
    }, 700);

    $('#tlAdd', body).onclick = function () {
      var input = $('#tlInput', body); var text = input.value.trim(); if (!text) return;
      api(API.apps, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.id, timelineNote: text, timelineKind: $('#tlKind', body).value, actor: session.name || 'Admin' }) })
        .then(function (d) { input.value = ''; a.timeline = d.item.timeline; renderTimeline(a.timeline); syncItem(d.item); toast('Logged to timeline', { type: 'ok' }); })
        .catch(function (err) { toast(err.message, { type: 'err' }); });
    };

    // Footer status actions
    var foot = h('<div style="flex-wrap:wrap"></div>');
    var actions = [
      ['approved', 'Approve', 'green'], ['awaiting_payment', 'Awaiting payment', 'blue'],
      ['paid', 'Mark paid', 'brand'], ['needs_followup', 'Follow-up', 'amber'],
      ['rejected', 'Reject', 'red'], ['pending', 'Reset', 'subtle'],
    ];
    foot.innerHTML = actions.filter(function (x) { return x[0] !== a.status; }).map(function (x) {
      return '<button class="btn ' + x[2] + ' sm" data-set="' + x[0] + '">' + x[1] + '</button>';
    }).join('') + '<div style="flex:1"></div><button class="btn ghost sm" data-del>🗑 Delete</button>';

    foot.onclick = function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-del')) {
        confirmModal({ title: 'Delete application?', body: 'This permanently removes ' + (a.name || 'this application') + '.', confirm: 'Delete', danger: true }).then(function (ok) {
          if (!ok) return;
          api(API.apps + '?id=' + encodeURIComponent(a.id), { method: 'DELETE' }).then(function () {
            closeDrawer(); toast('Application deleted'); reloadApps();
          }).catch(function (err) { toast(err.message, { type: 'err' }); });
        });
        return;
      }
      var set = b.getAttribute('data-set'); b.disabled = true;
      api(API.apps, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.id, status: set, actor: session.name || 'Admin' }) })
        .then(function (d) {
          a.status = d.item.status; a.timeline = d.item.timeline; syncItem(d.item);
          toast('Marked ' + set.replace(/_/g, ' ') + (d.approvalEmailSent ? ' · approval email sent' : ''), { type: 'ok' });
          closeDrawer(); reloadApps();
        }).catch(function (err) { b.disabled = false; toast(err.message, { type: 'err' }); });
    };
    openDrawer(a.name || 'Application', body, foot);
  }
  function syncItem(item) { for (var i = 0; i < appState.items.length; i++) if (appState.items[i].id === item.id) appState.items[i] = item; }
  function reloadApps() { if (renderApplications._reload) renderApplications._reload(); }

  function seg(v, label) { return '<button data-v="' + v + '"' + (v === '' ? ' class="active"' : '') + '>' + esc(label) + '</button>'; }
  function segActive(container, btn) { Array.prototype.forEach.call(container.querySelectorAll('button'), function (b) { b.classList.toggle('active', b === btn); }); }

  // ── Profiles (vendors / sponsors / speakers / entertainment / attendees) ────
  function profileModule(role, title) {
    return function (host) { renderProfiles(host, role, title); };
  }
  function isFeatured(p) { var d = p.details || {}; return d.featured === 'true' || d.featured === true; }
  function renderProfiles(host, role, title) {
    var state = { items: [], status: 'all', q: '' };
    host.innerHTML = pageHead(title, 'Approved ' + title.toLowerCase() + ' appear in the public directory. Manage visibility, featuring and details here.',
      '<a class="btn ghost sm" href="/profile/new" target="_blank">+ New profile</a><button class="btn ghost sm" id="pRefresh">↻ Refresh</button>') +
      '<div class="toolbar">' +
        '<div class="seg" id="pStatus"><button data-v="all" class="active">All</button><button data-v="approved">Approved</button><button data-v="pending">Pending</button><button data-v="rejected">Hidden</button></div>' +
        '<div class="search-box"><input type="search" id="pSearch" placeholder="Search name or company…"></div>' +
      '</div><div id="pBody">' + loadingList() + '</div>';

    $('#pStatus', host).onclick = function (e) { var b = e.target.closest('button'); if (!b) return; state.status = b.getAttribute('data-v'); segActive($('#pStatus', host), b); load(); };
    $('#pSearch', host).oninput = debounce(function (e) { state.q = e.target.value.trim().toLowerCase(); paint(); }, 150);
    $('#pRefresh', host).onclick = load;

    function load() {
      $('#pBody', host).innerHTML = loadingList();
      api(API.profiles + '?status=' + state.status + (role ? '&role=' + role : '')).then(function (d) { state.items = d.items || []; paint(); })
        .catch(function (e) { $('#pBody', host).innerHTML = errorBox(e.message); });
    }
    function paint() {
      var items = state.items.filter(function (p) { return !state.q || (p.displayName || '').toLowerCase().indexOf(state.q) >= 0 || (p.company || '').toLowerCase().indexOf(state.q) >= 0; });
      var body = $('#pBody', host);
      if (!items.length) { body.innerHTML = emptyState('👤', 'No ' + title.toLowerCase(), 'No profiles match this filter.'); return; }
      body.innerHTML = '<div class="list">' + items.map(profRow).join('') + '</div>';
      body.onclick = onAction;
    }
    function profRow(p) {
      var feat = isFeatured(p);
      var canFeature = /vendor|sponsor|speaker|dj/.test(p.role);
      var acts = '';
      if (p.status !== 'approved') acts += btn('approve', p.id, 'Approve', 'green');
      if (p.status !== 'rejected') acts += btn('hide', p.id, 'Hide', 'amber');
      if (canFeature) acts += '<button class="btn ' + (feat ? 'brand' : 'ghost') + ' sm" data-act="feature" data-id="' + esc(p.id) + '" data-on="' + (feat ? 1 : 0) + '">' + (feat ? '★ Featured' : '☆ Feature') + '</button>';
      acts += '<a class="btn ghost sm" href="/profile?id=' + encodeURIComponent(p.id) + '" target="_blank">View</a>';
      acts += '<a class="btn ghost sm" href="/profile/edit?id=' + encodeURIComponent(p.id) + '" target="_blank">Edit</a>';
      acts += btn('del', p.id, '🗑 Delete', 'red');
      return '<div class="row">' + avatar(p.headshotUrl, p.displayName) + '<div class="grow"><div class="name">' + esc(p.displayName || '(no name)') + ' ' + roleBadge(p.role) + ' ' + statusBadge(p.status) + (feat ? ' <span class="badge brand">★ Featured</span>' : '') + '</div>' +
        '<div class="meta">' + esc(p.company || '') + (p.company && p.email ? ' · ' : '') + esc(p.email || '') + '</div>' +
        (p.tagline ? '<div class="muted small mt-2">' + esc(p.tagline) + '</div>' : '') + '</div><div class="acts">' + acts + '</div></div>';
    }
    function onAction(e) {
      var b = e.target.closest('button[data-act]'); if (!b) return;
      var id = b.getAttribute('data-id'), act = b.getAttribute('data-act'); b.disabled = true;
      var req;
      if (act === 'del') {
        var prof = state.items.filter(function (x) { return x.id === id; })[0] || {};
        confirmModal({ title: 'Delete profile?', body: 'Permanently remove ' + esc(prof.displayName || 'this profile') + ' everywhere — its directory listing, its linked login account, and its CRM record (the person, plus the company if nothing else is left on it). No need to delete it again in the CRM. This cannot be undone.', confirm: 'Delete', danger: true }).then(function (ok) {
          if (!ok) { b.disabled = false; return; }
          api(API.profiles + '?id=' + encodeURIComponent(id), { method: 'DELETE' }).then(function (d) {
            d = d || {}; var also = [];
            if (d.accountsRemoved) also.push('login');
            if (d.crmPeopleRemoved) also.push('CRM record');
            toast('Profile deleted' + (also.length ? ' · also removed ' + also.join(' & ') : '')); load();
          }).catch(fail);
        });
        return;
      } else if (act === 'feature') {
        req = api(API.profiles, put({ id: id, featured: b.getAttribute('data-on') !== '1' }));
      } else {
        req = api(API.profiles, put({ id: id, status: act === 'approve' ? 'approved' : 'rejected' }));
      }
      req.then(function () { toast('Updated', { type: 'ok' }); load(); }).catch(fail);
      function fail(err) { b.disabled = false; toast(err.message, { type: 'err' }); }
    }
    load();
  }
  function btn(act, id, label, cls) { return '<button class="btn ' + cls + ' sm" data-act="' + act + '" data-id="' + esc(id) + '">' + label + '</button>'; }
  function put(obj) { return { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) }; }

  // ── Directory (all profiles + featuring/visibility) ────────────────────────
  function renderDirectory(host) { renderProfiles(host, '', 'Directory'); }

  // ── Users ──────────────────────────────────────────────────────────────────
  function renderUsers(host) {
    host.innerHTML = pageHead('Users', 'Everyone who created an account. Each user has one linked community profile.',
      '<button class="btn ghost sm" id="uRefresh">↻ Refresh</button>') +
      '<div class="toolbar"><div class="search-box"><input type="search" id="uSearch" placeholder="Search name or email…"></div></div>' +
      '<div id="uBody">' + loadingList() + '</div>';
    var all = [];
    function paint() {
      var q = $('#uSearch', host).value.trim().toLowerCase();
      var items = all.filter(function (m) { return !q || (m.name || '').toLowerCase().indexOf(q) >= 0 || (m.email || '').toLowerCase().indexOf(q) >= 0; });
      $('#uBody', host).innerHTML = items.length ? '<div class="table-wrap"><table class="data"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th></th></tr></thead><tbody>' +
        items.map(function (m) {
          return '<tr><td><b>' + esc(m.name || '—') + '</b></td><td class="muted">' + esc(m.email || '') + '</td><td>' + roleBadge(m.role) + '</td><td>' + statusBadge(m.status) + '</td><td class="muted">' + fmtDate(m.createdAt) + '</td>' +
            '<td>' + (m.profileId ? '<a class="btn ghost sm" href="/profile?id=' + encodeURIComponent(m.profileId) + '" target="_blank">Profile</a>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : emptyState('👥', 'No users yet', 'Sign-ups appear here automatically.');
    }
    function load() { $('#uBody', host).innerHTML = loadingList(); api(API.auth).then(function (d) { all = d.items || []; paint(); }).catch(function (e) { $('#uBody', host).innerHTML = errorBox(e.message); }); }
    $('#uSearch', host).oninput = debounce(paint, 150);
    $('#uRefresh', host).onclick = load;
    load();
  }

  // ── Community feed moderation ──────────────────────────────────────────────
  function renderCommunity(host) {
    host.innerHTML = pageHead('Community', 'Most recent posts across the member feed. Remove anything that breaks community guidelines.',
      '<button class="btn ghost sm" id="cRefresh">↻ Refresh</button>') + '<div id="cBody">' + loadingList() + '</div>';
    function load() {
      $('#cBody', host).innerHTML = loadingList();
      api(API.social + '?type=feed').then(function (d) {
        var items = d.items || [];
        $('#cBody', host).innerHTML = items.length ? '<div class="list">' + items.map(function (p) {
          var author = p.author || {};
          return '<div class="row">' + avatar(author.headshotUrl, author.displayName) +
            '<div class="grow"><div class="name">' + esc(author.displayName || 'Unknown') + ' <span class="muted small">· ' + fmtDate(p.createdAt) + '</span></div>' +
            '<div class="mt-2">' + esc(p.body || '') + '</div>' + (p.imageUrl ? '<img src="' + esc(p.imageUrl) + '" style="max-width:220px;border-radius:10px;margin-top:8px">' : '') +
            '<div class="meta mt-2">♥ ' + (p.likeCount || 0) + ' · 💬 ' + (p.commentCount || 0) + '</div></div>' +
            '<div class="acts">' + btn('del', p.id, '🗑 Remove', 'red') + '</div></div>';
        }).join('') + '</div>' : emptyState('💬', 'No posts yet', 'The community feed is quiet.');
        $('#cBody', host).onclick = function (e) {
          var b = e.target.closest('button[data-act="del"]'); if (!b) return;
          confirmModal({ title: 'Remove post?', body: 'This cannot be undone.', confirm: 'Remove', danger: true }).then(function (ok) {
            if (!ok) return; var id = b.getAttribute('data-id'); b.disabled = true;
            api(API.social + '?kind=post&admin=1&id=' + encodeURIComponent(id), { method: 'DELETE' }).then(function () { toast('Post removed'); load(); }).catch(function (err) { b.disabled = false; toast(err.message, { type: 'err' }); });
          });
        };
      }).catch(function (e) { $('#cBody', host).innerHTML = errorBox(e.message); });
    }
    $('#cRefresh', host).onclick = load; load();
  }

  // ── Messages ───────────────────────────────────────────────────────────────
  function renderMessages(host) {
    host.innerHTML = pageHead('Messages', 'Direct messaging keeps member conversations private end-to-end.') +
      '<div class="card"><div class="card-title">✉️ Member direct messages</div>' +
      '<p class="muted">Every member has a private inbox for one-to-one conversations with vendors, sponsors and each other. To protect member privacy, DMs are not surfaced in the admin. Use the tools below for outreach.</p>' +
      '<div class="hstack mt-4"><a class="btn ghost" href="/messages" target="_blank">Open member messenger</a>' +
      '<a class="btn ghost" href="#/community">Moderate the feed</a>' +
      '<a class="btn brand" href="#/cms">Announce on the homepage</a></div></div>';
  }

  // ── Media Library ──────────────────────────────────────────────────────────
  function renderMedia(host) {
    host.innerHTML = pageHead('Media Library', 'Shared images & video for the whole site. Drag & drop to upload; copy a URL to use it anywhere.',
      '<button class="btn brand sm" id="mPick">⬆ Upload</button>') +
      '<input type="file" id="mFile" accept="image/*,video/*" multiple hidden>' +
      '<div class="dropzone mb-4" id="mDrop"><b>Drag & drop images or video here</b><div class="muted small mt-2">or click to browse — up to 5 MB images, 25 MB video</div></div>' +
      '<div class="toolbar"><div class="search-box"><input type="search" id="mSearch" placeholder="Search files…"></div><div class="grow"></div><span class="muted small" id="mCount"></span></div>' +
      '<div id="mBody">' + loadingList() + '</div>';
    var all = [];
    var drop = $('#mDrop', host), file = $('#mFile', host);
    $('#mPick', host).onclick = function () { file.click(); };
    drop.onclick = function () { file.click(); };
    file.onchange = function () { upload(file.files); file.value = ''; };
    ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('drag'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('drag'); }); });
    drop.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files) upload(e.dataTransfer.files); });
    $('#mSearch', host).oninput = debounce(paint, 150);

    function load() { api(API.media).then(function (d) { all = d.items || []; paint(); }).catch(function (e) { $('#mBody', host).innerHTML = errorBox(e.message); }); }
    function paint() {
      var q = $('#mSearch', host).value.trim().toLowerCase();
      var items = all.filter(function (m) { return !q || (m.name || '').toLowerCase().indexOf(q) >= 0; });
      $('#mCount', host).textContent = all.length + ' file' + (all.length === 1 ? '' : 's');
      $('#mBody', host).innerHTML = items.length ? '<div class="media-grid">' + items.map(cell).join('') + '</div>' : emptyState('🖼️', 'No media yet', 'Upload your first image or video.');
      Array.prototype.forEach.call($('#mBody', host).querySelectorAll('[data-copy]'), function (el) {
        el.onclick = function () { copy(el.getAttribute('data-copy')); };
      });
      Array.prototype.forEach.call($('#mBody', host).querySelectorAll('[data-del]'), function (el) {
        el.onclick = function () {
          confirmModal({ title: 'Delete file?', body: 'Any page still using it will lose the image.', confirm: 'Delete', danger: true }).then(function (ok) {
            if (!ok) return;
            api(API.media + '?file=' + encodeURIComponent(el.getAttribute('data-del')), { method: 'DELETE' }).then(function () { toast('File deleted'); load(); }).catch(function (err) { toast(err.message, { type: 'err' }); });
          });
        };
      });
    }
    function cell(m) {
      var thumb = m.kind === 'video' ? '<video src="' + esc(m.url) + '" muted></video>' : '<img src="' + esc(m.url) + '" alt="' + esc(m.name) + '" loading="lazy">';
      return '<div class="media-cell"><div class="thumb">' + thumb + '</div><div class="cap" title="' + esc(m.name) + '">' + esc(m.name) + '</div>' +
        '<div class="ov"><button class="btn brand sm" data-copy="' + esc(m.url) + '">Copy URL</button>' +
        '<a class="btn ghost sm" href="' + esc(m.url) + '" target="_blank">Open</a>' +
        '<button class="btn red sm" data-del="' + esc(m.id) + '">Delete</button></div></div>';
    }
    function copy(url) {
      var full = location.origin + url;
      if (navigator.clipboard) navigator.clipboard.writeText(full).then(function () { toast('URL copied', { type: 'ok' }); }); else toast(full);
    }
    function upload(files) {
      var list = Array.prototype.slice.call(files || []); if (!list.length) return;
      var done = 0; toast('Uploading ' + list.length + ' file' + (list.length === 1 ? '' : 's') + '…');
      list.forEach(function (f) {
        var reader = new FileReader();
        reader.onload = function () {
          var b64 = String(reader.result).split(',')[1];
          api(API.media, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: f.name, contentType: f.type, dataBase64: b64 }) })
            .then(function () { done++; if (done === list.length) { toast('Upload complete', { type: 'ok' }); load(); } })
            .catch(function (err) { toast(f.name + ': ' + err.message, { type: 'err' }); });
        };
        reader.readAsDataURL(f);
      });
    }
    load();
  }

  // ── Analytics ──────────────────────────────────────────────────────────────
  function renderAnalytics(host) {
    host.innerHTML = pageHead('Analytics', 'Platform metrics computed live from your event data.') +
      '<div class="stats" id="anStats">' + statSkeletons(4) + '</div>' +
      '<div class="card"><div class="card-title">🎟️ Ticket sales — daily net revenue (30 days)</div><div id="anTickets" class="muted">Loading…</div></div>' +
      '<div class="grid cols-2 mt-4">' +
      '<div class="card"><div class="card-title">🎫 Tickets by tier</div><div id="anTier" class="muted">Loading…</div></div>' +
      '<div class="card"><div class="card-title">🔌 Tickets by source</div><div id="anSource" class="muted">Loading…</div></div>' +
      '</div>' +
      '<div class="grid cols-2 mt-4">' +
      '<div class="card"><div class="card-title">📥 Applications by type</div><div id="anType" class="muted">Loading…</div></div>' +
      '<div class="card"><div class="card-title">📇 Profiles by role</div><div id="anRole" class="muted">Loading…</div></div>' +
      '</div>' +
      '<div class="card mt-4"><div class="card-title">🌐 Website traffic</div>' +
      '<p class="muted">Page views, popular pages and referrers are available in <b>Netlify Analytics</b> for this site. Enable it in the Netlify dashboard to see server-side traffic without adding any tracking scripts.</p>' +
      '<a class="btn ghost mt-2" href="https://app.netlify.com/projects/bakdonthebay/analytics" target="_blank">Open Netlify Analytics ↗</a></div>';
    Promise.all([
      api(API.apps).catch(function () { return { items: [], counts: {} }; }),
      api(API.profiles + '?status=all').catch(function () { return { items: [] }; }),
      api(API.tickets).catch(function () { return { totals: {}, daily: [], byTier: [], byProvider: [] }; }),
    ]).then(function (r) {
      var apps = r[0].items || [], counts = r[0].counts || {}, profs = r[1].items || [], tk = r[2] || {};
      var approved = counts.approved || 0, paid = counts.paid || 0, tt = tk.totals || {};
      $('#anStats', host).innerHTML =
        stat((tt.tickets || 0).toLocaleString(), 'Tickets sold', '🎟️', 'accent') +
        stat(money(tt.netCents, 'USD'), 'Ticket net revenue', '💰', '') +
        stat(counts.total || apps.length, 'Total applications', '📥', '') +
        stat(pct(approved + paid, counts.total || apps.length), 'Approval rate', '📈', '');
      $('#anTickets', host).innerHTML = (tk.daily && tk.daily.length) ? ticketDaily(tk.daily) : '<span class="muted">No ticket sales yet. Connect a ticketing company under Ticketing → Connections.</span>';
      $('#anTier', host).innerHTML = execBars(mapVal(tk.byTier, 'tier', 'tickets'), { hideZero: true });
      $('#anSource', host).innerHTML = execBars(mapVal(tk.byProvider, 'provider', 'tickets'), { label: ticketProviderLabel, hideZero: true });
      $('#anType', host).innerHTML = bars(tally(apps, 'type'));
      $('#anRole', host).innerHTML = bars(tally(profs, 'role'));
    });
    function pct(a, b) { return b ? Math.round((a / b) * 100) + '%' : '0%'; }
    function tally(arr, key) { var m = {}; arr.forEach(function (x) { var k = x[key] || 'other'; m[k] = (m[k] || 0) + 1; }); return m; }
    function bars(m) {
      var keys = Object.keys(m); if (!keys.length) return '<span class="muted">No data yet.</span>';
      var max = Math.max.apply(null, keys.map(function (k) { return m[k]; }));
      return keys.map(function (k) {
        return '<div class="mb-2"><div class="flex between small"><span style="text-transform:capitalize">' + esc(k) + '</span><b>' + m[k] + '</b></div>' +
          '<div style="height:8px;background:var(--panel-3);border-radius:99px;overflow:hidden"><div style="height:100%;width:' + Math.round((m[k] / max) * 100) + '%;background:var(--brand);border-radius:99px"></div></div></div>';
      }).join('');
    }
  }

  // ── Executive dashboards ─────────────────────────────────────────────────
  // A board-level command view: eight live dashboards — Revenue, Applications,
  // Sponsor ROI, Vendor ROI, Directory traffic, Email performance, Booth sales
  // and Advertising revenue — all computed server-side from existing data by the
  // dashboards function. Each card links through to the workspace that owns it.
  function renderExecutive(host) {
    host.parentElement.classList.add('wide');
    host.innerHTML = pageHead('Executive', 'A live, board-level snapshot across every revenue and growth line. Figures compute in real time from your platform data.',
      '<button class="btn ghost sm" id="exRefresh">↻ Refresh</button>') +
      '<div class="stats" id="exHero">' + statSkeletons(4) + '</div>' +
      '<div id="exBody">' + loadingList() + '</div>' +
      '<p class="muted small mt-4" id="exStamp"></p>';
    $('#exRefresh', host).onclick = function () { renderExecutive(host); };
    api(API.dashboards).then(function (d) {
      var b = d.dashboards || {};
      paintExec(host, b);
      var stamp = $('#exStamp', host);
      if (stamp && d.generatedAt) stamp.textContent = 'Computed live · ' + fmtDateTime(d.generatedAt);
    }).catch(function (e) {
      $('#exHero', host).innerHTML = '';
      $('#exBody', host).innerHTML = errorBox(e.message);
    });
  }

  // Horizontal labelled bars from a { key: value } map (capitalized, brand fill).
  function execBars(map, opts) {
    opts = opts || {};
    var keys = Object.keys(map || {}).filter(function (k) { return !opts.hideZero || map[k]; });
    if (!keys.length) return '<span class="muted">No data yet.</span>';
    keys.sort(function (a, b) { return map[b] - map[a]; });
    var max = Math.max.apply(null, keys.map(function (k) { return map[k]; })) || 1;
    return keys.map(function (k) {
      var label = opts.label ? opts.label(k) : String(k).replace(/_/g, ' ');
      var val = opts.money ? money(map[k], 'USD') : map[k];
      return '<div class="mb-2"><div class="flex between small"><span style="text-transform:capitalize">' + esc(label) + '</span><b>' + esc(String(val)) + '</b></div>' +
        '<div style="height:8px;background:var(--panel-3);border-radius:99px;overflow:hidden"><div style="height:100%;width:' + Math.round((map[k] / max) * 100) + '%;background:var(--brand);border-radius:99px"></div></div></div>';
    }).join('');
  }

  // A monthly bar chart from [{month,cents|count}]. Compact, dependency-free.
  function execTrend(series, isMoney) {
    var arr = (series || []).slice(-12);
    if (!arr.length) return '<span class="muted">No history yet.</span>';
    var key = isMoney ? 'cents' : 'count';
    var max = Math.max.apply(null, arr.map(function (p) { return p[key] || 0; })) || 1;
    return '<div class="flex" style="align-items:flex-end;gap:6px;height:120px;padding-top:8px">' + arr.map(function (p) {
      var v = p[key] || 0;
      var pctH = Math.max(2, Math.round((v / max) * 100));
      var label = isMoney ? money(v, 'USD') : String(v);
      return '<div class="grow" style="display:flex;flex-direction:column;align-items:center;gap:4px;justify-content:flex-end;height:100%">' +
        '<div title="' + esc(label) + '" style="width:100%;max-width:34px;height:' + pctH + '%;background:var(--brand);border-radius:6px 6px 0 0"></div>' +
        '<span class="muted" style="font-size:10px;white-space:nowrap">' + esc(String(p.month || '').slice(2)) + '</span></div>';
    }).join('') + '</div>';
  }

  // A key/value definition list from [[label, value], …].
  function execKv(pairs) {
    return '<dl class="kv">' + pairs.map(function (p) {
      return '<dt>' + esc(p[0]) + '</dt><dd>' + (p[2] ? p[1] : esc(String(p[1]))) + '</dd>';
    }).join('') + '</dl>';
  }

  // A compact advertiser ROI table shared by the Sponsor and Vendor cards.
  function execRoiTable(roi, emptyMsg) {
    var rows = (roi && roi.advertisers) || [];
    if (!rows.length) return emptyState('📈', 'No ROI data yet', emptyMsg);
    return '<div class="table-wrap"><table class="data"><thead><tr><th>Advertiser</th><th>Spend</th><th>Impr</th><th>Clicks</th><th>CTR</th><th>CPC</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr><td><b>' + esc(r.companyName) + '</b><div class="muted small">' + r.campaigns + ' campaign' + (r.campaigns === 1 ? '' : 's') + '</div></td>' +
          '<td>' + money(r.spendCents, 'USD') + '</td><td class="muted">' + r.impressions + '</td><td class="muted">' + r.clicks + '</td>' +
          '<td>' + r.ctr + '%</td><td class="muted">' + (r.clicks ? money(r.cpcCents, 'USD') : '—') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function paintExec(host, b) {
    var rev = b.revenue || {}, apps = b.applications || {}, sroi = b.sponsorRoi || {}, vroi = b.vendorRoi || {};
    var dir = b.directory || {}, email = b.email || {}, booth = b.booth || {}, adv = b.advertising || {}, tk = b.tickets || {};

    // Hero: the four numbers a director scans first.
    $('#exHero', host).innerHTML =
      stat(money(rev.realizedCents, 'USD'), 'Revenue realized', '💰', 'accent') +
      stat((tk.tickets || 0).toLocaleString(), 'Tickets sold', '🎟️', '') +
      stat(money(rev.pipelineCents, 'USD'), 'Revenue in pipeline', '📈', rev.pipelineCents ? 'warn' : '') +
      stat((booth.occupancyRate || 0) + '%', 'Booth occupancy', '🎪', '');

    var revLines = {};
    (rev.lines || []).forEach(function (l) { revLines[l.label] = l.realizedCents; });

    $('#exBody', host).innerHTML =
      // Ticket sales (ingested from ticketing companies) + Revenue
      '<div class="grid cols-2">' +
        '<div class="card"><div class="card-title">🎟️ Ticket sales<a class="sub" href="#/ticket-sales">Ticket Sales →</a></div>' +
          '<div class="stats mb-4">' +
            stat((tk.tickets || 0).toLocaleString(), 'Tickets sold', '🎫', 'accent') +
            stat(money(tk.realizedCents, 'USD'), 'Net revenue', '💰', '') +
          '</div>' +
          (tk.hasSales ?
            execKv([
              ['Orders', (tk.orders || 0).toLocaleString()],
              ['Gross sales', money(tk.grossCents, 'USD'), false],
              ['Refunded', money(tk.refundedCents, 'USD'), false],
            ]) +
            '<div class="muted small mt-4 mb-2">Tickets by tier</div>' + execBars(tk.byTier || {}, { hideZero: true })
            : emptyState('🔌', 'No ticket sales yet', 'Connect a ticketing company to stream sales in automatically.')) +
        '</div>' +
        '<div class="card"><div class="card-title">💰 Revenue<a class="sub" href="#/finance">Finance →</a></div>' +
          '<div class="stats mb-4">' +
            stat(money(rev.realizedCents, 'USD'), 'Realized', '✅', 'accent') +
            stat(money(rev.pipelineCents, 'USD'), 'Pipeline', '⏳', '') +
          '</div>' +
          '<div class="muted small mb-2">Realized by line</div>' + execBars(revLines, { money: true }) +
          '<div class="muted small mt-4 mb-2">Monthly revenue (tickets + advertising)</div>' + execTrend(rev.monthly, true) +
        '</div>' +
      '</div>' +

      // Advertising revenue + Applications
      '<div class="grid cols-2 mt-4">' +
        '<div class="card"><div class="card-title">📣 Advertising revenue<a class="sub" href="#/ads-reports">Ad Reports →</a></div>' +
          '<div class="stats mb-4">' +
            stat(money(adv.paidCents, 'USD'), 'Paid', '💵', 'accent') +
            stat(money(adv.outstandingCents, 'USD'), 'Outstanding', '🧾', adv.outstandingCents ? 'warn' : '') +
          '</div>' +
          execKv([
            ['Active campaigns', (adv.activeCampaigns || 0) + ' of ' + (adv.totalCampaigns || 0)],
            ['Impressions', (adv.impressions || 0).toLocaleString()],
            ['Clicks', (adv.clicks || 0).toLocaleString()],
            ['Overall CTR', (adv.ctr || 0) + '%'],
          ]) +
        '</div>' +
        '<div class="card"><div class="card-title">📥 Applications<a class="sub" href="#/applications">Applications →</a></div>' +
          '<div class="stats mb-4">' +
            stat(apps.total || 0, 'Total', '📇', '') +
            stat((apps.approvalRate || 0) + '%', 'Approval rate', '✅', 'accent') +
            stat(apps.pending || 0, 'Pending', '⏳', apps.pending ? 'warn' : '') +
          '</div>' +
          '<div class="muted small mb-2">By type</div>' + execBars(apps.byType || {}, { hideZero: true }) +
          '<div class="muted small mt-4 mb-2">Monthly intake</div>' + execTrend(apps.trend, false) +
        '</div>' +
      '</div>' +

      // Directory traffic + (spare)
      '<div class="grid cols-2 mt-4">' +
        '<div class="card"><div class="card-title">📇 Directory traffic<a class="sub" href="#/directory">Directory →</a></div>' +
          '<div class="stats mb-4">' +
            stat(dir.listings || 0, 'Listings', '📇', 'accent') +
            stat((dir.clicks || 0).toLocaleString(), 'Directory ad clicks', '👆', '') +
          '</div>' +
          execKv([
            ['Approved listings', dir.approved || 0],
            ['Ad impressions', (dir.impressions || 0).toLocaleString()],
            ['Ad click-through', (dir.ctr || 0) + '%'],
          ]) +
          '<div class="muted small mt-4 mb-2">Listings by role</div>' + execBars(dir.byRole || {}, { hideZero: true }) +
        '</div>' +
      '</div>' +

      // Sponsor ROI + Vendor ROI
      '<div class="grid cols-2 mt-4">' +
        '<div class="card"><div class="card-title">🤝 Sponsor ROI<a class="sub" href="#/ads-campaigns">Campaigns →</a></div>' +
          '<div class="stats mb-4">' +
            stat(money((sroi.totals || {}).spendCents, 'USD'), 'Sponsor spend', '💵', 'accent') +
            stat(((sroi.totals || {}).clicks || 0).toLocaleString(), 'Clicks delivered', '👆', '') +
          '</div>' +
          execRoiTable(sroi, 'Sponsor-inventory buys (banner, email, sidebar) appear here once they run.') +
        '</div>' +
        '<div class="card"><div class="card-title">🏪 Vendor ROI<a class="sub" href="#/ads-campaigns">Campaigns →</a></div>' +
          '<div class="stats mb-4">' +
            stat(money((vroi.totals || {}).spendCents, 'USD'), 'Vendor spend', '💵', 'accent') +
            stat(((vroi.totals || {}).clicks || 0).toLocaleString(), 'Clicks delivered', '👆', '') +
          '</div>' +
          execRoiTable(vroi, 'Vendor-inventory buys (featured vendor, directory) appear here once they run.') +
        '</div>' +
      '</div>' +

      // Email performance + Booth sales
      '<div class="grid cols-2 mt-4">' +
        '<div class="card"><div class="card-title">✉️ Email performance<a class="sub" href="#/ads-campaigns">Campaigns →</a></div>' +
          '<div class="stats mb-4">' +
            stat((email.sends || 0).toLocaleString(), 'Sponsored sends', '📧', '') +
            stat((email.ctr || 0) + '%', 'Click-through', '📈', 'accent') +
          '</div>' +
          execKv([
            ['Email sponsorships', email.sponsorships || 0],
            ['Active now', email.activeSponsorships || 0],
            ['Clicks', (email.clicks || 0).toLocaleString()],
          ]) +
          (email.sends ? '' : '<p class="muted small mt-2">Email-sponsorship delivery is logged as email creatives serve.</p>') +
        '</div>' +
        '<div class="card"><div class="card-title">🎪 Booth sales<a class="sub" href="#/floorplan">Floor Plan →</a></div>' +
          (booth.hasPlan ? '<div class="stats mb-4">' +
            stat(money(booth.soldCents, 'USD'), 'Sold revenue', '💰', 'accent') +
            stat((booth.sellThroughRate || 0) + '%', 'Sell-through', '📈', '') +
          '</div>' +
          execKv([
            ['Booths sold', (booth.byStatus || {}).sold || 0],
            ['Reserved', (booth.byStatus || {}).reserved || 0],
            ['Available', (booth.byStatus || {}).available || 0],
            ['Reserved value', money(booth.reservedCents, 'USD'), false],
          ]) +
          '<div class="muted small mt-4 mb-2">Booths by type</div>' + execBars(booth.byUse || {}, { hideZero: true })
          : emptyState('🗺️', 'No floor plan yet', 'Publish a floor plan with priced booths to track booth revenue.')) +
        '</div>' +
      '</div>' +

      // Advertising delivery detail
      '<div class="card mt-4"><div class="card-title">🎯 Advertising delivery by placement<a class="sub" href="#/ads-reports">Ad Reports →</a></div>' +
        (Object.keys(adv.placements || {}).length ? '<div class="table-wrap"><table class="data"><thead><tr><th>Placement</th><th>Impressions</th><th>Clicks</th><th>CTR</th></tr></thead><tbody>' +
          Object.keys(adv.placements).map(function (k) {
            var p = adv.placements[k];
            return '<tr><td><b>' + esc(placementLabel(k)) + '</b></td><td class="muted">' + p.impressions + '</td><td class="muted">' + p.clicks + '</td><td>' + p.ctr + '%</td></tr>';
          }).join('') + '</tbody></table></div>' : emptyState('📊', 'No delivery yet', 'Placement delivery appears once campaigns serve.')) +
      '</div>';
  }

  // ── Ticketing ────────────────────────────────────────────────────────────
  // Two modules over the tickets function: "Ticket Sales" (live sales, charts,
  // recent orders — all ingested automatically from connected companies) and
  // "Connections" (create/rotate a per-company ingest token, see delivery
  // health, and manually import a batch of orders).

  // Clipboard helper with a toast, degrading to a prompt where unavailable.
  function copyText(text, label) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast((label || 'Copied') + ' to clipboard', { type: 'ok' }); })
        .catch(function () { window.prompt('Copy:', text); });
    } else { window.prompt('Copy:', text); }
  }
  // Convert [{k:…, v:…}] rows to the { key: value } map execBars() expects.
  function mapVal(arr, keyField, valField) {
    var m = {}; (arr || []).forEach(function (r) { m[r[keyField] || '—'] = r[valField] || 0; }); return m;
  }
  var TICKET_PROVIDERS = [
    { v: 'eventbrite', label: 'Eventbrite' }, { v: 'axs', label: 'AXS' },
    { v: 'ticketmaster', label: 'Ticketmaster' }, { v: 'dice', label: 'DICE' },
    { v: 'universe', label: 'Universe' }, { v: 'seetickets', label: 'See Tickets' },
    { v: 'generic', label: 'Other / Generic (recommended)' },
  ];
  function ticketProviderLabel(v) { for (var i = 0; i < TICKET_PROVIDERS.length; i++) if (TICKET_PROVIDERS[i].v === v) return TICKET_PROVIDERS[i].label; return v; }

  // A compact daily bar chart from [{day,tickets,cents}] — height by net revenue.
  function ticketDaily(series) {
    var arr = (series || []).slice(-30);
    if (!arr.length) return '<span class="muted">No sales in the last 30 days.</span>';
    var max = Math.max.apply(null, arr.map(function (p) { return p.cents || 0; })) || 1;
    return '<div class="flex" style="align-items:flex-end;gap:3px;height:130px;padding-top:8px">' + arr.map(function (p) {
      var pctH = Math.max(2, Math.round(((p.cents || 0) / max) * 100));
      var tip = (p.day || '') + ' · ' + money(p.cents, 'USD') + ' · ' + (p.tickets || 0) + ' tickets';
      return '<div class="grow" style="display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%">' +
        '<div title="' + esc(tip) + '" style="width:100%;max-width:20px;height:' + pctH + '%;background:var(--brand);border-radius:4px 4px 0 0"></div></div>';
    }).join('') + '</div>' +
      '<div class="flex between muted small mt-2"><span>' + esc((arr[0].day || '')) + '</span><span>' + esc((arr[arr.length - 1].day || '')) + '</span></div>';
  }

  function ticketOrdersTable(list) {
    if (!list || !list.length) return emptyState('🧾', 'No orders yet', 'Orders appear here as your ticketing companies deliver them.');
    return '<div class="table-wrap"><table class="data"><thead><tr><th>Buyer</th><th>Tier</th><th>Qty</th><th>Net</th><th>Status</th><th>Source</th><th>Purchased</th></tr></thead><tbody>' +
      list.map(function (o) {
        var badge = o.status === 'completed' ? 'approved' : (o.status === 'refunded' || o.status === 'canceled' ? 'rejected' : 'pending');
        return '<tr><td><b>' + esc(o.buyerName || '—') + '</b><div class="muted small">' + esc(o.buyerEmail || '') + '</div></td>' +
          '<td>' + esc(o.tierName || '') + '</td><td class="muted">' + (o.quantity || 0) + '</td>' +
          '<td>' + money(o.netCents, o.currency) + '</td>' +
          '<td><span class="badge dot ' + badge + '">' + esc(o.status) + '</span></td>' +
          '<td class="muted">' + esc(ticketProviderLabel(o.provider)) + '</td>' +
          '<td class="muted">' + (o.purchasedAt ? fmtDate(o.purchasedAt) : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function renderTicketSales(host) {
    host.parentElement.classList.add('wide');
    host.innerHTML = pageHead('Ticket Sales', 'Live ticket sales, ingested automatically from every connected ticketing company. These figures feed the Executive, Analytics, Finance and Revenue views.',
      '<button class="btn ghost sm" id="tkRefresh">↻ Refresh</button>') +
      '<div class="stats" id="tkHero">' + statSkeletons(4) + '</div>' +
      '<div id="tkBody">' + loadingList() + '</div>';
    $('#tkRefresh', host).onclick = function () { renderTicketSales(host); };
    api(API.tickets).then(function (d) { paintTickets(host, d); })
      .catch(function (e) { $('#tkHero', host).innerHTML = ''; $('#tkBody', host).innerHTML = errorBox(e.message); });
  }

  function paintTickets(host, d) {
    var t = d.totals || {};
    $('#tkHero', host).innerHTML =
      stat((t.tickets || 0).toLocaleString(), 'Tickets sold', '🎟️', 'accent') +
      stat(money(t.netCents, 'USD'), 'Net revenue', '💰', '') +
      stat(money(t.grossCents, 'USD'), 'Gross sales', '💵', '') +
      stat((t.orders || 0).toLocaleString(), 'Orders', '🧾', (t.refundedOrders ? 'warn' : ''));
    if (!(t.orders)) {
      $('#tkBody', host).innerHTML = emptyState('🎟️', 'No ticket sales yet',
        'Connect a ticketing company so its sales flow in automatically — nothing to re-key.') +
        '<div class="mt-4" style="text-align:center"><a class="btn" href="#/ticket-connections">🔌 Set up a connection →</a></div>';
      return;
    }
    $('#tkBody', host).innerHTML =
      '<div class="card"><div class="card-title">📈 Daily net sales (last 30 days)</div>' + ticketDaily(d.daily) + '</div>' +
      '<div class="grid cols-2 mt-4">' +
        '<div class="card"><div class="card-title">🎫 Tickets by tier</div>' + execBars(mapVal(d.byTier, 'tier', 'tickets'), { hideZero: true }) + '</div>' +
        '<div class="card"><div class="card-title">🔌 Tickets by source</div>' + execBars(mapVal(d.byProvider, 'provider', 'tickets'), { label: ticketProviderLabel, hideZero: true }) + '</div>' +
      '</div>' +
      (t.refundedOrders ? '<div class="card mt-4"><div class="card-title">↩️ Refunds</div>' +
        execKv([['Refunded orders', t.refundedOrders], ['Refunded value', money(t.refundedCents, 'USD'), false], ['Ticketing fees', money(t.feesCents, 'USD'), false]]) + '</div>' : '') +
      '<div class="card mt-4"><div class="card-title">🧾 Recent orders</div>' + ticketOrdersTable(d.recent) + '</div>';
  }

  function renderTicketConnections(host) {
    var ingestUrl = window.location.origin + '/.netlify/functions/tickets';
    var providerOpts = TICKET_PROVIDERS.map(function (p) { return '<option value="' + p.v + '">' + esc(p.label) + '</option>'; }).join('');
    host.innerHTML = pageHead('Ticketing Connections', 'Connect ticketing companies so their sales flow in automatically. Each connection carries its own secret token.') +
      '<div class="card mb-4"><div class="card-title">🔌 Your ingestion endpoint</div>' +
        '<p class="muted">Ticketing companies — or a relay like Zapier/Make, or a scheduled CSV upload — send orders to this URL with a connection\'s token in the <code>X-Ingest-Token</code> header. Create a connection below to mint a token.</p>' +
        '<div class="hstack"><input id="tkUrl" readonly value="' + esc(ingestUrl) + '" style="flex:1"><button class="btn ghost" id="tkCopyUrl">Copy URL</button></div>' +
      '</div>' +
      '<div class="card mb-4"><div class="card-title">➕ Add a connection</div>' +
        '<div class="grid cols-2">' +
          fld('Ticketing company', '<select id="tkProvider">' + providerOpts + '</select>') +
          fld('Display name', '<input id="tkName" placeholder="e.g. Eventbrite — Main Event">') +
          fld('Their event ID (optional)', '<input id="tkExtId" placeholder="The provider\'s own event id">', 'Used for reconciliation and the daily-report request.') +
        '</div>' +
        '<button class="btn mt-2" id="tkCreate">Create connection</button>' +
        '<div id="tkNew" class="mt-4"></div>' +
      '</div>' +
      '<div class="card"><div class="card-title">🧩 Connections</div><div id="tkList">' + loadingList() + '</div></div>' +
      '<div class="card mt-4"><div class="card-title">⬆️ Manual import / backfill</div>' +
        '<p class="muted">Paste a JSON array of orders (or <code>{ "orders": [ … ] }</code>) to backfill history or import a converted CSV. Re-importing the same order ids updates in place — never double-counts.</p>' +
        '<div class="grid cols-2">' + fld('Attribute to connection', '<select id="tkImpProvider"><option value="">— choose —</option></select>') + '</div>' +
        '<textarea id="tkImpData" rows="6" placeholder=\'[{"orderId":"1001","buyerName":"Jane Doe","buyerEmail":"jane@example.com","tier":"General Admission","quantity":2,"gross":90.00,"status":"completed","purchasedAt":"2026-07-01T18:00:00Z"}]\'></textarea>' +
        '<button class="btn mt-2" id="tkImport">Import orders</button>' +
      '</div>';

    $('#tkCopyUrl', host).onclick = function () { copyText(ingestUrl, 'Endpoint URL'); };
    $('#tkCreate', host).onclick = function () {
      var btn = this; btn.disabled = true;
      api(API.tickets, put({
        action: 'createProvider',
        provider: $('#tkProvider', host).value,
        displayName: $('#tkName', host).value.trim(),
        externalEventId: $('#tkExtId', host).value.trim(),
        actor: session.name || 'Admin',
      })).then(function (d) {
        $('#tkName', host).value = ''; $('#tkExtId', host).value = '';
        showNewToken(host, d.item, ingestUrl);
        toast('Connection created', { type: 'ok' });
        loadConnections(host, ingestUrl);
      }).catch(function (e) { toast(e.message, { type: 'err' }); }).finally(function () { btn.disabled = false; });
    };
    $('#tkImport', host).onclick = function () {
      var providerId = $('#tkImpProvider', host).value;
      if (!providerId) { toast('Choose a connection to import into.', { type: 'err' }); return; }
      var raw = $('#tkImpData', host).value.trim();
      if (!raw) { toast('Paste some orders first.', { type: 'err' }); return; }
      var parsed; try { parsed = JSON.parse(raw); } catch (e) { toast('That is not valid JSON.', { type: 'err' }); return; }
      var orders = Array.isArray(parsed) ? parsed : (parsed.orders || []);
      var btn = this; btn.disabled = true;
      api(API.tickets, put({ action: 'importOrders', providerId: providerId, orders: orders, actor: session.name || 'Admin' }))
        .then(function (d) { toast('Imported ' + d.ingested + ' new, updated ' + d.updated, { type: 'ok' }); $('#tkImpData', host).value = ''; loadConnections(host, ingestUrl); })
        .catch(function (e) { toast(e.message, { type: 'err' }); }).finally(function () { btn.disabled = false; });
    };
    loadConnections(host, ingestUrl);
  }

  // Render the one-time token reveal — the only moment the plaintext exists.
  function showNewToken(host, item, ingestUrl) {
    if (!item || !item.ingestToken) return;
    var box = $('#tkNew', host);
    var snippet = 'curl -X POST ' + ingestUrl + ' \\\n  -H "X-Ingest-Token: ' + item.ingestToken + '" \\\n  -H "Content-Type: application/json" \\\n' +
      '  -d \'{"orders":[{"orderId":"1001","buyerEmail":"jane@example.com","tier":"General","quantity":2,"gross":90.00}]}\'';
    box.innerHTML = '<div class="card" style="border:1px solid var(--brand)">' +
      '<div class="card-title">🔑 Ingest token — copy it now</div>' +
      '<p class="muted small">This is shown once and cannot be retrieved later. Give it to the ticketing company or paste it into your relay. If you lose it, rotate the token below.</p>' +
      '<div class="hstack"><input readonly value="' + esc(item.ingestToken) + '" style="flex:1"><button class="btn" id="tkCopyTok">Copy token</button></div>' +
      '<div class="muted small mt-4 mb-2">Example delivery</div>' +
      '<pre style="overflow:auto;background:var(--panel-3);padding:12px;border-radius:8px;font-size:12px">' + esc(snippet) + '</pre>' +
      '</div>';
    $('#tkCopyTok', box).onclick = function () { copyText(item.ingestToken, 'Token'); };
  }

  function loadConnections(host, ingestUrl) {
    api(API.tickets + '?providers=1').then(function (d) {
      var items = d.items || [];
      var sel = $('#tkImpProvider', host);
      if (sel) sel.innerHTML = '<option value="">— choose —</option>' + items.map(function (p) {
        return '<option value="' + esc(p.id) + '">' + esc(p.displayName || ticketProviderLabel(p.provider)) + '</option>';
      }).join('');
      var list = $('#tkList', host);
      if (!items.length) { list.innerHTML = emptyState('🔌', 'No connections yet', 'Add one above to start receiving ticket sales.'); return; }
      list.innerHTML = '<div class="table-wrap"><table class="data"><thead><tr><th>Connection</th><th>Company</th><th>Token</th><th>Ingested</th><th>Last sync</th><th>Status</th><th></th></tr></thead><tbody>' +
        items.map(function (p) {
          return '<tr><td><b>' + esc(p.displayName || '(unnamed)') + '</b>' + (p.externalEventId ? '<div class="muted small">' + esc(p.externalEventId) + '</div>' : '') + '</td>' +
            '<td>' + esc(ticketProviderLabel(p.provider)) + '</td>' +
            '<td class="muted">…' + esc(p.tokenHint || '') + '</td>' +
            '<td class="muted">' + (p.ordersIngested || 0) + '</td>' +
            '<td class="muted">' + (p.lastSyncAt ? fmtDateTime(p.lastSyncAt) : 'never') + '</td>' +
            '<td><span class="badge dot ' + (p.status === 'active' ? 'approved' : 'rejected') + '">' + esc(p.status) + '</span></td>' +
            '<td class="hstack" style="gap:6px">' +
              '<button class="btn ghost sm" data-rotate="' + esc(p.id) + '">Rotate</button>' +
              '<button class="btn ghost sm" data-toggle="' + esc(p.id) + '" data-status="' + esc(p.status) + '">' + (p.status === 'active' ? 'Disable' : 'Enable') + '</button>' +
              '<button class="btn ghost sm red" data-del="' + esc(p.id) + '">Delete</button>' +
            '</td></tr>';
        }).join('') + '</tbody></table></div>';
      list.querySelectorAll('[data-rotate]').forEach(function (b) {
        b.onclick = function () {
          if (!window.confirm('Rotate this token? The old token stops working immediately.')) return;
          api(API.tickets, put({ action: 'rotateToken', id: b.getAttribute('data-rotate'), actor: session.name || 'Admin' }))
            .then(function (d) { showNewToken(host, d.item, ingestUrl); toast('Token rotated', { type: 'ok' }); loadConnections(host, ingestUrl); })
            .catch(function (e) { toast(e.message, { type: 'err' }); });
        };
      });
      list.querySelectorAll('[data-toggle]').forEach(function (b) {
        b.onclick = function () {
          var next = b.getAttribute('data-status') === 'active' ? 'disabled' : 'active';
          api(API.tickets, put({ action: 'updateProvider', id: b.getAttribute('data-toggle'), status: next, actor: session.name || 'Admin' }))
            .then(function () { toast('Connection ' + next, { type: 'ok' }); loadConnections(host, ingestUrl); })
            .catch(function (e) { toast(e.message, { type: 'err' }); });
        };
      });
      list.querySelectorAll('[data-del]').forEach(function (b) {
        b.onclick = function () {
          if (!window.confirm('Delete this connection? Its token stops working. Already-ingested orders are kept.')) return;
          api(API.tickets + '?id=' + encodeURIComponent(b.getAttribute('data-del')), { method: 'DELETE' })
            .then(function () { toast('Connection deleted', { type: 'ok' }); loadConnections(host, ingestUrl); })
            .catch(function (e) { toast(e.message, { type: 'err' }); });
        };
      });
    }).catch(function (e) { $('#tkList', host).innerHTML = errorBox(e.message); });
  }

  // ── Data Export ──────────────────────────────────────────────────────────
  // The "everything in one industry-standard folder" view: one downloadable CSV
  // per dataset (spreadsheet-native), plus a full JSON backup of the lot.
  function renderDataExport(host) {
    host.innerHTML = pageHead('Data Export', 'Download every record of user data the platform holds — as CSV for spreadsheets and tools, or one JSON file for a full backup.',
      '<a class="btn" id="dxAll" href="' + API.dataExport + '?dataset=all&format=json">⬇︎ Download everything (JSON)</a>') +
      '<div class="card"><div class="card-title">📦 Datasets</div><div id="dxList">' + loadingList() + '</div></div>' +
      '<p class="muted small mt-4">CSV is the universal format — every spreadsheet, CRM and mail tool imports it. Exports are generated live and reflect the current data.</p>';
    api(API.dataExport + '?manifest=1').then(function (d) {
      var items = d.datasets || [];
      $('#dxList', host).innerHTML = '<div class="table-wrap"><table class="data"><thead><tr><th>Dataset</th><th>Records</th><th>Columns</th><th></th></tr></thead><tbody>' +
        items.map(function (s) {
          var base = API.dataExport + '?dataset=' + encodeURIComponent(s.key);
          return '<tr><td><b>' + esc(s.label) + '</b></td>' +
            '<td class="muted">' + (s.count || 0) + '</td>' +
            '<td class="muted small">' + esc((s.columns || []).join(', ')) + '</td>' +
            '<td class="hstack" style="gap:6px"><a class="btn ghost sm" href="' + base + '&format=csv">CSV</a>' +
            '<a class="btn ghost sm" href="' + base + '&format=json">JSON</a></td></tr>';
        }).join('') + '</tbody></table></div>';
    }).catch(function (e) { $('#dxList', host).innerHTML = errorBox(e.message); });
  }

  // ── Finance ────────────────────────────────────────────────────────────────
  function renderFinance(host) {
    host.innerHTML = pageHead('Finance', 'Track payment status across approved applicants and manage the ticketing links.') +
      '<div class="stats" id="fStats">' + statSkeletons(3) + '</div>' +
      '<div class="card mb-4"><div class="card-title">🎟️ Ticket sales revenue<a class="sub" href="#/ticket-sales">Ticket Sales →</a></div><div id="fTickets" class="muted">Loading…</div></div>' +
      '<div class="card mb-4"><div class="card-title">💳 Awaiting payment</div><div id="fAwait">' + loadingList() + '</div></div>' +
      '<div class="card"><div class="card-title">🎟️ Ticketing & purchase links</div>' +
      '<p class="muted mb-4">Approved vendors and sponsors unlock these Eventbrite links to buy their package. Edit them in Settings.</p>' +
      '<div id="fLinks" class="muted">Loading…</div><a class="btn ghost mt-4" href="#/settings">Edit links in Settings →</a></div>';
    Promise.all([api(API.apps).catch(function () { return { items: [], counts: {} }; }), api(API.settings).catch(function () { return {}; }), api(API.tickets).catch(function () { return { totals: {} }; })]).then(function (r) {
      var items = r[0].items || [], c = r[0].counts || {}, s = r[1] || {}, tt = (r[2] && r[2].totals) || {};
      $('#fStats', host).innerHTML =
        stat(money(tt.netCents, 'USD'), 'Ticket net revenue', '🎟️', 'accent') +
        stat(c.awaiting_payment || 0, 'Awaiting payment', '⏳', 'warn') +
        stat(c.paid || 0, 'Applicants paid', '✅', '');
      $('#fTickets', host).innerHTML = (tt.orders) ?
        '<dl class="kv"><dt>Tickets sold</dt><dd>' + (tt.tickets || 0).toLocaleString() + '</dd>' +
        '<dt>Orders</dt><dd>' + (tt.orders || 0).toLocaleString() + '</dd>' +
        '<dt>Gross sales</dt><dd>' + money(tt.grossCents, 'USD') + '</dd>' +
        '<dt>Ticketing fees</dt><dd>' + money(tt.feesCents, 'USD') + '</dd>' +
        '<dt>Net revenue</dt><dd><b>' + money(tt.netCents, 'USD') + '</b></dd>' +
        '<dt>Refunded</dt><dd>' + money(tt.refundedCents, 'USD') + '</dd></dl>' :
        '<span class="muted">No ticket sales yet. Connect a ticketing company under Ticketing → Connections to stream sales here.</span>';
      var awaiting = items.filter(function (a) { return a.status === 'awaiting_payment'; });
      $('#fAwait', host).innerHTML = awaiting.length ? '<div class="list">' + awaiting.map(function (a) {
        return '<div class="row"><div class="grow"><div class="name">' + esc(a.name || '(no name)') + ' ' + roleBadge(a.type) + '</div><div class="meta">' + esc(a.email || '') + '</div></div>' +
          '<button class="btn brand sm" data-paid="' + esc(a.id) + '">Mark paid</button></div>';
      }).join('') + '</div>' : emptyState('✅', 'All settled', 'No applicants are awaiting payment.');
      $('#fAwait', host).onclick = function (e) {
        var b = e.target.closest('button[data-paid]'); if (!b) return; b.disabled = true;
        api(API.apps, put({ id: b.getAttribute('data-paid'), status: 'paid', actor: session.name || 'Admin' })).then(function () { toast('Marked paid', { type: 'ok' }); renderFinance(host); }).catch(function (err) { b.disabled = false; toast(err.message, { type: 'err' }); });
      };
      $('#fLinks', host).innerHTML = '<dl class="kv"><dt>Vendor package</dt><dd>' + (s.eventbriteVendorUrl ? '<a href="' + esc(s.eventbriteVendorUrl) + '" target="_blank">' + esc(s.eventbriteVendorUrl) + '</a>' : '<span class="muted">Not set</span>') + '</dd>' +
        '<dt>Sponsor package</dt><dd>' + (s.eventbriteSponsorUrl ? '<a href="' + esc(s.eventbriteSponsorUrl) + '" target="_blank">' + esc(s.eventbriteSponsorUrl) + '</a>' : '<span class="muted">Not set</span>') + '</dd>' +
        '<dt>Access password</dt><dd>' + (s.eventbritePassword ? esc(s.eventbritePassword) : '<span class="muted">Not set</span>') + '</dd></dl>';
    });
  }

  // ── Settings ───────────────────────────────────────────────────────────────
  function renderSettings(host) {
    host.innerHTML = pageHead('Settings', 'Core event configuration that publishes to the live site. Changes autosave.') +
      '<div class="grid cols-2">' +
        '<div class="card"><div class="card-title">🎟️ Ticketing links <span class="sub" id="setState1"></span></div>' +
          '<div class="field"><label>Vendor Eventbrite URL</label><input id="evVendor" placeholder="https://eventbrite.com/…"><div class="hint">Revealed to approved vendors on the package page.</div></div>' +
          '<div class="field"><label>Sponsor Eventbrite URL</label><input id="evSponsor" placeholder="https://eventbrite.com/…"></div>' +
          '<div class="field"><label>Eventbrite access password</label><input id="evPassword" placeholder="Password buyers enter on Eventbrite" autocomplete="off"><div class="hint">Sent to each approved applicant and shown on the package page.</div></div></div>' +
        '<div class="card"><div class="card-title">🎨 Brand colors <span class="sub" id="setState2"></span></div>' +
          '<div class="field"><label>Primary / accent color</label><input type="color" id="brandColor" style="height:44px;padding:4px"></div>' +
          '<div class="field"><label>Background color</label><input type="color" id="bgColor" style="height:44px;padding:4px"></div>' +
          '<div class="hint">These theme the public homepage.</div></div>' +
      '</div>' +
      '<div class="card mt-4"><div class="card-title">🧭 More configuration</div>' +
      '<p class="muted mb-4">Hero, headings, copy, buttons, statistics, countdown, FAQ, footer, SEO and section order all live in the visual Website CMS so you edit them in context.</p>' +
      '<div class="hstack"><a class="btn brand" href="#/cms">Open Website CMS</a><a class="btn ghost" href="#/media">Media Library</a><a class="btn ghost" href="#/floorplan">Floor Plan</a></div></div>' +
      '<div class="card mt-4"><div class="card-title">🌗 Admin appearance</div><div class="flex between"><div><b>Theme</b><div class="muted small">Dark or light — applies to this admin only.</div></div>' +
      '<span class="badge neutral">Use the 🌓 button in the top bar</span></div></div>';

    api(API.settings).then(function (s) {
      $('#evVendor', host).value = s.eventbriteVendorUrl || '';
      $('#evSponsor', host).value = s.eventbriteSponsorUrl || '';
      $('#evPassword', host).value = s.eventbritePassword || '';
      var theme = s.theme || {};
      $('#brandColor', host).value = /^#[0-9a-f]{6}$/i.test(theme.brand) ? theme.brand : '#9FE22D';
      $('#bgColor', host).value = /^#[0-9a-f]{6}$/i.test(theme.bg) ? theme.bg : '#0b1220';
    }).catch(function () {});

    var saveLinks = debounce(function () {
      flag('#setState1', 'Saving…');
      var typedVendor = $('#evVendor', host).value.trim(), typedSponsor = $('#evSponsor', host).value.trim();
      var typedPassword = $('#evPassword', host) ? $('#evPassword', host).value.trim() : '';
      api(API.settings, put({ eventbriteVendorUrl: typedVendor, eventbriteSponsorUrl: typedSponsor, eventbritePassword: typedPassword }))
        .then(function (d) {
          var s = (d && d.settings) || {};
          // Reflect what the server actually stored (it normalizes links, e.g.
          // adding https://) so the field shows the real saved value and the
          // Finance view matches. Skip a field that's focused to avoid rewriting
          // it mid-typing.
          var vEl = $('#evVendor', host), pEl = $('#evSponsor', host), pwEl = $('#evPassword', host);
          if (document.activeElement !== vEl && 'eventbriteVendorUrl' in s) vEl.value = s.eventbriteVendorUrl || '';
          if (document.activeElement !== pEl && 'eventbriteSponsorUrl' in s) pEl.value = s.eventbriteSponsorUrl || '';
          if (pwEl && document.activeElement !== pwEl && 'eventbritePassword' in s) pwEl.value = s.eventbritePassword || '';
          // Warn if a non-empty entry couldn't be saved as a link, instead of
          // silently dropping it and leaving Finance showing "Not set".
          if ((typedVendor && !s.eventbriteVendorUrl) || (typedSponsor && !s.eventbriteSponsorUrl)) {
            flag('#setState1', ''); toast('That link wasn’t saved — use a full URL like https://eventbrite.com/e/…', { type: 'err' });
          } else { flag('#setState1', 'Saved', true); }
        }).catch(function (e) { flag('#setState1', ''); toast(e.message, { type: 'err' }); });
    }, 700);
    var saveTheme = debounce(function () {
      flag('#setState2', 'Saving…');
      api(API.settings, put({ theme: { brand: $('#brandColor', host).value, bg: $('#bgColor', host).value } }))
        .then(function () { flag('#setState2', 'Saved', true); }).catch(function (e) { flag('#setState2', ''); toast(e.message, { type: 'err' }); });
    }, 500);
    $('#evVendor', host).oninput = saveLinks; $('#evSponsor', host).oninput = saveLinks;
    if ($('#evPassword', host)) $('#evPassword', host).oninput = saveLinks;
    $('#brandColor', host).oninput = saveTheme; $('#bgColor', host).oninput = saveTheme;
    function flag(sel, txt, clear) { var el = $(sel, host); el.textContent = txt; if (clear) setTimeout(function () { el.textContent = ''; }, 1500); }
  }

  // ── System ─────────────────────────────────────────────────────────────────
  function renderSystem(host) {
    var eps = [
      ['Events', API.events], ['Applications', API.apps], ['Profiles', API.profiles + '?status=all'], ['Accounts / Auth', API.auth],
      ['Community', API.social + '?type=feed'], ['Media', API.media], ['Site settings', API.settings], ['Floor plan', API.floorplan],
      ['Audit log', API.audit], ['CRM', API.crm + '?resource=stats'],
      ['Advertising', API.ads + '?resource=report'],
    ];
    host.innerHTML = pageHead('System', 'Health of the platform services and the data model powering the admin.') +
      '<div class="card mb-4"><div class="card-title">🔌 Service health</div><div class="list" id="sysHealth">' +
        eps.map(function (e) { return '<div class="row" data-ep="' + esc(e[1]) + '"><div class="grow"><div class="name">' + esc(e[0]) + '</div><div class="meta mono">' + esc(e[1].split('?')[0]) + '</div></div><span class="badge neutral" data-dot>Checking…</span></div>'; }).join('') +
      '</div></div>' +
      '<div class="grid cols-2">' +
      '<div class="card"><div class="card-title">🗄️ Data model</div><p class="muted small">All site data — including image & video bytes — lives in one Netlify Postgres database.</p>' +
        '<dl class="kv"><dt>events</dt><dd>editions — the multi-event tenant root</dd><dt>applications</dt><dd>submissions + workflow, notes & timeline</dd><dt>profiles</dt><dd>directory listings</dd><dt>accounts</dt><dd>member logins</dd><dt>site_settings</dt><dd>published site config</dd><dt>site_media</dt><dd>shared media bytes</dd><dt>floorplan</dt><dd>draft & published layout</dd><dt>social_*</dt><dd>feed, messages, groups</dd><dt>crm_people / crm_companies</dt><dd>deduplicated CRM: one person, one company</dd><dt>crm_person_roles / crm_company_events</dt><dd>a person\'s roles · a company\'s events</dd><dt>ad_campaigns / ad_creatives</dt><dd>advertising: buys & their placement creatives</dd><dt>ad_events / ad_invoices</dt><dd>impression/click delivery log · advertiser billing</dd><dt>audit_log</dt><dd>append-only trail of admin actions</dd></dl></div>' +
      '<div class="card"><div class="card-title">ℹ️ Environment</div><dl class="kv"><dt>Signed in</dt><dd>' + esc(session.name || '') + '</dd><dt>Role</dt><dd>' + esc(session.role) + '</dd><dt>Site</dt><dd>bakdonthebay</dd><dt>Runtime</dt><dd>Netlify Functions</dd></dl>' +
        '<a class="btn ghost mt-4" href="https://app.netlify.com/projects/bakdonthebay" target="_blank">Open Netlify dashboard ↗</a></div>' +
      '</div>';
    host.insertAdjacentHTML('beforeend', '<div class="card mt-4"><div class="card-title">Platform contracts</div><div id="platformContracts">' + loadingList() + '</div></div>');
    api(API.events + '?platform')
      .then(function (d) { paintPlatformContracts($('#platformContracts', host), d.contracts || {}, d.contractsSummary || {}); })
      .catch(function (e) { $('#platformContracts', host).innerHTML = errorBox(e.message); });
    Array.prototype.forEach.call(host.querySelectorAll('[data-ep]'), function (row) {
      var dot = row.querySelector('[data-dot]');
      fetch(row.getAttribute('data-ep'), { method: 'GET' }).then(function (r) {
        dot.className = 'badge ' + (r.ok ? 'approved' : 'rejected') + ' dot'; dot.textContent = r.ok ? 'Online' : ('HTTP ' + r.status);
      }).catch(function () { dot.className = 'badge rejected dot'; dot.textContent = 'Offline'; });
    });
  }

  // ── CRM: People & Companies ───────────────────────────────────────────────
  // The deduplicated relationship layer. One canonical person (with unlimited
  // roles) and one canonical company (with unlimited events); a person references
  // their company by id, so nothing is copied between the two. Backed by the crm
  // function — see netlify/functions/crm.mjs.
  function paintPlatformContracts(el, contracts, summary) {
    var rows = [
      ['Modules', platformSummaryCount(summary.moduleCount, contracts.modules), 'Reusable capabilities available to every ecosystem.'],
      ['Ecosystem configuration', platformSummaryCount(summary.ecosystemSectionCount, contracts.ecosystemConfiguration), 'Sections required to launch a configurable community or event.'],
      ['Relationships', platformSummaryCount(summary.relationshipTypeCount, contracts.relationships && contracts.relationships.relationshipTypes), 'Data-driven connection types between people, organizations, communities, experiences, and opportunities.'],
      ['Opportunities', platformSummaryCount(summary.opportunityTypeCount, contracts.opportunities && contracts.opportunities.opportunityTypes), 'Discoverable, actionable, and measurable ways people can build better lives.'],
      ['Knowledge', platformSummaryCount(summary.knowledgeTypeCount, contracts.knowledge && contracts.knowledge.knowledgeTypes), 'Reusable learning, resources, community memory, and AI-readable context.'],
      ['Marketplace', platformSummaryCount(summary.marketplaceOfferTypeCount, contracts.marketplace && contracts.marketplace.offerTypes), 'Transparent exchange surfaces for tickets, packages, ads, services, products, jobs, and sponsorships.'],
      ['Consent and AI', platformSummaryCount(summary.consentPurposeCount, contracts.consentAndAi && contracts.consentAndAi.consentPurposes), 'Consent purposes and AI boundaries that protect trust before automation grows.'],
      ['AI recommendations', platformSummaryCount(summary.aiRecommendationTargetCount, contracts.aiRecommendations && contracts.aiRecommendations.targets), 'Explainable opportunity recommendations with user controls and guardrails.'],
      ['Outcome analytics', platformSummaryCount(summary.outcomeMetricCount, contracts.outcomeAnalytics && contracts.outcomeAnalytics.outcomes), 'Meaningful outcomes the platform can measure beyond clicks.'],
      ['Guardrails', platformSummaryCount(summary.guardrailMetricCount, contracts.outcomeAnalytics && contracts.outcomeAnalytics.guardrails), 'Risk signals that prevent unhealthy optimization.'],
      ['Data boundaries', platformSummaryCount(summary.dataBoundaryScopeCount, contracts.dataBoundaries && contracts.dataBoundaries.scopes), 'Ownership, visibility, portability, retention, and AI-use scopes.'],
    ];
    var total = rows.reduce(function (sum, row) { return sum + row[1]; }, 0);
    el.innerHTML =
      '<p class="muted small mb-4">Read-only registry served by <span class="mono">GET events?platform</span>. It names reusable platform contracts without gating runtime behavior.</p>' +
      '<div class="stats mb-4">' +
        stat(total, 'Tracked contract items', '◆', 'accent') +
        stat(rows.length, 'Contract groups', '▦', '') +
        stat(platformSummaryCount(summary.moduleCount, contracts.modules), 'Platform modules', '◇', '') +
      '</div>' +
      '<div class="table-wrap"><table class="data"><thead><tr><th>Contract group</th><th>Items</th><th>Purpose</th></tr></thead><tbody>' +
        rows.map(function (row) {
          return '<tr><td><b>' + esc(row[0]) + '</b></td><td><span class="badge neutral">' + row[1] + '</span></td><td>' + esc(row[2]) + '</td></tr>';
        }).join('') +
      '</tbody></table></div>';
  }

  function platformCount(value) {
    return Array.isArray(value) ? value.length : 0;
  }

  function platformSummaryCount(value, fallback) {
    return Number.isFinite(Number(value)) ? Number(value) : platformCount(fallback);
  }

  var CRM_ROLES = ['attendee', 'vendor', 'sponsor', 'speaker', 'dj', 'organizer', 'media', 'staff', 'partner', 'other'];
  var CRM_RELS = ['exhibitor', 'sponsor', 'partner', 'speaker', 'vendor', 'media', 'other'];
  var crmCache = { events: null, companies: null };
  function cap(s) { return String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1); }
  function fld(label, inputHtml, hint) { return '<div class="field"><label>' + esc(label) + '</label>' + inputHtml + (hint ? '<span class="hint">' + esc(hint) + '</span>' : '') + '</div>'; }

  function crmEvents() {
    if (crmCache.events) return Promise.resolve(crmCache.events);
    return api(API.events).then(function (d) { crmCache.events = d.items || []; return crmCache.events; }).catch(function () { return []; });
  }
  function crmCompanyOptions() {
    if (crmCache.companies) return Promise.resolve(crmCache.companies);
    return api(API.crm + '?resource=companies').then(function (d) { crmCache.companies = d.items || []; return crmCache.companies; }).catch(function () { return []; });
  }
  function crmStatsStrip(host) {
    api(API.crm + '?resource=stats').then(function (d) {
      var s = d.stats || {}, el = $('#crmStats', host); if (!el) return;
      var saved = Math.max(0, ((s.source && s.source.emailRecords) || 0) - (s.people || 0));
      el.innerHTML =
        stat(s.people || 0, 'People', '🧑‍🤝‍🧑', 'accent') +
        stat(s.companies || 0, 'Companies', '🏢', '') +
        stat(s.roleLinks || 0, 'Role links', '🎭', '') +
        stat(s.eventLinks || 0, 'Company ↔ events', '🎪', '') +
        stat(saved, 'Duplicate rows folded', '✨', saved ? 'warn' : '');
    }).catch(function () {});
  }
  function roleChips(roles) {
    return (roles && roles.length) ? roles.map(function (r) { return roleBadge(r); }).join(' ') : '<span class="muted small">no roles</span>';
  }
  function companySelect(companies, selected) {
    return '<select id="pCompany"><option value="">— No company —</option>' +
      companies.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === selected ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select>';
  }
  function eventSelect(id, events, allLabel) {
    return '<select id="' + id + '" style="width:auto"><option value="">' + esc(allLabel || 'All / global') + '</option>' +
      events.map(function (e) { return '<option value="' + esc(e.id) + '">' + esc(e.name) + '</option>'; }).join('') + '</select>';
  }
  function selectOpts(list) { return list.map(function (r) { return '<option value="' + r + '">' + cap(r) + '</option>'; }).join(''); }

  // People workspace ----------------------------------------------------------
  function renderCrmPeople(host) {
    var state = { items: [], role: '', q: '' };
    host.innerHTML = pageHead('People', 'One canonical record per human — deduplicated by email, with unlimited roles across every event. People and companies never copy each other’s data.',
      '<button class="btn brand sm" id="crmNewPerson">+ Person</button><button class="btn ghost sm" id="crmSync">⟲ Sync from site</button><button class="btn ghost sm" id="crmPRefresh">↻ Refresh</button>') +
      '<div class="stats" id="crmStats">' + statSkeletons(5) + '</div>' +
      '<div class="toolbar">' +
        '<div class="seg" id="crmRole">' + seg('', 'All') + CRM_ROLES.map(function (r) { return seg(r, cap(r)); }).join('') + '</div>' +
        '<div class="search-box"><input type="search" id="crmPSearch" placeholder="Search name, email or company…"></div>' +
      '</div>' +
      '<div id="crmPBody">' + loadingList() + '</div>';

    crmStatsStrip(host);
    $('#crmRole', host).onclick = function (e) { var b = e.target.closest('button'); if (!b) return; state.role = b.getAttribute('data-v'); segActive($('#crmRole', host), b); load(); };
    $('#crmPSearch', host).oninput = debounce(function (e) { state.q = e.target.value.trim().toLowerCase(); paint(); }, 150);
    $('#crmPRefresh', host).onclick = function () { crmCache.companies = null; load(); crmStatsStrip(host); };
    $('#crmNewPerson', host).onclick = function () { openPersonDrawer(null, load); };
    $('#crmSync', host).onclick = function () {
      confirmModal({ title: 'Sync from site data?', body: 'Scans every profile and application and folds them into deduplicated people and companies. Safe to run repeatedly — existing records are matched, never duplicated.', confirm: 'Sync now' }).then(function (ok) {
        if (!ok) return;
        toast('Syncing…');
        api(API.crm + '?resource=import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"action":"import"}' })
          .then(function (d) { var r = d.result || {}; toast('Synced ' + (r.scanned || 0) + ' records → ' + (r.peopleCreated || 0) + ' new people, ' + (r.companiesCreated || 0) + ' new companies', { type: 'ok' }); crmCache.companies = null; crmStatsStrip(host); load(); })
          .catch(function (e) { toast(e.message, { type: 'err' }); });
      });
    };

    function load() {
      $('#crmPBody', host).innerHTML = loadingList();
      api(API.crm + '?resource=people' + (state.role ? '&role=' + encodeURIComponent(state.role) : '')).then(function (d) { state.items = d.items || []; paint(); })
        .catch(function (e) { $('#crmPBody', host).innerHTML = errorBox(e.message); });
    }
    function paint() {
      var items = state.items.filter(function (p) { return !state.q || (p.fullName + ' ' + p.email + ' ' + (p.companyName || '')).toLowerCase().indexOf(state.q) >= 0; });
      var body = $('#crmPBody', host);
      if (!items.length) { body.innerHTML = emptyState('🧑‍🤝‍🧑', 'No people yet', 'Add a person, or Sync from the site to import existing profiles & applications.'); return; }
      body.innerHTML = '<div class="list">' + items.map(function (p) {
        return '<div class="row" style="cursor:pointer" data-open="' + esc(p.id) + '">' + avatar('', p.fullName) +
          '<div class="grow"><div class="name">' + esc(p.fullName || '(no name)') + ' ' + roleChips(p.roles) + '</div>' +
          '<div class="meta">' + (p.companyName ? '🏢 ' + esc(p.companyName) + ' · ' : '') + esc(p.email || 'no email') + '</div></div>' +
          '<span class="badge neutral">' + (p.roleCount || 0) + ' role' + (p.roleCount === 1 ? '' : 's') + '</span></div>';
      }).join('') + '</div>';
      Array.prototype.forEach.call(body.querySelectorAll('[data-open]'), function (el) { el.onclick = function () { openPersonDrawer(el.getAttribute('data-open'), load); }; });
    }
    load();
  }

  function openPersonDrawer(id, onChange) {
    Promise.all([
      id ? api(API.crm + '?resource=people&id=' + encodeURIComponent(id)).then(function (d) { return d.item; }) : Promise.resolve(null),
      crmCompanyOptions(), crmEvents(),
    ]).then(function (r) { showPerson(r[0], r[1], r[2], onChange); }).catch(function (e) { toast(e.message, { type: 'err' }); });
  }
  function showPerson(p, companies, events, onChange) {
    var isNew = !p; p = p || { id: '', fullName: '', email: '', phone: '', title: '', companyId: '', notes: '', roles: [] };
    var body = h('<div></div>');
    body.innerHTML =
      '<div class="card mb-4"><div class="card-title">👤 Details</div>' +
        fld('Full name', '<input id="pName" value="' + esc(p.fullName) + '" placeholder="Jane Doe">') +
        fld('Email', '<input id="pEmail" value="' + esc(p.email) + '" placeholder="jane@example.com">', 'The dedup key — a second person can never share this email.') +
        fld('Phone', '<input id="pPhone" value="' + esc(p.phone) + '">') +
        fld('Company', companySelect(companies, p.companyId), 'The one organization this person represents — stored once, referenced here.') +
        fld('Title', '<input id="pTitle" value="' + esc(p.title) + '" placeholder="Head of Sales">') +
        fld('Notes', '<textarea id="pNotes" rows="3">' + esc(p.notes) + '</textarea>') +
      '</div>' +
      (isNew ? '' :
      '<div class="card"><div class="card-title">🎭 Roles <span class="sub">one person, unlimited roles</span></div>' +
        '<div id="pRoles" class="chips"></div>' +
        '<div class="hstack mt-4">' +
          '<select id="pAddRole" style="width:auto">' + selectOpts(CRM_ROLES) + '</select>' +
          eventSelect('pAddRoleEvent', events) +
          '<button class="btn brand sm" id="pAddRoleBtn">+ Add role</button>' +
        '</div></div>');

    function rolesList(roles) {
      return (roles && roles.length) ? roles.map(function (r) {
        return '<span class="chip">' + roleBadge(r.role) + '<span class="muted small">@ ' + esc(r.eventName || 'global') + '</span>' +
          '<button class="chip-x" data-role="' + esc(r.id) + '" title="Remove role">×</button></span>';
      }).join('') : '<span class="muted small">No roles yet.</span>';
    }
    function reloadPerson() {
      api(API.crm + '?resource=people&id=' + encodeURIComponent(p.id)).then(function (d) { p.roles = d.item.roles; $('#pRoles', body).innerHTML = rolesList(p.roles); if (onChange) onChange(); });
    }
    if (!isNew) {
      $('#pRoles', body).innerHTML = rolesList(p.roles);
      $('#pRoles', body).onclick = function (e) { var b = e.target.closest('[data-role]'); if (!b) return; api(API.crm + '?resource=role&id=' + encodeURIComponent(b.getAttribute('data-role')), { method: 'DELETE' }).then(reloadPerson).catch(function (err) { toast(err.message, { type: 'err' }); }); };
      $('#pAddRoleBtn', body).onclick = function () {
        api(API.crm + '?resource=role', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ personId: p.id, role: $('#pAddRole', body).value, eventId: $('#pAddRoleEvent', body).value }) })
          .then(reloadPerson).catch(function (err) { toast(err.message, { type: 'err' }); });
      };
    }

    var foot = h('<div style="flex-wrap:wrap"></div>');
    foot.innerHTML = '<button class="btn brand" id="pSave">' + (isNew ? 'Create person' : 'Save') + '</button>' + (isNew ? '' : '<div style="flex:1"></div><button class="btn ghost sm" id="pDel">🗑 Delete</button>');
    $('#pSave', foot).onclick = function () {
      var payload = { id: p.id || undefined, fullName: $('#pName', body).value.trim(), email: $('#pEmail', body).value.trim(), phone: $('#pPhone', body).value.trim(), companyId: $('#pCompany', body).value, title: $('#pTitle', body).value.trim(), notes: $('#pNotes', body).value };
      api(API.crm + '?resource=person', { method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(function () { toast(isNew ? 'Person created' : 'Saved', { type: 'ok' }); closeDrawer(); if (onChange) onChange(); })
        .catch(function (err) { toast(err.message, { type: 'err' }); });
    };
    if (!isNew) $('#pDel', foot).onclick = function () {
      confirmModal({ title: 'Delete person?', body: 'Removes ' + (p.fullName || 'this person') + ' and their roles. Their company is left intact.', confirm: 'Delete', danger: true }).then(function (ok) {
        if (!ok) return;
        api(API.crm + '?resource=person&id=' + encodeURIComponent(p.id), { method: 'DELETE' }).then(function () { toast('Deleted'); closeDrawer(); if (onChange) onChange(); }).catch(function (err) { toast(err.message, { type: 'err' }); });
      });
    };
    openDrawer(isNew ? 'New person' : (p.fullName || 'Person'), body, foot);
  }

  // Companies workspace --------------------------------------------------------
  function renderCrmCompanies(host) {
    var state = { items: [], q: '' };
    host.innerHTML = pageHead('Companies', 'One canonical record per organization — deduplicated by name and linked to unlimited events. People reference a company, so its details live in exactly one place.',
      '<button class="btn brand sm" id="crmNewCo">+ Company</button><button class="btn ghost sm" id="crmCRefresh">↻ Refresh</button>') +
      '<div class="toolbar"><div class="search-box"><input type="search" id="crmCSearch" placeholder="Search name, industry or website…"></div></div>' +
      '<div id="crmCBody">' + loadingList() + '</div>';
    $('#crmCSearch', host).oninput = debounce(function (e) { state.q = e.target.value.trim().toLowerCase(); paint(); }, 150);
    $('#crmCRefresh', host).onclick = load;
    $('#crmNewCo', host).onclick = function () { openCompanyDrawer(null, load); };
    function load() {
      $('#crmCBody', host).innerHTML = loadingList();
      api(API.crm + '?resource=companies').then(function (d) { state.items = d.items || []; crmCache.companies = state.items; paint(); }).catch(function (e) { $('#crmCBody', host).innerHTML = errorBox(e.message); });
    }
    function paint() {
      var items = state.items.filter(function (c) { return !state.q || (c.name + ' ' + c.industry + ' ' + c.website).toLowerCase().indexOf(state.q) >= 0; });
      var body = $('#crmCBody', host);
      if (!items.length) { body.innerHTML = emptyState('🏢', 'No companies yet', 'Add a company, or Sync from the site on the People tab.'); return; }
      body.innerHTML = '<div class="list">' + items.map(function (c) {
        return '<div class="row" style="cursor:pointer" data-open="' + esc(c.id) + '">' + avatar('', c.name, true) +
          '<div class="grow"><div class="name">' + esc(c.name) + (c.industry ? ' <span class="badge neutral">' + esc(c.industry) + '</span>' : '') + '</div>' +
          '<div class="meta">' + (c.website ? esc(c.website) + ' · ' : '') + (c.peopleCount || 0) + ' people · ' + (c.eventCount || 0) + ' events</div></div></div>';
      }).join('') + '</div>';
      Array.prototype.forEach.call(body.querySelectorAll('[data-open]'), function (el) { el.onclick = function () { openCompanyDrawer(el.getAttribute('data-open'), load); }; });
    }
    load();
  }
  function openCompanyDrawer(id, onChange) {
    // Always pull a fresh event list so the "attach event" dropdown reflects
    // every current edition, even one created earlier this session.
    crmCache.events = null;
    Promise.all([
      id ? api(API.crm + '?resource=companies&id=' + encodeURIComponent(id)).then(function (d) { return d.item; }) : Promise.resolve(null),
      crmEvents(),
    ]).then(function (r) { showCompany(r[0], r[1], onChange); }).catch(function (e) { toast(e.message, { type: 'err' }); });
  }
  function showCompany(c, events, onChange) {
    var isNew = !c; c = c || { id: '', name: '', website: '', industry: '', notes: '', events: [], people: [] };
    var body = h('<div></div>');
    body.innerHTML =
      '<div class="card mb-4"><div class="card-title">🏢 Details</div>' +
        fld('Name', '<input id="cName" value="' + esc(c.name) + '" placeholder="Acme Foods">', 'The dedup key — a second company can never share this name.') +
        fld('Website', '<input id="cWebsite" value="' + esc(c.website) + '" placeholder="https://…">') +
        fld('Industry', '<input id="cIndustry" value="' + esc(c.industry) + '">') +
        fld('Notes', '<textarea id="cNotes" rows="3">' + esc(c.notes) + '</textarea>') +
      '</div>' +
      (isNew ? '' :
      '<div class="card mb-4"><div class="card-title">🎪 Events <span class="sub">one company, unlimited events</span></div>' +
        '<div id="cEvents"></div>' +
        '<div class="hstack mt-4">' + eventSelect('cAddEvent', events, 'Pick an event…') +
          '<select id="cAddRel" style="width:auto">' + selectOpts(CRM_RELS) + '</select>' +
          '<button class="btn brand sm" id="cAddEventBtn">+ Link</button></div></div>' +
      '<div class="card"><div class="card-title">🧑‍🤝‍🧑 People here</div><div id="cPeople"></div></div>');

    function eventsList(evs) {
      return (evs && evs.length) ? '<div class="list">' + evs.map(function (e) {
        return '<div class="row"><div class="grow"><div class="name">' + esc(e.eventName) + ' ' + roleBadge(e.relationship) + '</div></div><button class="btn red sm" data-cev="' + esc(e.id) + '">Remove</button></div>';
      }).join('') + '</div>' : '<div class="muted small">Not linked to any event yet.</div>';
    }
    function peopleList(pe) {
      return (pe && pe.length) ? '<div class="list">' + pe.map(function (p) {
        return '<div class="row" style="cursor:pointer" data-person="' + esc(p.id) + '">' + avatar('', p.fullName) + '<div class="grow"><div class="name">' + esc(p.fullName || '(no name)') + '</div><div class="meta">' + esc(p.title || p.email || '') + '</div></div></div>';
      }).join('') + '</div>' : '<div class="muted small">No people reference this company.</div>';
    }
    function reloadCompany() {
      api(API.crm + '?resource=companies&id=' + encodeURIComponent(c.id)).then(function (d) { c.events = d.item.events; $('#cEvents', body).innerHTML = eventsList(c.events); if (onChange) onChange(); });
    }
    if (!isNew) {
      $('#cEvents', body).innerHTML = eventsList(c.events);
      $('#cPeople', body).innerHTML = peopleList(c.people);
      $('#cEvents', body).onclick = function (e) { var b = e.target.closest('[data-cev]'); if (!b) return; api(API.crm + '?resource=companyEvent&id=' + encodeURIComponent(b.getAttribute('data-cev')), { method: 'DELETE' }).then(reloadCompany).catch(function (err) { toast(err.message, { type: 'err' }); }); };
      $('#cAddEventBtn', body).onclick = function () {
        var ev = $('#cAddEvent', body).value; if (!ev) { toast('Pick an event first', { type: 'err' }); return; }
        api(API.crm + '?resource=companyEvent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId: c.id, eventId: ev, relationship: $('#cAddRel', body).value }) }).then(reloadCompany).catch(function (err) { toast(err.message, { type: 'err' }); });
      };
      $('#cPeople', body).onclick = function (e) { var b = e.target.closest('[data-person]'); if (!b) return; openPersonDrawer(b.getAttribute('data-person'), onChange); };
    }

    var foot = h('<div style="flex-wrap:wrap"></div>');
    foot.innerHTML = '<button class="btn brand" id="cSave">' + (isNew ? 'Create company' : 'Save') + '</button>' + (isNew ? '' : '<div style="flex:1"></div><button class="btn ghost sm" id="cDel">🗑 Delete</button>');
    $('#cSave', foot).onclick = function () {
      var payload = { id: c.id || undefined, name: $('#cName', body).value.trim(), website: $('#cWebsite', body).value.trim(), industry: $('#cIndustry', body).value.trim(), notes: $('#cNotes', body).value };
      api(API.crm + '?resource=company', { method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(function (res) {
          toast(isNew ? 'Company created' : 'Saved', { type: 'ok' }); crmCache.companies = null; if (onChange) onChange();
          // A brand-new company has no Events/People cards (they need its id), so
          // reopen it as a saved company — this is where events get attached.
          if (isNew && res && res.item && res.item.id) { openCompanyDrawer(res.item.id, onChange); }
          else { closeDrawer(); }
        })
        .catch(function (err) { toast(err.message, { type: 'err' }); });
    };
    if (!isNew) $('#cDel', foot).onclick = function () {
      confirmModal({ title: 'Delete company?', body: 'Removes ' + (c.name || 'this company') + ' and its event links. People are kept but detached from it.', confirm: 'Delete', danger: true }).then(function (ok) {
        if (!ok) return;
        api(API.crm + '?resource=company&id=' + encodeURIComponent(c.id), { method: 'DELETE' }).then(function () { toast('Deleted'); crmCache.companies = null; closeDrawer(); if (onChange) onChange(); }).catch(function (err) { toast(err.message, { type: 'err' }); });
      });
    };
    openDrawer(isNew ? 'New company' : (c.name || 'Company'), body, foot);
  }

  // ── Advertising (Ad Manager) ──────────────────────────────────────────────
  // The sell-side of the platform. Advertisers are canonical CRM companies, so a
  // campaign references a company by id and copies nothing. A campaign owns
  // creatives (one per placement slot), schedules a run window, tracks delivery
  // (impressions/clicks from the public serving endpoints) and bills via
  // invoices. Backed by the ads function — see netlify/functions/ads.mjs.
  var AD_PLACEMENTS = [
    { v: 'homepage_banner', label: 'Homepage banner' },
    { v: 'directory', label: 'Directory ad' },
    { v: 'featured_vendor', label: 'Featured vendor' },
    { v: 'email_sponsor', label: 'Email sponsorship' },
    { v: 'sidebar', label: 'Sidebar' },
  ];
  var AD_CAMPAIGN_STATUSES = ['draft', 'scheduled', 'active', 'paused', 'completed', 'archived'];
  var AD_RATE_TYPES = ['flat', 'cpm', 'cpc'];
  var AD_INVOICE_STATUSES = ['draft', 'sent', 'paid', 'void'];
  function placementLabel(v) { for (var i = 0; i < AD_PLACEMENTS.length; i++) if (AD_PLACEMENTS[i].v === v) return AD_PLACEMENTS[i].label; return v; }
  function money(cents, currency) { return (currency || 'USD') === 'USD' ? '$' + ((cents || 0) / 100).toFixed(2) : ((cents || 0) / 100).toFixed(2) + ' ' + (currency || ''); }
  function ctr(imp, clk) { return imp ? (Math.round((clk / imp) * 1000) / 10) + '%' : '0%'; }
  function adStatusBadge(s) { return '<span class="badge dot ' + esc(s === 'active' ? 'approved' : s === 'paused' ? 'amber' : s === 'completed' ? 'blue' : s === 'archived' ? 'rejected' : 'neutral') + '">' + esc(s) + '</span>'; }
  function invStatusBadge(s) { return '<span class="badge dot ' + esc(s === 'paid' ? 'approved' : s === 'sent' ? 'blue' : s === 'void' ? 'rejected' : 'neutral') + '">' + esc(s) + '</span>'; }
  function optionList(list, sel) {
    return list.map(function (o) { return '<option value="' + esc(o) + '"' + (o === sel ? ' selected' : '') + '>' + esc(cap(o)) + '</option>'; }).join('');
  }

  // Campaigns workspace --------------------------------------------------------
  function renderAdCampaigns(host) {
    var state = { items: [], status: '', q: '' };
    host.innerHTML = pageHead('Campaigns', 'Advertiser buys across every placement — homepage banners, directory ads, featured vendors and email sponsorships. Advertisers are your CRM companies, so nothing is duplicated.',
      '<button class="btn brand sm" id="adNew">+ Campaign</button><button class="btn ghost sm" id="adRefresh">↻ Refresh</button>') +
      '<div class="stats" id="adStats">' + statSkeletons(4) + '</div>' +
      '<div class="toolbar">' +
        '<div class="seg" id="adStatusSeg">' + seg('', 'All') + AD_CAMPAIGN_STATUSES.map(function (s) { return seg(s, cap(s)); }).join('') + '</div>' +
        '<div class="search-box"><input type="search" id="adSearch" placeholder="Search campaign or advertiser…"></div>' +
      '</div>' +
      '<div id="adBody">' + loadingList() + '</div>';

    adStatsStrip(host);
    $('#adStatusSeg', host).onclick = function (e) { var b = e.target.closest('button'); if (!b) return; state.status = b.getAttribute('data-v'); segActive($('#adStatusSeg', host), b); load(); };
    $('#adSearch', host).oninput = debounce(function (e) { state.q = e.target.value.trim().toLowerCase(); paint(); }, 150);
    $('#adRefresh', host).onclick = function () { crmCache.companies = null; load(); adStatsStrip(host); };
    $('#adNew', host).onclick = function () { openCampaignDrawer(null, function () { load(); adStatsStrip(host); }); };

    function load() {
      $('#adBody', host).innerHTML = loadingList();
      api(API.ads + '?resource=campaigns' + (state.status ? '&status=' + encodeURIComponent(state.status) : '')).then(function (d) { state.items = d.items || []; paint(); })
        .catch(function (e) { $('#adBody', host).innerHTML = errorBox(e.message); });
    }
    function paint() {
      var items = state.items.filter(function (c) { return !state.q || (c.name + ' ' + (c.companyName || '')).toLowerCase().indexOf(state.q) >= 0; });
      var body = $('#adBody', host);
      if (!items.length) { body.innerHTML = emptyState('📣', 'No campaigns yet', 'Create a campaign and add creatives to start serving ads.'); return; }
      body.innerHTML = '<div class="list">' + items.map(function (c) {
        return '<div class="row" style="cursor:pointer" data-open="' + esc(c.id) + '">' + avatar('', c.companyName || c.name, true) +
          '<div class="grow"><div class="name">' + esc(c.name || '(untitled)') + ' ' + adStatusBadge(c.status) + '</div>' +
          '<div class="meta">' + (c.companyName ? '🏢 ' + esc(c.companyName) + ' · ' : '') + (c.creativeCount || 0) + ' creative' + (c.creativeCount === 1 ? '' : 's') +
          ' · ' + fmtRange(c.startsAt, c.endsAt) + '</div></div>' +
          '<div style="text-align:right"><div class="name">' + (c.impressions || 0) + ' impr · ' + (c.clicks || 0) + ' clk</div>' +
          '<div class="meta">CTR ' + ctr(c.impressions, c.clicks) + ' · ' + money(c.rateAmountCents, 'USD') + ' ' + esc(c.rateType) + '</div></div></div>';
      }).join('') + '</div>';
      Array.prototype.forEach.call(body.querySelectorAll('[data-open]'), function (el) { el.onclick = function () { openCampaignDrawer(el.getAttribute('data-open'), function () { load(); adStatsStrip(host); }); }; });
    }
    load();
  }

  function adStatsStrip(host) {
    api(API.ads + '?resource=report').then(function (d) {
      var r = d.report || {}, el = $('#adStats', host); if (!el) return;
      el.innerHTML =
        stat((r.campaigns && r.campaigns.byStatus && r.campaigns.byStatus.active) || 0, 'Active campaigns', '📣', 'accent') +
        stat(r.impressions || 0, 'Impressions', '👁️', '') +
        stat(r.clicks || 0, 'Clicks', '👆', '') +
        stat((r.ctr || 0) + '%', 'Overall CTR', '📈', (r.ctr ? 'warn' : ''));
    }).catch(function () {});
  }

  function openCampaignDrawer(id, onChange) {
    Promise.all([
      id ? api(API.ads + '?resource=campaigns&id=' + encodeURIComponent(id)).then(function (d) { return d.item; }) : Promise.resolve(null),
      crmCompanyOptions(), crmEvents(),
    ]).then(function (r) { showCampaign(r[0], r[1], r[2], onChange); }).catch(function (e) { toast(e.message, { type: 'err' }); });
  }
  function showCampaign(c, companies, events, onChange) {
    var isNew = !c;
    c = c || { id: '', name: '', companyId: '', eventId: '', status: 'draft', rateType: 'flat', rateAmountCents: 0, budgetCents: 0, priority: 1, startsAt: '', endsAt: '', notes: '', creatives: [], invoices: [] };
    function d10(v) { return v ? String(v).slice(0, 10) : ''; }
    var body = h('<div></div>');
    body.innerHTML =
      '<div class="card mb-4"><div class="card-title">📣 Campaign</div>' +
        fld('Name', '<input id="adName" value="' + esc(c.name) + '" placeholder="Summer banner buy">') +
        fld('Advertiser', '<select id="adCompany"><option value="">— Choose a CRM company —</option>' +
          companies.map(function (o) { return '<option value="' + esc(o.id) + '"' + (o.id === c.companyId ? ' selected' : '') + '>' + esc(o.name) + '</option>'; }).join('') + '</select>',
          'The advertiser is a canonical company — add new ones in CRM → Companies.') +
        fld('Event', '<select id="adEvent"><option value="">All / global</option>' +
          events.map(function (e) { return '<option value="' + esc(e.id) + '"' + (e.id === c.eventId ? ' selected' : '') + '>' + esc(e.name) + '</option>'; }).join('') + '</select>') +
        '<div class="grid cols-2">' +
          fld('Status', '<select id="adStatus">' + optionList(AD_CAMPAIGN_STATUSES, c.status) + '</select>', 'Only “active” campaigns inside their dates serve.') +
          fld('Priority (weight)', '<input id="adPriority" type="number" min="0" max="1000" value="' + esc(c.priority) + '">') +
        '</div>' +
        '<div class="grid cols-2">' +
          fld('Starts', '<input type="date" id="adStart" value="' + d10(c.startsAt) + '">') +
          fld('Ends (expiration)', '<input type="date" id="adEnd" value="' + d10(c.endsAt) + '">') +
        '</div>' +
        '<div class="grid cols-2">' +
          fld('Rate type', '<select id="adRateType">' + optionList(AD_RATE_TYPES, c.rateType) + '</select>') +
          fld('Rate amount ($)', '<input id="adRate" type="number" min="0" step="0.01" value="' + esc(((c.rateAmountCents || 0) / 100).toFixed(2)) + '">') +
        '</div>' +
        fld('Budget cap ($, optional)', '<input id="adBudget" type="number" min="0" step="0.01" value="' + esc(((c.budgetCents || 0) / 100).toFixed(2)) + '">') +
        fld('Notes', '<textarea id="adNotes" rows="2">' + esc(c.notes) + '</textarea>') +
      '</div>' +
      (isNew ? '<div class="embed-note">💡 Save the campaign first, then add creatives and invoices.</div>' :
        '<div class="card mb-4"><div class="card-title">🖼️ Creatives <span class="sub">one per placement slot</span></div>' +
          '<div id="adCreatives"></div>' +
          '<button class="btn brand sm mt-4" id="adAddCreative">+ Add creative</button></div>' +
        '<div class="card"><div class="card-title">🧾 Invoices</div><div id="adInvoices"></div>' +
          '<button class="btn ghost sm mt-4" id="adAddInvoice">+ Generate invoice</button></div>');

    function creativesList(list) {
      return (list && list.length) ? '<div class="list">' + list.map(function (cr) {
        return '<div class="row"><div class="grow" style="cursor:pointer" data-crv="' + esc(cr.id) + '">' +
          '<div class="name">' + esc(cr.headline || '(no headline)') + ' <span class="badge neutral">' + esc(placementLabel(cr.placement)) + '</span> ' + (cr.status === 'paused' ? adStatusBadge('paused') : '') + '</div>' +
          '<div class="meta">' + (cr.impressions || 0) + ' impr · ' + (cr.clicks || 0) + ' clk · CTR ' + ctr(cr.impressions, cr.clicks) + '</div></div>' +
          '<button class="btn red sm" data-crvdel="' + esc(cr.id) + '">🗑</button></div>';
      }).join('') + '</div>' : '<div class="muted small">No creatives yet — add one to start serving.</div>';
    }
    function invoicesList(list) {
      return (list && list.length) ? '<div class="list">' + list.map(function (iv) {
        return '<div class="row"><div class="grow"><div class="name">' + esc(iv.number) + ' ' + invStatusBadge(iv.status) + '</div>' +
          '<div class="meta">' + money(iv.amountCents, iv.currency) + (iv.dueAt ? ' · due ' + fmtDate(iv.dueAt) : '') + '</div></div>' +
          '<a class="btn ghost sm" href="#/ads-invoices">Open</a></div>';
      }).join('') + '</div>' : '<div class="muted small">No invoices yet.</div>';
    }
    function reloadCampaign() {
      api(API.ads + '?resource=campaigns&id=' + encodeURIComponent(c.id)).then(function (dd) {
        c = dd.item; $('#adCreatives', body).innerHTML = creativesList(c.creatives); $('#adInvoices', body).innerHTML = invoicesList(c.invoices);
        wireCreativeRows(); if (onChange) onChange();
      });
    }
    function wireCreativeRows() {
      var cont = $('#adCreatives', body); if (!cont) return;
      cont.onclick = function (e) {
        var del = e.target.closest('[data-crvdel]');
        if (del) { api(API.ads + '?resource=creative&id=' + encodeURIComponent(del.getAttribute('data-crvdel')), { method: 'DELETE' }).then(reloadCampaign).catch(function (err) { toast(err.message, { type: 'err' }); }); return; }
        var open = e.target.closest('[data-crv]');
        if (open) { var cr = null; for (var i = 0; i < c.creatives.length; i++) if (c.creatives[i].id === open.getAttribute('data-crv')) cr = c.creatives[i]; openCreativeDrawer(c, cr, reloadCampaign); }
      };
    }
    if (!isNew) {
      $('#adCreatives', body).innerHTML = creativesList(c.creatives);
      $('#adInvoices', body).innerHTML = invoicesList(c.invoices);
      wireCreativeRows();
      $('#adAddCreative', body).onclick = function () { openCreativeDrawer(c, null, reloadCampaign); };
      $('#adAddInvoice', body).onclick = function () {
        api(API.ads + '?resource=invoice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaignId: c.id }) })
          .then(function () { toast('Invoice generated', { type: 'ok' }); reloadCampaign(); }).catch(function (err) { toast(err.message, { type: 'err' }); });
      };
    }

    var foot = h('<div style="flex-wrap:wrap"></div>');
    foot.innerHTML = '<button class="btn brand" id="adSave">' + (isNew ? 'Create campaign' : 'Save') + '</button>' + (isNew ? '' : '<div style="flex:1"></div><button class="btn ghost sm" id="adDel">🗑 Delete</button>');
    $('#adSave', foot).onclick = function () {
      var name = $('#adName', body).value.trim();
      if (!name) { toast('A campaign needs a name.', { type: 'err' }); return; }
      if (!$('#adCompany', body).value) { toast('Choose the advertiser.', { type: 'err' }); return; }
      var payload = {
        id: c.id || undefined, name: name, companyId: $('#adCompany', body).value, eventId: $('#adEvent', body).value,
        status: $('#adStatus', body).value, priority: $('#adPriority', body).value,
        startsAt: $('#adStart', body).value || '', endsAt: $('#adEnd', body).value || '',
        rateType: $('#adRateType', body).value, rateAmount: $('#adRate', body).value, budget: $('#adBudget', body).value,
        notes: $('#adNotes', body).value,
      };
      var save = $('#adSave', foot); save.disabled = true;
      api(API.ads + '?resource=campaign', { method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(function (dd) { toast(isNew ? 'Campaign created' : 'Saved', { type: 'ok' }); if (onChange) onChange(); if (isNew && dd.item) { showCampaign(dd.item, companies, events, onChange); } else { closeDrawer(); } })
        .catch(function (err) { save.disabled = false; toast(err.message, { type: 'err' }); });
    };
    if (!isNew) $('#adDel', foot).onclick = function () {
      confirmModal({ title: 'Delete campaign?', body: 'Removes ' + (c.name || 'this campaign') + ', its creatives, delivery history and invoices. The advertiser company is kept.', confirm: 'Delete', danger: true }).then(function (ok) {
        if (!ok) return;
        api(API.ads + '?resource=campaign&id=' + encodeURIComponent(c.id), { method: 'DELETE' }).then(function () { toast('Deleted'); closeDrawer(); if (onChange) onChange(); }).catch(function (err) { toast(err.message, { type: 'err' }); });
      });
    };
    openDrawer(isNew ? 'New campaign' : (c.name || 'Campaign'), body, foot);
  }

  function openCreativeDrawer(campaign, cr, onChange) {
    var isNew = !cr;
    cr = cr || { id: '', placement: 'homepage_banner', headline: '', body: '', imageUrl: '', ctaLabel: '', targetUrl: '', profileId: '', weight: 1, status: 'active' };
    var body = h('<div></div>');
    body.innerHTML =
      '<div class="card"><div class="card-title">🖼️ Creative</div>' +
        fld('Placement', '<select id="crvPlacement">' + AD_PLACEMENTS.map(function (p) { return '<option value="' + p.v + '"' + (p.v === cr.placement ? ' selected' : '') + '>' + esc(p.label) + '</option>'; }).join('') + '</select>') +
        fld('Headline', '<input id="crvHead" value="' + esc(cr.headline) + '" placeholder="Visit our booth">') +
        fld('Body', '<textarea id="crvBody" rows="2">' + esc(cr.body) + '</textarea>') +
        fld('Image URL', '<input id="crvImage" value="' + esc(cr.imageUrl) + '" placeholder="/media or https://…">', 'Use the Media Library to upload and copy a URL.') +
        fld('Call-to-action label', '<input id="crvCta" value="' + esc(cr.ctaLabel) + '" placeholder="Learn more">') +
        fld('Target URL', '<input id="crvTarget" value="' + esc(cr.targetUrl) + '" placeholder="https://advertiser.com">', 'Clicks are logged, then redirected here.') +
        fld('Featured profile ID (featured vendor only)', '<input id="crvProfile" value="' + esc(cr.profileId) + '">', 'Optional — promotes a directory profile; clicks fall back to it if no target URL.') +
        '<div class="grid cols-2">' +
          fld('Weight', '<input id="crvWeight" type="number" min="1" max="1000" value="' + esc(cr.weight) + '">') +
          fld('Status', '<select id="crvStatus"><option value="active"' + (cr.status === 'active' ? ' selected' : '') + '>active</option><option value="paused"' + (cr.status === 'paused' ? ' selected' : '') + '>paused</option></select>') +
        '</div>' +
      '</div>';
    var foot = h('<div style="flex-wrap:wrap"></div>');
    foot.innerHTML = '<button class="btn brand" id="crvSave">' + (isNew ? 'Add creative' : 'Save') + '</button>';
    $('#crvSave', foot).onclick = function () {
      var payload = {
        id: cr.id || undefined, campaignId: campaign.id, placement: $('#crvPlacement', body).value,
        headline: $('#crvHead', body).value.trim(), body: $('#crvBody', body).value, imageUrl: $('#crvImage', body).value.trim(),
        ctaLabel: $('#crvCta', body).value.trim(), targetUrl: $('#crvTarget', body).value.trim(), profileId: $('#crvProfile', body).value.trim(),
        weight: $('#crvWeight', body).value, status: $('#crvStatus', body).value,
      };
      var save = $('#crvSave', foot); save.disabled = true;
      api(API.ads + '?resource=creative', { method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(function () { toast(isNew ? 'Creative added' : 'Saved', { type: 'ok' }); closeDrawer(); if (onChange) onChange(); })
        .catch(function (err) { save.disabled = false; toast(err.message, { type: 'err' }); });
    };
    openDrawer(isNew ? 'New creative' : 'Edit creative', body, foot);
  }

  // Ad Reports workspace -------------------------------------------------------
  function renderAdReports(host) {
    host.innerHTML = pageHead('Ad Reports', 'Live delivery and revenue for the advertising platform, computed from the impression/click log and invoices.',
      '<button class="btn ghost sm" id="arRefresh">↻ Refresh</button>') +
      '<div class="stats" id="arStats">' + statSkeletons(4) + '</div>' +
      '<div class="grid cols-2">' +
        '<div class="card"><div class="card-title">🎯 Delivery by placement</div><div id="arPlacements" class="muted">Loading…</div></div>' +
        '<div class="card"><div class="card-title">💰 Revenue</div><div id="arRevenue" class="muted">Loading…</div></div>' +
      '</div>' +
      '<div class="card mt-4"><div class="card-title">🏆 Top campaigns</div><div id="arTop">' + loadingList() + '</div></div>';
    $('#arRefresh', host).onclick = function () { renderAdReports(host); };
    api(API.ads + '?resource=report').then(function (d) {
      var r = d.report || {};
      $('#arStats', host).innerHTML =
        stat((r.campaigns && r.campaigns.total) || 0, 'Campaigns', '📣', 'accent') +
        stat(r.impressions || 0, 'Impressions', '👁️', '') +
        stat(r.clicks || 0, 'Clicks', '👆', '') +
        stat((r.ctr || 0) + '%', 'Overall CTR', '📈', '');
      var pls = r.placements || {};
      var pkeys = Object.keys(pls);
      $('#arPlacements', host).innerHTML = pkeys.length ? pkeys.map(function (k) {
        var p = pls[k];
        return '<div class="flex between" style="padding:7px 0;border-bottom:1px solid var(--line-soft)"><span>' + esc(placementLabel(k)) + '</span>' +
          '<b>' + (p.impressions || 0) + ' impr · ' + (p.clicks || 0) + ' clk · ' + ctr(p.impressions, p.clicks) + '</b></div>';
      }).join('') : '<span class="muted">No delivery yet.</span>';
      var rev = r.revenue || {};
      $('#arRevenue', host).innerHTML = '<dl class="kv"><dt>Paid</dt><dd>' + money(rev.paidCents, 'USD') + '</dd>' +
        '<dt>Outstanding (sent)</dt><dd>' + money(rev.outstandingCents, 'USD') + '</dd></dl>' +
        '<a class="btn ghost sm mt-2" href="#/ads-invoices">Manage invoices →</a>';
      var top = r.topCampaigns || [];
      $('#arTop', host).innerHTML = top.length ? '<div class="list">' + top.map(function (t) {
        return '<div class="row"><div class="grow"><div class="name">' + esc(t.name) + '</div><div class="meta">' + esc(t.companyName || '') + '</div></div>' +
          '<div style="text-align:right"><div class="name">' + t.impressions + ' impr · ' + t.clicks + ' clk</div><div class="meta">CTR ' + t.ctr + '%</div></div></div>';
      }).join('') + '</div>' : emptyState('📊', 'No data yet', 'Delivery appears here once campaigns start serving.');
    }).catch(function (e) { $('#arTop', host).innerHTML = errorBox(e.message); });
  }

  // Invoices workspace ---------------------------------------------------------
  function renderAdInvoices(host) {
    var state = { items: [], status: '' };
    host.innerHTML = pageHead('Invoices', 'Billing documents generated from campaigns. Mark them sent, paid or void — revenue rolls up into Ad Reports.',
      '<button class="btn ghost sm" id="inRefresh">↻ Refresh</button>') +
      '<div class="toolbar"><div class="seg" id="inStatusSeg">' + seg('', 'All') + AD_INVOICE_STATUSES.map(function (s) { return seg(s, cap(s)); }).join('') + '</div></div>' +
      '<div id="inBody">' + loadingList() + '</div>';
    $('#inStatusSeg', host).onclick = function (e) { var b = e.target.closest('button'); if (!b) return; state.status = b.getAttribute('data-v'); segActive($('#inStatusSeg', host), b); load(); };
    $('#inRefresh', host).onclick = load;
    function load() {
      $('#inBody', host).innerHTML = loadingList();
      api(API.ads + '?resource=invoices' + (state.status ? '&status=' + encodeURIComponent(state.status) : '')).then(function (d) { state.items = d.items || []; paint(); })
        .catch(function (e) { $('#inBody', host).innerHTML = errorBox(e.message); });
    }
    function paint() {
      var body = $('#inBody', host);
      if (!state.items.length) { body.innerHTML = emptyState('🧾', 'No invoices', 'Generate an invoice from a campaign to bill an advertiser.'); return; }
      body.innerHTML = '<div class="table-wrap"><table class="data"><thead><tr><th>Number</th><th>Advertiser</th><th>Campaign</th><th>Amount</th><th>Status</th><th>Due</th><th></th></tr></thead><tbody>' +
        state.items.map(function (iv) {
          return '<tr><td><b>' + esc(iv.number) + '</b></td><td class="muted">' + esc(iv.companyName || '') + '</td><td class="muted">' + esc(iv.campaignName || '') + '</td>' +
            '<td>' + money(iv.amountCents, iv.currency) + '</td><td>' + invStatusBadge(iv.status) + '</td><td class="muted">' + (iv.dueAt ? fmtDate(iv.dueAt) : '—') + '</td>' +
            '<td><button class="btn ghost sm" data-inv="' + esc(iv.id) + '">Manage</button></td></tr>';
        }).join('') + '</tbody></table></div>';
      Array.prototype.forEach.call(body.querySelectorAll('[data-inv]'), function (el) {
        el.onclick = function () { var iv = null; for (var i = 0; i < state.items.length; i++) if (state.items[i].id === el.getAttribute('data-inv')) iv = state.items[i]; openInvoiceDrawer(iv, load); };
      });
    }
    load();
  }
  function openInvoiceDrawer(iv, onChange) {
    var body = h('<div></div>');
    body.innerHTML =
      '<div class="card mb-4"><div class="card-title">🧾 ' + esc(iv.number) + '</div>' +
        '<dl class="kv"><dt>Advertiser</dt><dd>' + esc(iv.companyName || '—') + '</dd><dt>Campaign</dt><dd>' + esc(iv.campaignName || '—') + '</dd></dl></div>' +
      '<div class="card"><div class="card-title">Details</div>' +
        fld('Amount ($)', '<input id="invAmount" type="number" min="0" step="0.01" value="' + esc(((iv.amountCents || 0) / 100).toFixed(2)) + '">') +
        fld('Status', '<select id="invStatus">' + optionList(AD_INVOICE_STATUSES, iv.status) + '</select>') +
        fld('Due date', '<input id="invDue" type="date" value="' + (iv.dueAt ? String(iv.dueAt).slice(0, 10) : '') + '">') +
        fld('Notes', '<textarea id="invNotes" rows="2">' + esc(iv.notes || '') + '</textarea>') +
      '</div>';
    var foot = h('<div style="flex-wrap:wrap"></div>');
    foot.innerHTML = '<button class="btn brand" id="invSave">Save</button><div style="flex:1"></div><button class="btn ghost sm" id="invDel">🗑 Delete</button>';
    $('#invSave', foot).onclick = function () {
      var payload = { id: iv.id, amount: $('#invAmount', body).value, status: $('#invStatus', body).value, dueAt: $('#invDue', body).value || '', notes: $('#invNotes', body).value };
      api(API.ads + '?resource=invoice', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(function () { toast('Invoice saved', { type: 'ok' }); closeDrawer(); if (onChange) onChange(); }).catch(function (err) { toast(err.message, { type: 'err' }); });
    };
    $('#invDel', foot).onclick = function () {
      confirmModal({ title: 'Delete invoice?', body: 'Removes ' + iv.number + '. This cannot be undone.', confirm: 'Delete', danger: true }).then(function (ok) {
        if (!ok) return;
        api(API.ads + '?resource=invoice&id=' + encodeURIComponent(iv.id), { method: 'DELETE' }).then(function () { toast('Deleted'); closeDrawer(); if (onChange) onChange(); }).catch(function (err) { toast(err.message, { type: 'err' }); });
      });
    };
    openDrawer(iv.number, body, foot);
  }

  // ── Audit log (append-only accountability trail) ──────────────────────────
  // A read-only window over the server-side audit_log: every privileged action
  // (application reviews, event & profile changes, media/settings edits, admin
  // sign-ins) with who, what, when and from where. Newest-first, filterable by
  // action and resource, with cursor "load more" paging.
  function renderAudit(host) {
    host.innerHTML = pageHead('Audit Log', 'An append-only record of every privileged action — who changed what, when and from where. Newest first.',
      '<button class="btn ghost sm" id="alRefresh">↻ Refresh</button>') +
      '<div class="toolbar">' +
        '<select id="alAction" class="input-sm" style="width:auto" aria-label="Filter by action"><option value="">All actions</option></select>' +
        '<select id="alType" class="input-sm" style="width:auto" aria-label="Filter by resource"><option value="">All resources</option></select>' +
        '<div class="grow"></div><span class="muted small" id="alCount"></span>' +
      '</div>' +
      '<div id="alBody">' + loadingList() + '</div>' +
      '<div class="hstack mt-4" style="justify-content:center"><button class="btn ghost" id="alMore" hidden>Load older</button></div>';
    var items = [], nextBefore = null, loading = false, filtersLoaded = false;
    function fmtDetails(d) {
      if (!d || typeof d !== 'object') return '<span class="muted small">—</span>';
      var parts = Object.keys(d).filter(function (k) { return k !== 'actorName'; }).map(function (k) {
        var v = d[k]; if (Array.isArray(v)) v = v.join(', ');
        if (v === '' || v == null) return '';
        return '<span class="badge neutral" style="margin:2px 4px 2px 0">' + esc(k) + ': ' + esc(String(v)) + '</span>';
      }).filter(Boolean);
      return parts.length ? parts.join('') : '<span class="muted small">—</span>';
    }
    function paint() {
      var body = $('#alBody', host);
      if (!items.length) { body.innerHTML = emptyState('📜', 'No activity yet', 'Privileged actions will appear here as they happen.'); return; }
      body.innerHTML = '<div class="table-wrap"><table class="data"><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Resource</th><th>Details</th><th>IP</th></tr></thead><tbody>' +
        items.map(function (r) {
          return '<tr><td class="muted" style="white-space:nowrap">' + esc(fmtDateTime(r.createdAt)) + '</td>' +
            '<td><b>' + esc(r.actorName || 'System') + '</b></td>' +
            '<td><span class="badge role">' + esc(r.action) + '</span></td>' +
            '<td class="muted">' + esc(r.resourceType) + (r.resourceId ? '<div class="mono small">' + esc(r.resourceId) + '</div>' : '') + '</td>' +
            '<td>' + fmtDetails(r.details) + '</td>' +
            '<td class="mono small muted">' + esc(r.ip) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    function fillFilters(f) {
      if (filtersLoaded || !f) return; filtersLoaded = true;
      var aSel = $('#alAction', host), tSel = $('#alType', host);
      (f.actions || []).forEach(function (a) { var o = document.createElement('option'); o.value = a; o.textContent = a; aSel.appendChild(o); });
      (f.resourceTypes || []).forEach(function (t) { var o = document.createElement('option'); o.value = t; o.textContent = t; tSel.appendChild(o); });
    }
    function query(reset) {
      if (loading) return; loading = true;
      var more = $('#alMore', host);
      var params = [];
      var action = $('#alAction', host).value, type = $('#alType', host).value;
      if (action) params.push('action=' + encodeURIComponent(action));
      if (type) params.push('resourceType=' + encodeURIComponent(type));
      if (!reset && nextBefore) params.push('before=' + encodeURIComponent(nextBefore));
      if (reset) { items = []; nextBefore = null; $('#alBody', host).innerHTML = loadingList(); }
      api(API.audit + (params.length ? '?' + params.join('&') : '')).then(function (d) {
        loading = false;
        fillFilters(d.filters);
        items = items.concat(d.items || []);
        nextBefore = d.nextBefore || null;
        $('#alCount', host).textContent = items.length + ' record' + (items.length === 1 ? '' : 's') + (nextBefore ? '+' : '');
        more.hidden = !nextBefore;
        paint();
      }).catch(function (e) { loading = false; $('#alBody', host).innerHTML = errorBox(e.message); });
    }
    $('#alRefresh', host).onclick = function () { query(true); };
    $('#alAction', host).onchange = function () { query(true); };
    $('#alType', host).onchange = function () { query(true); };
    $('#alMore', host).onclick = function () { query(false); };
    query(true);
  }

  // ── Events (multi-event control) ───────────────────────────────────────────
  // The platform is an Event OS: every edition (2026, 2027, future expos, other
  // venues) is a first-class record here. Exactly one is active — the edition new
  // public submissions attach to. Applications and profiles are scoped per event.
  function eventBadges(e) {
    var s = e.isActive
      ? '<span class="badge approved dot">Active</span>'
      : '<span class="badge neutral dot">' + esc(e.status || 'planning') + '</span>';
    return s;
  }
  function fmtRange(a, b) {
    if (!a && !b) return 'Dates not set';
    if (a && b) return fmtDate(a) + ' – ' + fmtDate(b);
    return fmtDate(a || b);
  }
  function renderEvents(host) {
    host.innerHTML = pageHead('Events', 'Every edition, expo and venue the platform runs. One event is active at a time — it is the edition new applications and profiles attach to.',
      '<button class="btn brand sm" id="evNew">+ New event</button><button class="btn ghost sm" id="evRefresh">↻ Refresh</button>') +
      '<div id="evBody">' + loadingList() + '</div>';

    function load() {
      // Editions changed here (create/edit/delete/activate all funnel through
      // load()), so drop the shared CRM events cache. Otherwise the company and
      // person drawers keep offering a stale event list and a company can never be
      // attached to a newly created edition.
      crmCache.events = null;
      $('#evBody', host).innerHTML = loadingList();
      api(API.events).then(function (d) { paint(d.items || []); })
        .catch(function (e) { $('#evBody', host).innerHTML = errorBox(e.message); });
    }
    function paint(items) {
      var body = $('#evBody', host);
      if (!items.length) { body.innerHTML = emptyState('🎪', 'No events yet', 'Create your first edition to get started.'); return; }
      body.innerHTML = '<div class="grid auto">' + items.map(card).join('') + '</div>';
      body.onclick = onAction;
    }
    function card(e) {
      var c = e.counts || {};
      var settings = e.settings || {};
      var acts = '';
      if (!e.isActive) acts += '<button class="btn brand sm" data-act="activate" data-id="' + esc(e.id) + '">Set active</button>';
      acts += '<button class="btn ghost sm" data-act="edit" data-id="' + esc(e.id) + '">Edit</button>';
      if (!e.isActive) acts += '<button class="btn ghost sm" data-act="del" data-id="' + esc(e.id) + '">🗑</button>';
      return '<div class="card"' + (e.isActive ? ' style="border-color:var(--brand)"' : '') + '>' +
        '<div class="flex between"><div class="card-title" style="margin:0">' + esc(e.name || '(untitled)') + '</div>' + eventBadges(e) + '</div>' +
        (e.tagline ? '<div class="muted small mt-2">' + esc(e.tagline) + '</div>' : '') +
        '<dl class="kv mt-4"><dt>Venue</dt><dd>' + (esc(e.venue || '') || '<span class="muted">—</span>') + (e.location ? ' · ' + esc(e.location) : '') + '</dd>' +
        '<dt>Dates</dt><dd>' + esc(fmtRange(e.startsAt, e.endsAt)) + '</dd>' +
        (settings.theme ? '<dt>Theme</dt><dd>🎨 ' + esc(settings.theme) + '</dd>' : '') +
        '<dt>Applications</dt><dd>' + (c.applications || 0) + '</dd>' +
        '<dt>Profiles</dt><dd>' + (c.profiles || 0) + '</dd></dl>' +
        '<div class="acts mt-4">' + acts + '</div></div>';
    }
    function onAction(e) {
      var b = e.target.closest('button[data-act]'); if (!b) return;
      var id = b.getAttribute('data-id'), act = b.getAttribute('data-act');
      if (act === 'activate') {
        b.disabled = true;
        api(API.events, put({ id: id, activate: true }))
          .then(function () { toast('Active event switched', { type: 'ok' }); load(); })
          .catch(function (err) { b.disabled = false; toast(err.message, { type: 'err' }); });
      } else if (act === 'edit') {
        api(API.events + '?id=' + encodeURIComponent(id)).then(function (d) { eventForm(d.item); }).catch(function (err) { toast(err.message, { type: 'err' }); });
      } else if (act === 'del') {
        confirmModal({ title: 'Delete event?', body: 'This permanently removes the edition. Events with applications or profiles cannot be deleted.', confirm: 'Delete', danger: true }).then(function (ok) {
          if (!ok) return;
          api(API.events + '?id=' + encodeURIComponent(id), { method: 'DELETE' })
            .then(function () { toast('Event deleted'); load(); })
            .catch(function (err) { toast(err.message, { type: 'err' }); });
        });
      }
    }

    // Create / edit drawer.
    var themesCache = null;
    function loadThemes() {
      if (themesCache) return Promise.resolve(themesCache);
      return api(API.events + '?themes')
        .then(function (d) { themesCache = { list: d.themes || [], def: d.defaultTheme || '' }; return themesCache; })
        .catch(function () { themesCache = { list: [], def: '' }; return themesCache; });
    }
    // A row of colour chips previewing a theme's palette.
    function themeSwatch(t) {
      var b = t.branding || {};
      function chip(c) { return c ? '<span style="display:inline-block;width:14px;height:14px;border-radius:3px;border:1px solid rgba(255,255,255,.2);background:' + esc(c) + '"></span>' : ''; }
      return '<span class="hstack" style="gap:4px;vertical-align:middle">' + chip(b.brand) + chip(b.bg) + chip(b.accent) + '</span>';
    }
    function eventForm(existing) {
      loadThemes().then(function (themes) { buildEventForm(existing, themes); });
    }
    function buildEventForm(existing, themes) {
      var e = existing || {};
      var isNew = !existing;
      var settings = e.settings || {};
      var curTheme = settings.theme || themes.def || (themes.list[0] && themes.list[0].key) || '';
      var body = h('<div></div>');
      function d(v) { return v ? String(v).slice(0, 10) : ''; }
      var themeField = themes.list.length
        ? '<div class="field"><label>Theme</label><select id="efTheme">' +
            themes.list.map(function (t) { return '<option value="' + esc(t.key) + '"' + (t.key === curTheme ? ' selected' : '') + '>' + esc(t.name) + ' · ' + esc(t.category) + '</option>'; }).join('') +
          '</select><div class="hint" id="efThemeHint" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"></div></div>'
        : '';
      body.innerHTML =
        '<div class="field"><label>Name *</label><input id="efName" placeholder="Bak\'d On The Bay 2027" value="' + esc(e.name || '') + '"></div>' +
        themeField +
        '<div class="field"><label>Tagline</label><input id="efTagline" value="' + esc(e.tagline || '') + '"></div>' +
        '<div class="grid cols-2">' +
          '<div class="field"><label>Venue</label><input id="efVenue" value="' + esc(e.venue || '') + '"></div>' +
          '<div class="field"><label>Location</label><input id="efLocation" placeholder="City, State" value="' + esc(e.location || '') + '"></div>' +
        '</div>' +
        '<div class="grid cols-2">' +
          '<div class="field"><label>Starts</label><input type="date" id="efStart" value="' + d(e.startsAt) + '"></div>' +
          '<div class="field"><label>Ends</label><input type="date" id="efEnd" value="' + d(e.endsAt) + '"></div>' +
        '</div>' +
        '<div class="field"><label>Status</label><select id="efStatus">' +
          ['planning', 'active', 'archived'].map(function (s) { return '<option value="' + s + '"' + (e.status === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') +
        '</select></div>' +
        (isNew ? '<label class="flex" style="gap:8px;align-items:center;cursor:pointer"><input type="checkbox" id="efActive"> <span>Make this the active event immediately</span></label>' : '') +
        (e.isActive ? '<div class="embed-note mt-4">💡 This is the active event. Activate another edition to change which one new submissions attach to.</div>' : '');

      var foot = h('<div></div>');
      // Live theme preview: palette chips + description, and (for a brand-new
      // event with no tagline yet) offer the theme's default tagline.
      var themeById = {};
      themes.list.forEach(function (t) { themeById[t.key] = t; });
      function paintThemeHint() {
        var sel = $('#efTheme', body); if (!sel) return;
        var t = themeById[sel.value]; if (!t) return;
        $('#efThemeHint', body).innerHTML = themeSwatch(t) + '<span>' + esc(t.description || '') + '</span>';
        var tag = $('#efTagline', body);
        if (isNew && t.tagline && (!tag.value.trim() || tag.dataset.themeFill === '1')) {
          tag.value = t.tagline; tag.dataset.themeFill = '1';
        }
      }
      if ($('#efTheme', body)) { $('#efTheme', body).onchange = paintThemeHint; paintThemeHint(); }
      foot.innerHTML = '<button class="btn ghost" data-x>Cancel</button><button class="btn brand" data-save>' + (isNew ? 'Create event' : 'Save changes') + '</button>';
      $('[data-x]', foot).onclick = closeDrawer;
      $('[data-save]', foot).onclick = function () {
        var payload = {
          name: $('#efName', body).value.trim(),
          tagline: $('#efTagline', body).value.trim(),
          venue: $('#efVenue', body).value.trim(),
          location: $('#efLocation', body).value.trim(),
          startsAt: $('#efStart', body).value || '',
          endsAt: $('#efEnd', body).value || '',
          status: $('#efStatus', body).value,
        };
        var themeSel = $('#efTheme', body);
        if (themeSel) payload.theme = themeSel.value;
        if (!payload.name) { toast('An event needs a name.', { type: 'err' }); return; }
        var save = $('[data-save]', foot); save.disabled = true;
        var req = isNew
          ? api(API.events, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign(payload, { makeActive: $('#efActive', body).checked })) })
          : api(API.events, put(Object.assign({ id: e.id }, payload)));
        req.then(function () { closeDrawer(); toast(isNew ? 'Event created' : 'Event saved', { type: 'ok' }); load(); })
          .catch(function (err) { save.disabled = false; toast(err.message, { type: 'err' }); });
      };
      openDrawer(isNew ? 'New event' : (e.name || 'Edit event'), body, foot);
    }

    $('#evNew', host).onclick = function () { eventForm(null); };
    $('#evRefresh', host).onclick = load;
    load();
  }

  // ── Embedded editors ───────────────────────────────────────────────────────
  function embed(src, title, note) {
    return function (host) {
      host.parentElement.classList.add('wide');
      host.innerHTML = pageHead(title, '', '<a class="btn ghost sm" href="' + src + '" target="_blank">Open full screen ↗</a>') +
        (note ? '<div class="embed-note">💡 ' + esc(note) + '</div>' : '') +
        '<iframe class="embed-frame" src="' + esc(src) + '" title="' + esc(title) + '"></iframe>';
    };
  }

  // ── Boot ────────────────────────────────────────────────────────────────────
  applyTheme(localStorage.getItem('admin_theme') || 'dark');
  buildShell();
  if (localStorage.getItem('admin_collapsed') === '1' && !window.matchMedia('(max-width:900px)').matches) app.classList.add('collapsed');
  window.addEventListener('hashchange', function () { content.parentElement.classList.remove('wide'); route(); });
  route();

  // Keep the pending-applications badge fresh on load.
  api(API.apps + '?status=pending').then(function (d) { badgeCounts.appsPending = (d.counts && d.counts.pending) || 0; refreshBadges(); }).catch(function () {});
})();
