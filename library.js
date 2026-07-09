/* Media library: a grid of the member's uploaded photos and videos, with direct
   upload and delete. Backed by the media-library function (Netlify Blobs + the
   social_media index). */
(function () {
  var S = window.BaySocial;
  var grid = document.getElementById('grid');
  var idAvatar = document.getElementById('idAvatar');
  var idText = document.getElementById('idText');
  var idChangeBtn = document.getElementById('idChangeBtn');
  var uploadBtn = document.getElementById('uploadBtn');
  var uploadInput = document.getElementById('uploadInput');
  var uploadError = document.getElementById('uploadError');
  S.renderNav('library');

  function me() { return S.getIdentity(); }

  function renderIdentity() {
    var id = me();
    if (id) {
      if (id.headshotUrl) idAvatar.outerHTML = '<img class="so-avatar" id="idAvatar" src="' + S.escHtml(id.headshotUrl) + '" alt="">';
      else idAvatar.outerHTML = '<div class="so-avatar placeholder" id="idAvatar">' + S.escHtml(S.initials(id.displayName)) + '</div>';
      idAvatar = document.getElementById('idAvatar');
      idText.innerHTML = '<strong>' + S.escHtml(id.displayName || '(no name)') + '</strong><span>Your media library</span>';
      idChangeBtn.textContent = 'Switch';
    } else {
      idText.innerHTML = '<strong>Choose your profile</strong><span>to see and manage your library</span>';
      idChangeBtn.textContent = 'Choose profile';
    }
  }

  function load() {
    var id = me();
    if (!id) { grid.innerHTML = '<p class="so-empty">Choose a profile to view your library.</p>'; return; }
    fetch(S.MEDIA_ENDPOINT + '?owner=' + encodeURIComponent(id.id))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var items = (data && data.items) || [];
        if (!items.length) { grid.innerHTML = '<p class="so-empty">No media yet. Upload your first photo or video above.</p>'; return; }
        grid.innerHTML = items.map(function (it) {
          var css = S.filterCss(it.filter);
          var media = it.kind === 'video'
            ? '<video src="' + S.escHtml(it.url) + '#t=0.1" muted playsinline style="filter:' + css + '"></video>'
            : '<img src="' + S.escHtml(it.url) + '" alt="' + S.escHtml(it.caption) + '" style="filter:' + css + '">';
          return '<div class="lib-item" data-id="' + S.escHtml(it.id) + '">' + media +
            '<span class="lib-kind">' + S.escHtml(it.kind) + '</span>' +
            '<button class="lib-del" data-id="' + S.escHtml(it.id) + '" title="Delete">×</button></div>';
        }).join('');
      })
      .catch(function () { grid.innerHTML = '<p class="so-empty">Could not load your library.</p>'; });
  }

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result).split(',')[1]); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  uploadBtn.addEventListener('click', function () {
    if (!me()) { S.openProfilePicker(function () { renderIdentity(); load(); }); return; }
    uploadInput.click();
  });

  uploadInput.addEventListener('change', function () {
    var f = uploadInput.files[0]; if (!f) return;
    var id = me(); if (!id) return;
    uploadError.hidden = true;
    uploadBtn.disabled = true; uploadBtn.textContent = 'Uploading…';
    fileToBase64(f).then(function (dataBase64) {
      return fetch(S.MEDIA_ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerId: id.id, filename: f.name, contentType: f.type, dataBase64: dataBase64 })
      });
    }).then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Upload failed'); return d; }); })
      .then(function () { uploadInput.value = ''; load(); })
      .catch(function (err) { uploadError.textContent = err.message; uploadError.hidden = false; })
      .finally(function () { uploadBtn.disabled = false; uploadBtn.textContent = '⬆ Upload photo or video'; });
  });

  grid.addEventListener('click', function (e) {
    var del = e.target.closest('.lib-del'); if (!del) return;
    var id = me(); if (!id) return;
    if (!window.confirm('Delete this item from your library?')) return;
    var mid = del.getAttribute('data-id');
    fetch(S.MEDIA_ENDPOINT + '?id=' + encodeURIComponent(mid) + '&owner=' + encodeURIComponent(id.id), { method: 'DELETE' })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Failed'); }); })
      .then(function () { var el = del.closest('.lib-item'); if (el) el.remove(); if (!grid.children.length) load(); })
      .catch(function () {});
  });

  idChangeBtn.addEventListener('click', function () { S.openProfilePicker(function () { renderIdentity(); load(); }); });
  document.addEventListener('bay-identity-change', function () { renderIdentity(); load(); });
  renderIdentity();
  load();
})();
