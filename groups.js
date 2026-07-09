/* Groups: create/join chat groups and message in them. Two panes — a list of
   the member's groups (with a discover toggle for public groups) and an open
   conversation that polls for new messages while it is on screen. */
(function () {
  var S = window.BaySocial;
  var idAvatar = document.getElementById('idAvatar');
  var idText = document.getElementById('idText');
  var idChangeBtn = document.getElementById('idChangeBtn');
  var listEl = document.getElementById('groupList');
  var chatEl = document.getElementById('groupChat');
  S.renderNav('groups');

  var mode = 'mine';        // 'mine' | 'discover'
  var openGroupId = null;
  var pollTimer = null;

  function me() { return S.getIdentity(); }

  // Upload a chosen photo/video to the member's media library, resolving to the
  // stored { url, kind }. Images are resized first so large photos upload cleanly.
  function uploadMedia(file) {
    var prep = S.prepareImageForUpload
      ? S.prepareImageForUpload(file)
      : new Promise(function (resolve) {
          var r = new FileReader();
          r.onload = function () { resolve({ dataBase64: String(r.result).split(',')[1] || '', contentType: file.type, filename: file.name }); };
          r.readAsDataURL(file);
        });
    return prep.then(function (prepared) {
      return fetch(S.MEDIA_ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: prepared.filename, contentType: prepared.contentType, dataBase64: prepared.dataBase64 })
      }).then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Upload failed'); return d; }); });
    });
  }

  function renderIdentity() {
    var id = me();
    if (id) {
      if (id.headshotUrl) idAvatar.outerHTML = '<img class="so-avatar" id="idAvatar" src="' + S.escHtml(id.headshotUrl) + '" alt="">';
      else idAvatar.outerHTML = '<div class="so-avatar placeholder" id="idAvatar">' + S.escHtml(S.initials(id.displayName)) + '</div>';
      idAvatar = document.getElementById('idAvatar');
      idText.innerHTML = '<strong>' + S.escHtml(id.displayName || '(no name)') + '</strong><span>Chatting as ' + S.escHtml(id.role || 'member') + '</span>';
      idChangeBtn.textContent = 'Switch';
    } else {
      idText.innerHTML = '<strong>Choose your profile</strong><span>to chat in groups</span>';
      idChangeBtn.textContent = 'Choose profile';
    }
  }

  function loadList() {
    var id = me();
    if (!id) { listEl.innerHTML = '<p class="so-muted">Choose a profile to see your groups.</p>'; return; }
    var url = mode === 'discover'
      ? S.GROUPS_ENDPOINT + '?type=discover&me=' + encodeURIComponent(id.id)
      : S.GROUPS_ENDPOINT + '?type=mine&me=' + encodeURIComponent(id.id);
    fetch(url).then(function (r) { return r.json(); }).then(function (data) {
      var items = (data && data.items) || [];
      if (!items.length) {
        listEl.innerHTML = mode === 'discover'
          ? '<p class="so-muted">No public groups to join yet.</p>'
          : '<p class="so-muted">You’re not in any groups yet. Create one or discover public groups.</p>';
        return;
      }
      listEl.innerHTML = items.map(function (g) {
        var sub = mode === 'discover'
          ? (g.memberCount + ' member' + (g.memberCount === 1 ? '' : 's') + (g.isPrivate ? ' · private' : ''))
          : (g.lastMessage || (g.memberCount + ' member' + (g.memberCount === 1 ? '' : 's')));
        var action = mode === 'discover' ? '<button class="so-btn" data-join="' + S.escHtml(g.id) + '">Join</button>' : '';
        return '<div class="group-item' + (g.id === openGroupId ? ' active' : '') + '" data-id="' + S.escHtml(g.id) + '">' +
          '<div class="so-avatar placeholder">' + S.escHtml(S.initials(g.name)) + '</div>' +
          '<div class="gi-meta"><strong>' + S.escHtml(g.name) + '</strong><span>' + S.escHtml(sub) + '</span></div>' + action +
          '</div>';
      }).join('');
    }).catch(function () { listEl.innerHTML = '<p class="so-muted">Could not load groups.</p>'; });
  }

  listEl.addEventListener('click', function (e) {
    var join = e.target.closest('[data-join]');
    if (join) {
      var id = me(); if (!id) return;
      join.disabled = true;
      fetch(S.GROUPS_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'join', groupId: join.getAttribute('data-join'), profileId: id.id }) })
        .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Failed'); }); })
        .then(function () { mode = 'mine'; loadList(); openGroup(join.getAttribute('data-join')); })
        .catch(function () { join.disabled = false; });
      return;
    }
    var item = e.target.closest('.group-item');
    if (item) openGroup(item.getAttribute('data-id'));
  });

  function openGroup(groupId) {
    openGroupId = groupId;
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    Array.prototype.forEach.call(listEl.querySelectorAll('.group-item'), function (el) { el.classList.toggle('active', el.getAttribute('data-id') === groupId); });
    renderChat(true);
    pollTimer = setInterval(function () { renderChat(false); }, 4000);
  }

  // Shell state: rebuild the chat frame (header + composer) only when the group
  // or the member's join state changes; otherwise polling refreshes just the
  // message list, so a half-typed message and its focus are preserved.
  var currentShellKey = null;
  var latest = { group: null, members: [] };
  var groupMedia = null;   // { file, kind, preview } chosen but not yet sent

  function buildGroupShell(g, isMember) {
    var form = isMember
      ? '<form class="gc-form" id="gcForm">' +
          '<input type="file" id="gcFile" accept="image/*,video/*" hidden>' +
          '<button class="dm-attach" id="gcAttach" type="button" title="Add photo or video" aria-label="Add photo or video">📎</button>' +
          '<input type="text" id="gcInput" placeholder="Message…" maxlength="4000" autocomplete="off">' +
          '<button class="so-btn" type="submit">Send</button></form>' +
        '<div class="dm-preview" id="gcPreview" hidden></div>'
      : '<div class="gc-form"><button class="so-btn" id="gcJoin" type="button" style="width:100%">Join to chat</button></div>';

    chatEl.innerHTML =
      '<div class="gc-head"><div class="so-avatar placeholder">' + S.escHtml(S.initials(g.name)) + '</div>' +
      '<h3>' + S.escHtml(g.name) + '</h3>' +
      '<button class="so-action" id="gcInfo" title="Members">' + g.memberCount + ' 👥</button>' +
      '<button class="so-action danger" id="gcLeave">Leave</button></div>' +
      '<div class="gc-msgs"></div>' + form;

    var fileInput = chatEl.querySelector('#gcFile');
    var attachBtn = chatEl.querySelector('#gcAttach');
    var previewEl = chatEl.querySelector('#gcPreview');
    groupMedia = null;

    function renderPreview() {
      if (!previewEl) return;
      if (!groupMedia) { previewEl.hidden = true; previewEl.innerHTML = ''; return; }
      previewEl.hidden = false;
      var inner = groupMedia.kind === 'video'
        ? '<video src="' + S.escHtml(groupMedia.preview) + '" muted playsinline></video>'
        : '<img src="' + S.escHtml(groupMedia.preview) + '" alt="">';
      previewEl.innerHTML = inner + '<button type="button" class="dm-preview-x" title="Remove">×</button>';
      previewEl.querySelector('.dm-preview-x').addEventListener('click', function () {
        groupMedia = null; if (fileInput) fileInput.value = ''; renderPreview();
      });
    }
    if (attachBtn) attachBtn.addEventListener('click', function () { fileInput.click(); });
    if (fileInput) fileInput.addEventListener('change', function () {
      var f = fileInput.files[0]; if (!f) return;
      var kind = f.type.indexOf('video') === 0 ? 'video' : 'image';
      var reader = new FileReader();
      reader.onload = function () { groupMedia = { file: f, kind: kind, preview: reader.result }; renderPreview(); };
      reader.readAsDataURL(f);
    });

    var f = chatEl.querySelector('#gcForm');
    if (f) f.addEventListener('submit', function (e) {
      e.preventDefault();
      var input = chatEl.querySelector('#gcInput');
      var submitBtn = f.querySelector('button[type=submit]');
      var text = input.value.trim(); if (!text && !groupMedia) return;
      var who = me(); if (!who) return;
      input.disabled = true;
      if (submitBtn) submitBtn.disabled = true;
      if (attachBtn) attachBtn.disabled = true;
      var ready = groupMedia
        ? (submitBtn && (submitBtn.textContent = 'Sending…'), uploadMedia(groupMedia.file).then(function (d) { return d.url; }))
        : Promise.resolve('');
      ready.then(function (mediaUrl) {
        return fetch(S.GROUPS_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'message', groupId: openGroupId, body: text, mediaUrl: mediaUrl }) })
          .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Failed'); }); });
      }).then(function () {
        input.value = ''; input.disabled = false;
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Send'; }
        if (attachBtn) attachBtn.disabled = false;
        groupMedia = null; if (fileInput) fileInput.value = ''; renderPreview();
        input.focus(); renderChat(false);
      }).catch(function () {
        input.disabled = false;
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Send'; }
        if (attachBtn) attachBtn.disabled = false;
      });
    });

    var join = chatEl.querySelector('#gcJoin');
    if (join) join.addEventListener('click', function () {
      var who = me(); if (!who) { S.openProfilePicker(function () { renderIdentity(); }); return; }
      fetch(S.GROUPS_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'join', groupId: openGroupId }) })
        .then(function () { loadList(); renderChat(true); });
    });

    var leave = chatEl.querySelector('#gcLeave');
    if (leave) leave.addEventListener('click', function () {
      var who = me(); if (!who) return;
      // Leaving as the owner deletes the whole group (and every message) for all
      // members — warn distinctly so it isn't confused with an ordinary leave.
      var isOwner = g && String(g.ownerId) === String(who.id);
      var prompt = isOwner
        ? 'You own this group. Leaving deletes it and all its messages for everyone — this can’t be undone. Delete the group?'
        : 'Leave this group?';
      if (!window.confirm(prompt)) return;
      fetch(S.GROUPS_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'leave', groupId: openGroupId }) })
        .then(function () { openGroupId = null; currentShellKey = null; if (pollTimer) clearInterval(pollTimer); chatEl.innerHTML = '<div class="gc-empty">You left the group.</div>'; loadList(); });
    });

    var info = chatEl.querySelector('#gcInfo');
    if (info) info.addEventListener('click', function () {
      var names = latest.members.map(function (m) { return m.displayName + (m.role === 'owner' ? ' (owner)' : ''); }).join('\n');
      window.alert('Members:\n' + names);
    });
  }

  function renderGroupMessages(messages) {
    var box = chatEl.querySelector('.gc-msgs');
    if (!box) return;
    var atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 40;
    box.innerHTML = messages.map(function (m) {
      var media = '';
      if (m.mediaUrl) {
        media = /\.(mp4|webm|ogg|ogv|mov|m4v)(\?|#|$)/i.test(m.mediaUrl)
          ? '<video class="gc-media" src="' + S.escHtml(m.mediaUrl) + '" controls playsinline preload="metadata"></video>'
          : '<a href="' + S.escHtml(m.mediaUrl) + '" target="_blank" rel="noopener"><img class="gc-media" src="' + S.escHtml(m.mediaUrl) + '" alt="" loading="lazy"></a>';
      }
      return '<div class="gc-msg' + (m.mine ? ' mine' : '') + '">' +
        (m.mine ? '' : '<div class="gc-who">' + S.escHtml(m.sender.displayName) + '</div>') +
        '<div class="gc-bubble">' + S.escHtml(m.body) + media + '</div></div>';
    }).join('') || '<div class="gc-empty">No messages yet — say hello!</div>';
    if (atBottom) box.scrollTop = box.scrollHeight;
  }

  function renderChat(showLoading) {
    var id = me();
    if (showLoading) { chatEl.innerHTML = '<div class="gc-empty">Loading…</div>'; currentShellKey = null; }
    var url = S.GROUPS_ENDPOINT + '?type=group&id=' + encodeURIComponent(openGroupId) + (id ? '&me=' + encodeURIComponent(id.id) : '');
    fetch(url).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); }).then(function (res) {
      if (!res.ok) { chatEl.innerHTML = '<div class="gc-empty">' + S.escHtml(res.d.error || 'Could not open group.') + '</div>'; currentShellKey = null; return; }
      var data = res.d;
      latest.group = data.group;
      latest.members = data.members || [];
      // Rebuild the shell only when the group or membership changes (or it's gone).
      var shellKey = openGroupId + ':' + (data.isMember ? '1' : '0');
      if (currentShellKey !== shellKey || !chatEl.querySelector('.gc-msgs')) {
        buildGroupShell(data.group, data.isMember);
        currentShellKey = shellKey;
      }
      renderGroupMessages(data.messages);
    }).catch(function () { if (showLoading) chatEl.innerHTML = '<div class="gc-empty">Could not open group.</div>'; });
  }

  // ── New group modal ──
  document.getElementById('newGroupBtn').addEventListener('click', function () {
    var id = me(); if (!id) { S.openProfilePicker(function () { renderIdentity(); loadList(); }); return; }
    var overlay = document.createElement('div');
    overlay.className = 'so-modal-overlay';
    overlay.innerHTML =
      '<div class="so-modal" role="dialog" aria-modal="true">' +
        '<button class="so-modal-close">&times;</button>' +
        '<h3>New group</h3>' +
        '<input class="so-modal-search" id="ngName" placeholder="Group name" maxlength="120" style="margin-top:12px">' +
        '<textarea class="studio-caption" id="ngDesc" placeholder="What’s it about? (optional)" maxlength="600"></textarea>' +
        '<label style="display:flex;align-items:center;gap:8px;color:#fff;margin:12px 0"><input type="checkbox" id="ngPrivate"> Private (invite-only)</label>' +
        '<div class="so-error" id="ngError" hidden></div>' +
        '<button class="so-btn" id="ngCreate" style="width:100%">Create group</button>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('.so-modal-close').addEventListener('click', function () { overlay.remove(); });
    overlay.querySelector('#ngCreate').addEventListener('click', function () {
      var name = overlay.querySelector('#ngName').value.trim();
      var err = overlay.querySelector('#ngError');
      if (!name) { err.textContent = 'Give your group a name.'; err.hidden = false; return; }
      var btn = overlay.querySelector('#ngCreate'); btn.disabled = true; btn.textContent = 'Creating…';
      fetch(S.GROUPS_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        kind: 'create', ownerId: id.id, name: name,
        description: overlay.querySelector('#ngDesc').value.trim(),
        isPrivate: overlay.querySelector('#ngPrivate').checked
      }) }).then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Failed'); return d; }); })
        .then(function (d) { overlay.remove(); mode = 'mine'; loadList(); openGroup(d.id); })
        .catch(function (e2) { err.textContent = e2.message; err.hidden = false; btn.disabled = false; btn.textContent = 'Create group'; });
    });
  });

  document.getElementById('discoverBtn').addEventListener('click', function () {
    mode = mode === 'discover' ? 'mine' : 'discover';
    this.textContent = mode === 'discover' ? 'Back to my groups' : 'Discover public groups';
    loadList();
  });

  idChangeBtn.addEventListener('click', function () { S.openProfilePicker(function () { renderIdentity(); loadList(); }); });
  document.addEventListener('bay-identity-change', function () { renderIdentity(); loadList(); });
  renderIdentity();
  loadList();
})();
