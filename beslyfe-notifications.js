/* Beslyfe — notifications.
   A Facebook/Instagram-style activity inbox. Adds a bell (with an unread badge)
   to the shared social sub-nav that opens a dropdown of recent notifications, and
   can also render a full inline panel into a member's hub. A settings view lets a
   member opt out of notifications entirely or by category.

   Exposes window.BeslyfeNotify:
     • initBell()            — mount the sub-nav bell (auto-runs on load)
     • mountPanel(el)        — render a full inline panel into `el` (used by the hub)
     • refresh()             — re-fetch the unread count now
*/
(function () {
  var S = window.BeslyfeSocial;
  if (!S) return;
  var ENDPOINT = S.NOTIFICATIONS_ENDPOINT || '/.netlify/functions/notifications';

  var CATEGORIES = [
    { key: 'message', label: 'Direct messages' },
    { key: 'group', label: 'Group messages' },
    { key: 'post', label: 'New posts from people you follow' },
    { key: 'like', label: 'Likes on your posts' },
    { key: 'comment', label: 'Comments on your posts' },
    { key: 'follow', label: 'New followers' }
  ];

  // Each notification type carries a crisp inline SVG (no emoji) and an accent
  // hue, rendered as a small badge tucked onto the actor's avatar. Keeping the
  // icons as vectors is what lifts the panel out of the "sloppy" look.
  var SVG = {
    message: '<path d="M4 5.5h16v13H4z"/><path d="m4.6 6.4 7.4 5.6 7.4-5.6"/>',
    group: '<path d="M4 4.5h12v9H8l-4 3.5z"/><path d="M9.5 13.5v2A1.5 1.5 0 0 0 11 17h5l4 3.5V11a1.5 1.5 0 0 0-1.5-1.5H18"/>',
    post: '<path d="M4 4.5h16v15H4z"/><path d="M7.5 8.5h9M7.5 12h9M7.5 15.5h5.5"/>',
    like: '<path d="M12 20S3.5 14.6 3.5 8.9A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8.5 1.9C20.5 14.6 12 20 12 20Z"/>',
    comment: '<path d="M20 12.5a7.5 7.5 0 0 1-10.8 6.7L4 20.5l1.4-4.7A7.5 7.5 0 1 1 20 12.5Z"/>',
    follow: '<path d="M9 11a3.75 3.75 0 1 0 0-7.5A3.75 3.75 0 0 0 9 11Z"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M18.5 8v6M21.5 11h-6"/>'
  };
  var ACCENT = { message: '#57a7e6', group: '#8a8fe6', post: '#9FE22D', like: '#ff6f87', comment: '#38c7ad', follow: '#9FE22D' };

  function icon(type) {
    var p = SVG[type] || '<circle cx="12" cy="12" r="8"/>';
    return '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
  }

  var signedIn = true;   // flips false on a 401 so the bell hides itself

  function esc(s) { return S.escHtml(s); }

  function api(path, opts) {
    return fetch(ENDPOINT + (path || ''), opts).then(function (r) {
      if (r.status === 401) { signedIn = false; var e = new Error('unauthorized'); e.status = 401; throw e; }
      return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Request failed'); return d; });
    });
  }

  // The action phrase for a notification — the actor's name is rendered
  // separately (in bold) so the sentence reads "<Name> liked your post".
  function action(n) {
    switch (n.type) {
      case 'message': return 'sent you a message';
      case 'group': return esc(n.body || 'posted in a group');
      case 'post': return 'shared a new post';
      case 'like': return 'liked your post';
      case 'comment': return 'commented on your post';
      case 'follow': return 'started following you';
      default: return 'sent you an update';
    }
  }

  // Secondary line (the message/comment preview), shown when it adds information.
  function detail(n) {
    if (!n.body) return '';
    if (n.type === 'group' || n.type === 'like' || n.type === 'follow') return '';
    return '<span class="bn-detail">' + esc(n.body) + '</span>';
  }

  function itemHtml(n) {
    var who = (n.actor && n.actor.displayName) || 'Someone';
    var av = S.avatar(n.actor || {}, 'so-avatar sm');
    var accent = ACCENT[n.type] || '#9FE22D';
    return '<a class="bn-item' + (n.read ? '' : ' unread') + '" href="' + esc(n.link || '#') + '" data-id="' + esc(n.id) + '">' +
      '<span class="bn-av">' + av +
        '<span class="bn-ic" style="--ic:' + accent + '">' + icon(n.type) + '</span>' +
      '</span>' +
      '<span class="bn-text">' +
        '<span class="bn-label"><strong>' + esc(who) + '</strong> ' + action(n) + '</span>' +
        detail(n) +
        '<time>' + esc(S.timeAgo(n.createdAt)) + '</time>' +
      '</span>' +
      (n.read ? '' : '<span class="bn-dot" aria-hidden="true"></span>') +
      '</a>';
  }

  // A composed empty state (icon + copy), not a bare line of muted text.
  function emptyHtml(msg) {
    return '<div class="bn-empty">' +
      '<span class="bn-empty-ic"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" ' +
        'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M18 8.5a6 6 0 1 0-12 0c0 6.5-2.5 8-2.5 8h17S18 15 18 8.5Z"/><path d="M10.2 20.5a2.1 2.1 0 0 0 3.6 0"/>' +
      '</svg></span>' +
      '<p>' + esc(msg) + '</p></div>';
  }

  // Shared list renderer. `root` gets the items; `onChange` is called after a
  // mutation (read/readAll) so the badge can refresh.
  function renderList(root, items, onChange) {
    if (!items.length) {
      root.innerHTML = emptyHtml('You’re all caught up. New messages, follows and reactions to your posts will land here.');
      return;
    }
    root.innerHTML = items.map(itemHtml).join('');
    // Delegate clicks once per container so reopening the panel can't stack
    // duplicate handlers (which would fire the "mark read" call several times).
    if (!root.__bnWired) {
      root.__bnWired = true;
      root.addEventListener('click', function (e) {
        var a = e.target.closest('.bn-item');
        if (!a) return;
        var id = a.getAttribute('data-id');
        // Mark read in the background; let the navigation proceed normally.
        api('', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'read', id: id }) })
          .then(function () { if (root.__bnOnChange) root.__bnOnChange(); }).catch(function () {});
      });
    }
    root.__bnOnChange = onChange;
  }

  function markAll(onChange) {
    return api('', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'readAll' }) })
      .then(function () { if (onChange) onChange(); }).catch(function () {});
  }

  // ── Preferences (opt-out) form ──
  function prefsFormHtml(state) {
    var rows = CATEGORIES.map(function (c) {
      var on = !state.prefs || state.prefs[c.key] !== false;
      return '<label class="bn-pref"><input type="checkbox" data-pref="' + c.key + '"' + (on ? ' checked' : '') + (state.muted ? ' disabled' : '') + '> ' + esc(c.label) + '</label>';
    }).join('');
    return '<div class="bn-prefs">' +
      '<label class="bn-pref bn-pref-master"><input type="checkbox" data-pref="__mute"' + (state.muted ? ' checked' : '') + '> <strong>Mute all notifications</strong></label>' +
      '<p class="bn-prefs-hint">Choose what you want to be notified about:</p>' +
      rows +
      '<button class="so-btn bn-save" type="button">Save preferences</button>' +
      '<span class="bn-saved" hidden>Saved ✓</span>' +
      '</div>';
  }

  function wirePrefs(container, onSaved) {
    var master = container.querySelector('[data-pref="__mute"]');
    if (master) master.addEventListener('change', function () {
      Array.prototype.forEach.call(container.querySelectorAll('input[data-pref]:not([data-pref="__mute"])'), function (cb) {
        cb.disabled = master.checked;
      });
    });
    var save = container.querySelector('.bn-save');
    if (save) save.addEventListener('click', function () {
      var muted = master && master.checked;
      var prefs = {};
      Array.prototype.forEach.call(container.querySelectorAll('input[data-pref]:not([data-pref="__mute"])'), function (cb) {
        prefs[cb.getAttribute('data-pref')] = cb.checked;
      });
      save.disabled = true; save.textContent = 'Saving…';
      api('', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'prefs', muted: muted, prefs: prefs }) })
        .then(function () {
          save.disabled = false; save.textContent = 'Save preferences';
          var ok = container.querySelector('.bn-saved');
          if (ok) { ok.hidden = false; setTimeout(function () { ok.hidden = true; }, 2000); }
          if (onSaved) onSaved();
        })
        .catch(function () { save.disabled = false; save.textContent = 'Save preferences'; });
    });
  }

  function loadPrefs() {
    return api('?type=prefs').catch(function () { return { muted: false, prefs: {} }; });
  }

  // ── Sub-nav bell + dropdown ──
  function initBell() {
    var holder = document.querySelector('.so-subnav-inner');
    if (!holder || holder.querySelector('.bn-bell')) return;

    var wrap = document.createElement('div');
    wrap.className = 'bn-wrap';
    var bellSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" ' +
      'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M18 8.5a6 6 0 1 0-12 0c0 6.5-2.5 8-2.5 8h17S18 15 18 8.5Z"/><path d="M10.2 20.5a2.1 2.1 0 0 0 3.6 0"/></svg>';
    wrap.innerHTML =
      '<button class="bn-bell" type="button" aria-label="Notifications" aria-expanded="false">' + bellSvg +
        '<span class="bn-badge" hidden>0</span></button>' +
      '<div class="bn-panel" hidden>' +
        '<div class="bn-panel-head"><strong>Notifications</strong>' +
          '<div class="bn-panel-actions">' +
            '<button class="bn-mark" type="button">Mark all read</button>' +
            '<button class="bn-gear" type="button" aria-label="Notification settings" title="Settings">' +
              '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/></svg>' +
            '</button>' +
          '</div>' +
        '</div>' +
        '<div class="bn-list"><div class="bn-skeleton"><span></span><span></span><span></span></div></div>' +
        '<div class="bn-settings" hidden></div>' +
      '</div>';
    // Place the bell just before the "Buy Package" CTA if present, else at the end.
    var cta = holder.querySelector('.so-subnav-cta');
    if (cta) holder.insertBefore(wrap, cta); else holder.appendChild(wrap);

    var bell = wrap.querySelector('.bn-bell');
    var badge = wrap.querySelector('.bn-badge');
    var panel = wrap.querySelector('.bn-panel');
    var listEl = wrap.querySelector('.bn-list');
    var settingsEl = wrap.querySelector('.bn-settings');
    var markBtn = wrap.querySelector('.bn-mark');
    var gearBtn = wrap.querySelector('.bn-gear');

    function setBadge(n) {
      if (!signedIn) { wrap.hidden = true; return; }
      if (n > 0) { badge.hidden = false; badge.textContent = n > 99 ? '99+' : String(n); }
      else badge.hidden = true;
    }

    function refreshCount() {
      api('?type=count').then(function (d) { setBadge(d.unread || 0); })
        .catch(function (e) { if (e.status === 401) wrap.hidden = true; });
    }

    function loadList() {
      settingsEl.hidden = true;
      listEl.hidden = false;
      listEl.innerHTML = '<div class="bn-skeleton"><span></span><span></span><span></span></div>';
      api('?type=list').then(function (d) {
        renderList(listEl, d.items || [], refreshCount);
      }).catch(function () { listEl.innerHTML = emptyHtml('Could not load notifications. Please try again in a moment.'); });
    }

    function openPanel() {
      panel.hidden = false;
      bell.setAttribute('aria-expanded', 'true');
      loadList();
    }
    function closePanel() { panel.hidden = true; bell.setAttribute('aria-expanded', 'false'); }

    bell.addEventListener('click', function (e) {
      e.stopPropagation();
      if (panel.hidden) openPanel(); else closePanel();
    });
    panel.addEventListener('click', function (e) { e.stopPropagation(); });
    document.addEventListener('click', function () { if (!panel.hidden) closePanel(); });

    markBtn.addEventListener('click', function () { markAll(function () { refreshCount(); loadList(); }); });

    gearBtn.addEventListener('click', function () {
      if (!settingsEl.hidden) { settingsEl.hidden = true; listEl.hidden = false; return; }
      listEl.hidden = true;
      settingsEl.hidden = false;
      settingsEl.innerHTML = '<div class="bn-skeleton"><span></span><span></span><span></span></div>';
      loadPrefs().then(function (state) {
        settingsEl.innerHTML = prefsFormHtml(state);
        wirePrefs(settingsEl, refreshCount);
      });
    });

    // Initial + periodic count refresh, plus a refresh when the tab regains focus.
    refreshCount();
    setInterval(function () { if (!document.hidden) refreshCount(); }, 30000);
    window.addEventListener('focus', refreshCount);
    window.__bayNotifyRefresh = refreshCount;
  }

  // ── Full inline panel (hub) ──
  function mountPanel(el) {
    if (!el) return;
    el.innerHTML =
      '<div class="bn-hub">' +
        '<div class="bn-hub-head"><h3><span class="bn-hub-ic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8.5a6 6 0 1 0-12 0c0 6.5-2.5 8-2.5 8h17S18 15 18 8.5Z"/><path d="M10.2 20.5a2.1 2.1 0 0 0 3.6 0"/></svg></span> Notifications</h3>' +
          '<div class="bn-panel-actions">' +
            '<button class="bn-mark so-btn ghost" type="button">Mark all read</button>' +
            '<button class="bn-settings-toggle so-btn ghost" type="button">Settings</button>' +
          '</div>' +
        '</div>' +
        '<div class="bn-list"><div class="bn-skeleton"><span></span><span></span><span></span></div></div>' +
        '<div class="bn-settings" hidden></div>' +
      '</div>';
    var listEl = el.querySelector('.bn-list');
    var settingsEl = el.querySelector('.bn-settings');
    var markBtn = el.querySelector('.bn-mark');
    var toggle = el.querySelector('.bn-settings-toggle');

    function refreshBadge() { if (window.__bayNotifyRefresh) window.__bayNotifyRefresh(); }

    function loadList() {
      settingsEl.hidden = true; listEl.hidden = false;
      listEl.innerHTML = '<div class="bn-skeleton"><span></span><span></span><span></span></div>';
      api('?type=list').then(function (d) {
        renderList(listEl, d.items || [], function () { refreshBadge(); });
      }).catch(function (e) {
        listEl.innerHTML = e.status === 401
          ? emptyHtml('Sign in to see your notifications.')
          : emptyHtml('Could not load notifications. Please try again in a moment.');
      });
    }

    markBtn.addEventListener('click', function () { markAll(function () { refreshBadge(); loadList(); }); });
    toggle.addEventListener('click', function () {
      if (!settingsEl.hidden) { settingsEl.hidden = true; listEl.hidden = false; toggle.textContent = 'Settings'; return; }
      listEl.hidden = true; settingsEl.hidden = false; toggle.textContent = 'Back to notifications';
      settingsEl.innerHTML = '<div class="bn-skeleton"><span></span><span></span><span></span></div>';
      loadPrefs().then(function (state) { settingsEl.innerHTML = prefsFormHtml(state); wirePrefs(settingsEl, refreshBadge); });
    });

    loadList();
  }

  // Auto-init the bell once the sub-nav exists. The sub-nav is injected by each
  // page's script (S.renderNav), which may run just after this file loads, so
  // watch #soNav for it rather than assuming it is already there.
  function autoInit(attempt) {
    attempt = attempt || 0;
    if (document.querySelector('.so-subnav-inner')) { initBell(); return; }
    var holder = document.getElementById('soNav');
    if (holder && typeof MutationObserver !== 'undefined') {
      var obs = new MutationObserver(function () {
        if (document.querySelector('.so-subnav-inner')) { obs.disconnect(); initBell(); }
      });
      obs.observe(holder, { childList: true, subtree: true });
      return;
    }
    // No sub-nav holder on this page (e.g. the messages page has its own header):
    // retry a few times in case scripts are still running, then give up quietly.
    if (attempt < 10) setTimeout(function () { autoInit(attempt + 1); }, 300);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { autoInit(0); });
  else autoInit(0);

  window.BeslyfeNotify = { initBell: initBell, mountPanel: mountPanel, refresh: function () { if (window.__bayNotifyRefresh) window.__bayNotifyRefresh(); } };
})();
