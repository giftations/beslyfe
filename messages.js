/* Direct-messages page. Identity is the signed-in account's linked community
   profile, confirmed against the server session (the httpOnly cookie) on load so
   it always matches the identity the messages function acts as. Left pane lists
   conversations; right pane shows the open thread. A ?to=PROFILE_ID query (used
   by the "Message" button on profiles) opens that conversation straight away. */
(function () {
  var S = window.BeslyfeSocial;
  var ENDPOINT = '/.netlify/functions/messages';
  var PROFILES_ENDPOINT = '/.netlify/functions/profiles';

  var signedOut = document.getElementById('signedOut');
  var shell = document.getElementById('shell');
  var threadsEl = document.getElementById('threads');
  var convEl = document.getElementById('conversation');

  var me = null;               // the acting community profile (from the account session)
  var openWith = null;
  var pollTimer = null;
  var currentPartner = null;   // partner whose compose shell is currently mounted
  var pendingMedia = null;     // { file, kind, preview } chosen but not yet sent

  function showSignedOut(html) {
    signedOut.hidden = false;
    shell.hidden = true;
    if (html) signedOut.innerHTML = html;
  }

  // Upload a chosen photo/video through the shared MIME-aware path.
  function uploadMedia(file) {
    if (!S.uploadMediaFile) return Promise.reject(new Error('Upload tools could not start.'));
    return S.uploadMediaFile(file);
  }

  function fetchJson(url, opts) {
    return fetch(url, opts).then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok) {
          var err = new Error(d.error || 'Request failed');
          err.status = r.status;
          throw err;
        }
        return d;
      });
    });
  }

  // If the server rejects a call because the session is gone/expired, drop back
  // to a clear "please sign in" state instead of a misleading generic error.
  function handledAuthError(e) {
    if (e && e.status === 401) {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      if (S.releaseMediaPreview) S.releaseMediaPreview(pendingMedia);
      pendingMedia = null;
      showSignedOut('<p>Your session has expired. Please sign in again to use messages.</p>' +
        '<a class="so-btn" href="/admin-login.html">Sign in</a>');
      return true;
    }
    return false;
  }

  function loadThreads() {
    return fetchJson(ENDPOINT + '?type=threads&me=' + encodeURIComponent(me.id))
      .then(function (data) {
        var items = data.items || [];
        if (!items.length) {
          threadsEl.innerHTML = '<p class="dm-empty">No conversations yet. Find someone in the <a href="/directory">directory</a> and say hi.</p>';
          return;
        }
        threadsEl.innerHTML = items.map(function (t) {
          var p = t.partner;
          var preview = (t.lastFromMe ? 'You: ' : '') + (t.lastMessage || '');
          return '<button class="dm-thread' + (openWith === p.id ? ' active' : '') + '" data-id="' + S.escHtml(p.id) + '">' +
            S.avatar(p, 'so-avatar sm') +
            '<span class="meta"><strong>' + S.escHtml(p.displayName) + '</strong>' +
            '<span>' + S.escHtml(preview) + '</span></span>' +
            (t.unread ? '<span class="dm-badge">' + t.unread + '</span>' : '') +
            '</button>';
        }).join('');
      })
      .catch(function (e) {
        if (handledAuthError(e)) return;
        threadsEl.innerHTML = '<p class="dm-empty">Could not load conversations.</p>';
      });
  }

  threadsEl.addEventListener('click', function (e) {
    var btn = e.target.closest('.dm-thread');
    if (btn) openThread(btn.getAttribute('data-id'));
  });

  // Build the conversation shell (header + empty message list + composer) once
  // per open thread. The composer and its submit handler are created here and
  // NOT rebuilt on each poll, so a half-typed message and its focus survive
  // incoming-message refreshes.
  function buildShell(partner) {
    currentPartner = partner;
    if (S.releaseMediaPreview) S.releaseMediaPreview(pendingMedia);
    pendingMedia = null;
    convEl.innerHTML =
      '<div class="dm-conv-head">' + S.avatar(partner, 'so-avatar sm') +
        '<a href="/profile?id=' + encodeURIComponent(partner.id) + '">' + S.escHtml(partner.displayName) + '</a>' +
        (partner.role ? '<span class="so-role-pill">' + S.escHtml(partner.role) + '</span>' : '') +
      '</div>' +
      '<div class="dm-messages" id="dmMessages"></div>' +
      '<p class="dm-empty" id="dmError" hidden style="padding:8px 16px;text-align:left;color:#ff9b9b"></p>' +
      '<div class="dm-preview" id="dmPreview" hidden></div>' +
      '<form class="dm-compose" id="dmForm">' +
        '<input type="file" id="dmFile" accept="image/*,video/*" hidden>' +
        '<button class="dm-attach" id="dmAttach" type="button" title="Add photo or video" aria-label="Add photo or video">📎</button>' +
        '<input type="text" id="dmInput" placeholder="Write a message…" maxlength="4000" autocomplete="off">' +
        '<button class="so-btn" type="submit">Send</button>' +
      '</form>';

    var fileInput = document.getElementById('dmFile');
    var attachBtn = document.getElementById('dmAttach');
    var previewEl = document.getElementById('dmPreview');
    var sending = false;

    function renderPreview() {
      if (!pendingMedia) { previewEl.hidden = true; previewEl.innerHTML = ''; return; }
      previewEl.hidden = false;
      var inner = pendingMedia.kind === 'video'
        ? '<video src="' + S.escHtml(pendingMedia.preview) + '" muted playsinline aria-label="Selected message video preview"></video>'
        : '<img src="' + S.escHtml(pendingMedia.preview) + '" alt="Selected message attachment preview">';
      previewEl.innerHTML = inner + '<button type="button" class="dm-preview-x" title="Remove">×</button>';
      previewEl.querySelector('.dm-preview-x').addEventListener('click', function () {
        if (sending) return;
        if (S.releaseMediaPreview) S.releaseMediaPreview(pendingMedia);
        pendingMedia = null; fileInput.value = ''; renderPreview();
      });
    }

    attachBtn.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      var f = fileInput.files[0]; if (!f) return;
      if (S.releaseMediaPreview) S.releaseMediaPreview(pendingMedia);
      pendingMedia = null;
      renderPreview();
      var kind = S.mediaKindForFile ? S.mediaKindForFile(f) : '';
      var fileError = document.getElementById('dmError');
      if (!kind) {
        if (fileError) {
          fileError.textContent = 'Choose a photo or video file.';
          fileError.hidden = false;
        }
        fileInput.value = '';
        return;
      }
      if (fileError) fileError.hidden = true;
      var previewPromise = S.createMediaPreview
        ? S.createMediaPreview(f)
        : Promise.reject(new Error('Preview tools could not start.'));
      function isCurrentSelection() {
        return currentPartner === partner
          && document.getElementById('dmFile') === fileInput
          && fileInput.files[0] === f;
      }
      previewPromise.then(function (preview) {
        if (!isCurrentSelection()) {
          if (S.releaseMediaPreview) S.releaseMediaPreview(preview);
          return;
        }
        pendingMedia = {
          file: f,
          kind: kind,
          preview: preview.preview,
          previewObjectUrl: preview.previewObjectUrl
        };
        renderPreview();
      }).catch(function (error) {
        if (!isCurrentSelection()) return;
        pendingMedia = null;
        fileInput.value = '';
        renderPreview();
        if (fileError) {
          fileError.textContent = error.message || 'Could not preview that file.';
          fileError.hidden = false;
        }
      });
    });

    document.getElementById('dmForm').addEventListener('submit', function (e) {
      e.preventDefault();
      if (sending) return;
      var form = e.target;
      var input = document.getElementById('dmInput');
      var errEl = document.getElementById('dmError');
      var submitBtn = form.querySelector('button[type=submit]');
      if (errEl) errEl.hidden = true;
      var text = input.value.trim();
      if (!text && !pendingMedia) return;
      var submittedMedia = pendingMedia;
      var targetPartnerId = partner.id;
      function isCurrentComposer() {
        return currentPartner
          && currentPartner.id === targetPartnerId
          && document.getElementById('dmForm') === form;
      }
      sending = true;
      input.disabled = true;
      if (submitBtn) submitBtn.disabled = true;
      attachBtn.disabled = true;
      var removeBtn = previewEl.querySelector('.dm-preview-x');
      if (removeBtn) removeBtn.disabled = true;

      // Upload the attachment first (if any), then send the message referencing it.
      var ready = submittedMedia
        ? (submitBtn && (submitBtn.textContent = 'Sending…'),
          submittedMedia.url
            ? Promise.resolve({ mediaUrl: submittedMedia.url, mediaKind: submittedMedia.kind })
            : uploadMedia(submittedMedia.file).then(function (d) {
                // Keep the successful library item if message delivery fails, so
                // retrying does not upload a duplicate and consume quota again.
                submittedMedia.file = null;
                submittedMedia.url = d.url;
                submittedMedia.kind = d.kind;
                return { mediaUrl: d.url, mediaKind: d.kind };
              }))
        : Promise.resolve({ mediaUrl: '', mediaKind: '' });

      ready.then(function (media) {
        return fetchJson(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipientId: targetPartnerId, body: text, mediaUrl: media.mediaUrl, mediaKind: media.mediaKind })
        });
      }).then(function () {
        if (!isCurrentComposer()) return;
        sending = false;
        input.value = '';
        input.disabled = false;
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Send'; }
        attachBtn.disabled = false;
        if (pendingMedia === submittedMedia) {
          if (S.releaseMediaPreview) S.releaseMediaPreview(submittedMedia);
          pendingMedia = null;
          fileInput.value = '';
        }
        renderPreview();
        input.focus();
        return refreshOpenThread();
      }).then(function () {
        loadThreads();
      }).catch(function (e) {
        if (handledAuthError(e)) return;
        if (!isCurrentComposer()) return;
        sending = false;
        input.disabled = false;
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Send'; }
        attachBtn.disabled = false;
        if (removeBtn && removeBtn.isConnected) removeBtn.disabled = false;
        // Surface the failure so a message never silently vanishes.
        if (errEl) {
          errEl.textContent = (e && e.message) || 'Your message could not be sent. Please try again.';
          errEl.hidden = false;
        }
      });
    });
  }

  // Update only the message list — never the composer — so polling can't erase
  // in-progress input. Keeps the view pinned to the bottom if it already was.
  function renderMessages(items) {
    var box = document.getElementById('dmMessages');
    if (!box) return;
    var atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    box.innerHTML = items.length
      ? items.map(function (m) {
          var media = '';
          if (m.mediaUrl) {
            media = m.mediaKind === 'video'
              ? '<video class="dm-media" src="' + S.escHtml(m.mediaUrl) + '" controls playsinline preload="metadata"></video>'
              : '<a class="dm-media-link" href="' + S.escHtml(m.mediaUrl) + '" target="_blank" rel="noopener"><img class="dm-media" src="' + S.escHtml(m.mediaUrl) + '" alt="" loading="lazy"></a>';
          }
          var text = m.body ? S.escHtml(m.body) : '';
          return '<div class="dm-msg ' + (m.mine ? 'me' : 'them') + (m.mediaUrl && !m.body ? ' media-only' : '') + '">' + text + media +
            '<time>' + S.timeAgo(m.createdAt) + '</time></div>';
        }).join('')
      : '<div class="dm-empty">No messages yet — say hello!</div>';
    if (atBottom) box.scrollTop = box.scrollHeight;
  }

  function openThread(partnerId) {
    if (S.releaseMediaPreview) S.releaseMediaPreview(pendingMedia);
    pendingMedia = null;
    openWith = partnerId;
    currentPartner = null;   // force a fresh shell for the newly opened thread
    shell.classList.add('has-active');
    convEl.innerHTML = '<div class="dm-empty">Loading…</div>';
    refreshOpenThread().then(function () {
      loadThreads();
      startPolling();
    });
  }

  function refreshOpenThread() {
    if (!openWith) return Promise.resolve();
    var requestedPartnerId = openWith;
    return fetchJson(ENDPOINT + '?type=thread&with=' + encodeURIComponent(requestedPartnerId))
      .then(function (data) {
        if (openWith !== requestedPartnerId) return;
        // (Re)build the composer shell only when the thread changes or the shell
        // was torn down; otherwise just refresh the messages so input is kept.
        if (!currentPartner || currentPartner.id !== data.partner.id || !document.getElementById('dmMessages')) {
          buildShell(data.partner);
        }
        renderMessages(data.items || []);
      })
      .catch(function (e) {
        if (openWith !== requestedPartnerId) return;
        if (handledAuthError(e)) return;
        if (S.releaseMediaPreview) S.releaseMediaPreview(pendingMedia);
        pendingMedia = null;
        convEl.innerHTML = '<div class="dm-empty">Could not load this conversation.</div>';
      });
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    // Light polling so new incoming messages appear without a refresh.
    pollTimer = setInterval(function () {
      if (document.hidden || !openWith) return;
      refreshOpenThread();
    }, 8000);
  }

  // Stop polling when the page is hidden/unloaded so the timer can't leak.
  window.addEventListener('pagehide', function () {
    if (S.releaseMediaPreview) S.releaseMediaPreview(pendingMedia);
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  });

  // Boot: confirm the signed-in account from the server session (the httpOnly
  // cookie), which is the same identity the messages function acts as. The page
  // used to gate on the optional "acting-as" social identity kept in
  // localStorage, so signed-in members whose local identity was absent — and
  // every admin, who has no community profile — were wrongly shown a sign-in
  // prompt and messaging appeared broken. Verifying with the server keeps the
  // client's idea of "me" exactly aligned with the server's.
  function resolveIdentity() {
    return fetchJson('/.netlify/functions/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'session' })
    }).catch(function () {
      // Transient/network failure: fall back to the locally stored identity so a
      // working member isn't locked out by a blip.
      var local = S.getIdentity();
      return local && local.id ? { account: { profileId: local.id }, profile: local } : {};
    });
  }

  resolveIdentity().then(function (data) {
    data = data || {};
    var account = data.account || null;
    var profile = data.profile || null;

    if (!account) {
      // Truly signed out.
      showSignedOut();
      return;
    }
    if (!profile || !profile.id) {
      // Signed in, but this account has no linked community profile (e.g. an
      // admin). Explain why messaging is unavailable rather than showing a
      // misleading "sign in" prompt to someone who is already signed in.
      showSignedOut('<p>Your account isn’t linked to a community profile, so direct messages aren’t available yet. Create a profile to join the conversation.</p>' +
        '<a class="so-btn" href="/profile/new">Create a profile</a>');
      return;
    }

    me = {
      id: profile.id,
      displayName: profile.displayName || '',
      role: profile.role || '',
      headshotUrl: profile.headshotUrl || ''
    };
    // Keep the shared social identity in sync so avatars/names match elsewhere.
    try { S.setIdentity(me); } catch (e) { /* ignore */ }

    signedOut.hidden = true;
    shell.hidden = false;

    loadThreads().then(function () {
      var to = new URLSearchParams(window.location.search).get('to');
      if (to && to !== me.id) openThread(to);
    });
  });
})();
