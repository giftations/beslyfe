/* Community feed: render posts, compose new ones, like, comment and manage the
   "posting as" identity. Relies on window.BaySocial (social-common.js). */
(function () {
  var S = window.BaySocial;
  var MEDIA_ENDPOINT = '/.netlify/functions/site-media';
  var AUTH_ENDPOINT = '/.netlify/functions/auth';
  var feedEl = document.getElementById('feed');
  var composer = document.getElementById('composer');
  var postBody = document.getElementById('postBody');
  var postImage = document.getElementById('postImage');
  var postBtn = document.getElementById('postBtn');
  var composerError = document.getElementById('composerError');
  var postPhoto = document.getElementById('postPhoto');
  var photoBtn = document.getElementById('photoBtn');
  var postPhotoPreview = document.getElementById('postPhotoPreview');
  var idAvatar = document.getElementById('idAvatar');
  var idText = document.getElementById('idText');
  var idChangeBtn = document.getElementById('idChangeBtn');

  var selectedPhoto = null;
  // The signed-in account (with its linked profile, if any) resolved from the
  // server session. Lets a logged-in member post straight away — even before
  // they've picked a profile, and even if their account has no profile yet: the
  // server creates and links one on their first post.
  var sessionAccount = null;

  function me() { return S.getIdentity(); }

  // True when there is a signed-in account, regardless of whether a community
  // profile has been chosen or created yet.
  function signedIn() { return !!(sessionAccount && sessionAccount.account); }

  // ── Photo attachment ──
  if (photoBtn && postPhoto) {
    photoBtn.addEventListener('click', function () { postPhoto.click(); });
    postPhoto.addEventListener('change', function () {
      selectedPhoto = postPhoto.files[0] || null;
      if (!selectedPhoto) { postPhotoPreview.hidden = true; return; }
      var reader = new FileReader();
      reader.onload = function () { postPhotoPreview.src = reader.result; postPhotoPreview.hidden = false; };
      reader.readAsDataURL(selectedPhoto);
      // A chosen file takes precedence over a pasted URL.
      if (postImage) postImage.value = '';
    });
  }

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result).split(',')[1]); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Photos straight from a phone camera are often several megabytes. Sent as
  // base64 JSON they overflow the function's request body limit and the upload
  // fails before it even runs. Downscale and re-encode the image in the browser
  // so it comfortably fits, keeping the longest side at MAX_DIM and stepping the
  // JPEG quality down until the encoded size is under the budget.
  var MAX_DIM = 1600;
  var MAX_UPLOAD_BYTES = 3 * 1024 * 1024; // well under the request-size limit

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
      img.src = url;
    });
  }

  function canvasToBase64(canvas, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) { reject(new Error('Could not process image')); return; }
        var reader = new FileReader();
        reader.onload = function () { resolve(String(reader.result).split(',')[1]); };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      }, 'image/jpeg', quality);
    });
  }

  // Returns { filename, contentType, dataBase64 } sized to fit the feed.
  async function fitImageForUpload(file) {
    // Animated GIFs and vector SVGs can't be redrawn to a canvas without losing
    // what makes them work, so pass them through untouched.
    if (file.type === 'image/gif' || file.type === 'image/svg+xml') {
      return { filename: file.name, contentType: file.type, dataBase64: await fileToBase64(file) };
    }

    var img;
    try {
      img = await loadImage(file);
    } catch (e) {
      // Fall back to the original bytes if decoding fails (e.g. exotic format).
      return { filename: file.name, contentType: file.type, dataBase64: await fileToBase64(file) };
    }

    var scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
    var w = Math.max(1, Math.round(img.naturalWidth * scale));
    var h = Math.max(1, Math.round(img.naturalHeight * scale));
    var canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    var ctx = canvas.getContext('2d');
    // White backdrop so images with transparency don't turn black as JPEG.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    var qualities = [0.85, 0.75, 0.6, 0.45];
    var dataBase64 = '';
    for (var i = 0; i < qualities.length; i++) {
      dataBase64 = await canvasToBase64(canvas, qualities[i]);
      // base64 length ≈ 4/3 of the byte size.
      if (dataBase64.length * 0.75 <= MAX_UPLOAD_BYTES) break;
    }

    var baseName = (file.name || 'photo').replace(/\.[^.]+$/, '');
    return { filename: baseName + '.jpg', contentType: 'image/jpeg', dataBase64: dataBase64 };
  }

  async function uploadPhoto(file) {
    var fitted = await fitImageForUpload(file);
    var res = await fetch(MEDIA_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fitted)
    });
    var data;
    try {
      data = await res.json();
    } catch (e) {
      throw new Error(res.status === 413 ? 'Photo is too large — try a smaller image.' : 'Photo upload failed');
    }
    if (!res.ok) throw new Error(data.error || 'Photo upload failed');
    return data.url;
  }

  function clearComposer() {
    postBody.value = '';
    if (postImage) postImage.value = '';
    selectedPhoto = null;
    if (postPhoto) postPhoto.value = '';
    if (postPhotoPreview) { postPhotoPreview.hidden = true; postPhotoPreview.src = ''; }
  }

  function renderIdentity() {
    var id = me();
    if (id) {
      if (id.headshotUrl) {
        idAvatar.outerHTML = '<img class="so-avatar" id="idAvatar" src="' + S.escHtml(id.headshotUrl) + '" alt="">';
      } else {
        idAvatar.outerHTML = '<div class="so-avatar placeholder" id="idAvatar">' + S.escHtml(S.initials(id.displayName)) + '</div>';
      }
      idAvatar = document.getElementById('idAvatar');
      idText.innerHTML = '<strong>' + S.escHtml(id.displayName || '(no name)') + '</strong>' +
        '<span>Posting as ' + S.escHtml(id.role || 'member') + ' · <a href="#" id="idSwitch" style="color:var(--green)">switch</a></span>';
      idChangeBtn.textContent = 'Switch';
      composer.hidden = false;
      var sw = document.getElementById('idSwitch');
      if (sw) sw.addEventListener('click', function (e) { e.preventDefault(); choose(); });
    } else if (signedIn()) {
      // Signed in but no community profile chosen/created yet (e.g. an admin, or
      // a brand-new account). Let them post right away — the composer is shown and
      // the server links a profile to their account on the first post.
      var a = sessionAccount.account;
      idAvatar.outerHTML = '<div class="so-avatar placeholder" id="idAvatar">' + S.escHtml(S.initials(a.name || a.email)) + '</div>';
      idAvatar = document.getElementById('idAvatar');
      idText.innerHTML = '<strong>' + S.escHtml(a.name || 'You') + '</strong>' +
        '<span>Posting to the community feed</span>';
      idChangeBtn.textContent = 'Choose profile';
      composer.hidden = false;
    } else {
      idText.innerHTML = '<strong>Join the conversation</strong><span>Choose your profile to start posting</span>';
      idChangeBtn.textContent = 'Choose profile';
      composer.hidden = true;
    }
  }

  function choose() { S.openProfilePicker(function () { renderIdentity(); load(); }); }
  idChangeBtn.addEventListener('click', choose);

  function postCard(p) {
    var id = me();
    var authorLink = '/profile?id=' + encodeURIComponent(p.author.id || '');
    var fcss = (S.filterCss && S.filterCss(p.filter)) || '';
    var media = '';
    if (p.videoUrl) {
      media = '<video class="so-post-img" src="' + S.escHtml(p.videoUrl) + '" controls playsinline preload="metadata" style="filter:' + fcss + '"></video>';
    } else if (p.imageUrl) {
      media = '<img class="so-post-img" src="' + S.escHtml(p.imageUrl) + '" alt="" loading="lazy" style="filter:' + fcss + '">';
    }
    var body = p.body ? '<div class="so-post-body">' + S.escHtml(p.body) + '</div>' : '';
    var canDelete = id && id.id === p.author.id;
    var typeBadge = (p.postType && p.postType !== 'post') ? '<span class="so-role-pill">' + S.escHtml(p.postType) + '</span>' : '';
    var music = p.music ? '<div class="reel-music" style="margin:8px 2px 0">♪ ' + S.escHtml((window.BayMusic && window.BayMusic.trackName(p.music)) || p.music) + '</div>' : '';
    var loc = (p.location && p.location.lat) ? '<div class="so-sub" style="margin:8px 2px 0">📍 ' + S.escHtml(p.location.label || (p.location.lat + ', ' + p.location.lng)) + '</div>' : '';
    return '<article class="so-post" data-id="' + S.escHtml(p.id) + '">' +
      '<div class="so-post-head">' +
        '<a href="' + authorLink + '">' + S.avatar(p.author) + '</a>' +
        '<div class="so-name"><a href="' + authorLink + '">' + S.escHtml(p.author.displayName) + '</a>' +
          (p.author.role ? '<span class="so-role-pill">' + S.escHtml(p.author.role) + '</span>' : '') + typeBadge +
          '<div class="so-sub">' + S.timeAgo(p.createdAt) + '</div></div>' +
      '</div>' +
      body + media + music + loc +
      '<div class="so-post-actions">' +
        '<button class="so-action like-btn ' + (p.liked ? 'liked' : '') + '" data-id="' + S.escHtml(p.id) + '">' +
          '<span class="heart">' + (p.liked ? '♥' : '♡') + '</span> <span class="like-count">' + p.likeCount + '</span></button>' +
        '<button class="so-action comment-btn" data-id="' + S.escHtml(p.id) + '">💬 <span class="comment-count">' + p.commentCount + '</span></button>' +
        (canDelete ? '<button class="so-action danger delete-btn" data-id="' + S.escHtml(p.id) + '">Delete</button>' : '') +
      '</div>' +
      '<div class="so-comments" data-id="' + S.escHtml(p.id) + '"></div>' +
    '</article>';
  }

  async function load() {
    var id = me();
    var q = id ? '?type=feed&viewer=' + encodeURIComponent(id.id) : '?type=feed';
    try {
      var res = await fetch(S.SOCIAL_ENDPOINT + q);
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      var items = data.items || [];
      if (!items.length) {
        feedEl.innerHTML = '<p class="so-empty">No posts yet. Be the first to share something with the community!</p>';
        return;
      }
      feedEl.innerHTML = items.map(postCard).join('');
    } catch (err) {
      feedEl.innerHTML = '<p class="so-empty">Could not load the feed: ' + S.escHtml(err.message) + '</p>';
    }
  }

  // Composer
  postBtn.addEventListener('click', async function () {
    var id = me();
    // A picked profile isn't required — a signed-in account can post and have its
    // profile created server-side. Only prompt to choose when nobody's signed in.
    if (!id && !signedIn()) { choose(); return; }
    var body = postBody.value.trim();
    var imageUrl = postImage.value.trim();
    composerError.hidden = true;
    if (!body && !imageUrl && !selectedPhoto) { composerError.textContent = 'Write something or add a photo.'; composerError.hidden = false; return; }
    postBtn.disabled = true; postBtn.textContent = 'Posting…';
    try {
      // Upload an attached photo first, then post with its URL.
      if (selectedPhoto) {
        postBtn.textContent = 'Uploading photo…';
        imageUrl = await uploadPhoto(selectedPhoto);
      }
      postBtn.textContent = 'Posting…';
      var res = await fetch(S.SOCIAL_ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'post', authorId: id ? id.id : '', body: body, imageUrl: imageUrl })
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not post');
      // The server tells us who the post was actually authored as (it may have
      // just created the profile). Adopt it so "posting as" is correct from now on.
      if (data.author && data.author.id) { S.setIdentity(data.author); renderIdentity(); }
      clearComposer();
      load();
    } catch (err) {
      composerError.textContent = err.message; composerError.hidden = false;
    } finally {
      postBtn.disabled = false; postBtn.textContent = 'Post';
    }
  });

  // Delegated post interactions
  feedEl.addEventListener('click', async function (e) {
    var likeBtn = e.target.closest('.like-btn');
    var commentBtn = e.target.closest('.comment-btn');
    var deleteBtn = e.target.closest('.delete-btn');

    if (likeBtn) return toggleLike(likeBtn);
    if (commentBtn) return toggleComments(commentBtn);
    if (deleteBtn) return deletePost(deleteBtn);
  });

  async function toggleLike(btn) {
    var id = me();
    if (!id) { choose(); return; }
    var postId = btn.getAttribute('data-id');
    var liked = btn.classList.contains('liked');
    btn.disabled = true;
    try {
      var res = liked
        ? await fetch(S.SOCIAL_ENDPOINT + '?kind=like&postId=' + encodeURIComponent(postId) + '&profileId=' + encodeURIComponent(id.id), { method: 'DELETE' })
        : await fetch(S.SOCIAL_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'like', postId: postId, profileId: id.id }) });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      btn.classList.toggle('liked', data.liked);
      btn.querySelector('.heart').textContent = data.liked ? '♥' : '♡';
      btn.querySelector('.like-count').textContent = data.likeCount;
    } catch (e) { /* ignore */ } finally { btn.disabled = false; }
  }

  async function toggleComments(btn) {
    var postId = btn.getAttribute('data-id');
    var box = feedEl.querySelector('.so-comments[data-id="' + cssEscape(postId) + '"]');
    if (!box) return;
    if (box.classList.contains('open')) { box.classList.remove('open'); return; }
    box.classList.add('open');
    box.innerHTML = '<p class="so-muted">Loading comments…</p>';
    await renderComments(box, postId);
  }

  async function renderComments(box, postId) {
    try {
      var res = await fetch(S.SOCIAL_ENDPOINT + '?type=comments&postId=' + encodeURIComponent(postId));
      var data = await res.json();
      var items = data.items || [];
      var html = items.map(function (c) {
        return '<div class="so-comment">' + S.avatar(c.author, 'so-avatar sm') +
          '<div class="so-c-body"><span class="so-c-name">' + S.escHtml(c.author.displayName) + '</span> ' +
          '<span class="so-sub">' + S.timeAgo(c.createdAt) + '</span>' +
          '<div class="so-c-text">' + S.escHtml(c.body) + '</div></div></div>';
      }).join('');
      var id = me();
      html += id
        ? '<form class="so-comment-form"><input type="text" placeholder="Write a comment…" maxlength="2000"><button class="so-btn" type="submit">Send</button></form>'
        : '<p class="so-muted"><a href="#" class="pick-here">Choose a profile</a> to comment.</p>';
      box.innerHTML = html || '<p class="so-muted">No comments yet.</p>';
      if (!items.length && id) {
        box.innerHTML = '<form class="so-comment-form"><input type="text" placeholder="Write the first comment…" maxlength="2000"><button class="so-btn" type="submit">Send</button></form>';
      }
      var form = box.querySelector('.so-comment-form');
      if (form) {
        form.addEventListener('submit', async function (e) {
          e.preventDefault();
          var input = form.querySelector('input');
          var text = input.value.trim();
          if (!text) return;
          var who = me(); if (!who) { choose(); return; }
          input.disabled = true;
          try {
            var r = await fetch(S.SOCIAL_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'comment', postId: postId, authorId: who.id, body: text }) });
            var d = await r.json();
            if (!r.ok) throw new Error(d.error || 'Failed');
            await renderComments(box, postId);
            var cc = feedEl.querySelector('.comment-btn[data-id="' + cssEscape(postId) + '"] .comment-count');
            if (cc) cc.textContent = String(Number(cc.textContent || 0) + 1);
          } catch (e) { input.disabled = false; }
        });
      }
      var pick = box.querySelector('.pick-here');
      if (pick) pick.addEventListener('click', function (e) { e.preventDefault(); choose(); });
    } catch (e) {
      box.innerHTML = '<p class="so-muted">Could not load comments.</p>';
    }
  }

  async function deletePost(btn) {
    var id = me(); if (!id) return;
    if (!window.confirm('Delete this post?')) return;
    var postId = btn.getAttribute('data-id');
    try {
      var res = await fetch(S.SOCIAL_ENDPOINT + '?kind=post&id=' + encodeURIComponent(postId) + '&profileId=' + encodeURIComponent(id.id), { method: 'DELETE' });
      if (!res.ok) { var d = await res.json(); throw new Error(d.error || 'Failed'); }
      var card = btn.closest('.so-post'); if (card) card.remove();
    } catch (e) { /* ignore */ }
  }

  function cssEscape(s) { return String(s).replace(/["\\]/g, '\\$&'); }

  // Studio entry points: the composer button and the floating action button open
  // the richer create flow (reels, stories, filters, music, location).
  var studioBtn = document.getElementById('studioBtn');
  if (studioBtn) studioBtn.addEventListener('click', function () {
    if (!S.openStudio) return;
    if (!me()) { choose(); return; }
    S.openStudio({ mode: 'post', onDone: load });
  });
  var fab = document.getElementById('createFab');
  if (fab) fab.addEventListener('click', function () {
    if (!S.openStudio) { choose(); return; }
    S.openStudio({ mode: 'post', onDone: load });
  });

  // Resolve the signed-in account from the server session, then adopt its linked
  // community profile as the active identity when the visitor hasn't picked one.
  // This is what lets a member (or admin) land on the feed already able to post.
  function loadSession() {
    return fetch(AUTH_ENDPOINT + '?action=session', { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (d) { return (d && d.account) ? d : null; })
      .catch(function () { return null; });
  }

  if (S.renderNav) S.renderNav('feed');
  renderIdentity();
  load();
  loadSession().then(function (sess) {
    sessionAccount = sess;
    if (sess && sess.profile && sess.profile.id && !me()) {
      S.setIdentity({
        id: sess.profile.id,
        displayName: sess.profile.displayName || (sess.account && sess.account.name) || '',
        role: sess.profile.role || '',
        headshotUrl: sess.profile.headshotUrl || ''
      });
    }
    renderIdentity();
  });
})();
