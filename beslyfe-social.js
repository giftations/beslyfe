/* Shared client helpers for the Beslyfe social platform.
   Identity is a community profile the visitor chooses to act as; it is kept in
   localStorage so posting, liking, commenting and following work across pages
   without a separate login. Exposes a small API on window.BeslyfeSocial. */
(function () {
  var SOCIAL_ENDPOINT = '/.netlify/functions/social';
  var PROFILES_ENDPOINT = '/.netlify/functions/profiles';
  var MEDIA_ENDPOINT = '/.netlify/functions/media-library';
  var STORE_KEY = 'beslyfe_active_profile';
  var PREVIOUS_STORE_KEY = ['ba', 'y_active_profile'].join('');
  try {
    if (!localStorage.getItem(STORE_KEY) && localStorage.getItem(PREVIOUS_STORE_KEY)) {
      localStorage.setItem(STORE_KEY, localStorage.getItem(PREVIOUS_STORE_KEY));
      localStorage.removeItem(PREVIOUS_STORE_KEY);
    }
  } catch (e) {}

  function escHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function initials(name) {
    var parts = String(name || '?').trim().split(/\s+/);
    return ((parts[0] || '')[0] || '?').toUpperCase() + ((parts[1] || '')[0] || '').toUpperCase();
  }

  function timeAgo(iso) {
    var then = new Date(iso).getTime();
    if (isNaN(then)) return '';
    var s = Math.max(1, Math.floor((Date.now() - then) / 1000));
    if (s < 60) return s + 's ago';
    var m = Math.floor(s / 60); if (m < 60) return m + 'm ago';
    var h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
    var d = Math.floor(h / 24); if (d < 7) return d + 'd ago';
    return new Date(iso).toLocaleDateString();
  }

  function avatar(p, cls) {
    cls = cls || 'so-avatar';
    if (p && p.headshotUrl) {
      return '<img class="' + cls + '" src="' + escHtml(p.headshotUrl) + '" alt="">';
    }
    return '<div class="' + cls + ' placeholder">' + escHtml(initials(p && p.displayName)) + '</div>';
  }

  function getIdentity() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { return null; }
  }

  function setIdentity(profile) {
    if (!profile) return;
    var slim = {
      id: profile.id,
      displayName: profile.displayName || '',
      role: profile.role || '',
      headshotUrl: profile.headshotUrl || ''
    };
    localStorage.setItem(STORE_KEY, JSON.stringify(slim));
    document.dispatchEvent(new CustomEvent('beslyfe-identity-change', { detail: slim }));
    return slim;
  }

  function clearIdentity() {
    localStorage.removeItem(STORE_KEY);
    document.dispatchEvent(new CustomEvent('beslyfe-identity-change', { detail: null }));
  }

  // Modal that lists approved profiles so the visitor can choose who to act as.
  function openProfilePicker(onPick) {
    var overlay = document.createElement('div');
    overlay.className = 'so-modal-overlay';
    overlay.innerHTML =
      '<div class="so-modal" role="dialog" aria-modal="true" aria-label="Choose your profile">' +
        '<button class="so-modal-close" aria-label="Close">&times;</button>' +
        '<h3>Who are you here as?</h3>' +
        '<p class="so-modal-hint">Pick your community profile to post, like and follow. ' +
          'No profile yet? <a href="/profile/new">Create one →</a></p>' +
        '<input class="so-modal-search" type="search" placeholder="Search profiles by name…" aria-label="Search profiles">' +
        '<div class="so-modal-list"><p class="so-muted">Loading profiles…</p></div>' +
      '</div>';
    document.body.appendChild(overlay);

    var listEl = overlay.querySelector('.so-modal-list');
    var searchEl = overlay.querySelector('.so-modal-search');
    var all = [];

    function close() { overlay.remove(); }
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    overlay.querySelector('.so-modal-close').addEventListener('click', close);

    function render(items) {
      if (!items.length) { listEl.innerHTML = '<p class="so-muted">No profiles found. <a href="/profile/new">Create yours →</a></p>'; return; }
      listEl.innerHTML = items.map(function (p) {
        return '<button class="so-pick" data-id="' + escHtml(p.id) + '">' +
          avatar(p, 'so-avatar sm') +
          '<span class="so-pick-meta"><strong>' + escHtml(p.displayName || '(no name)') + '</strong>' +
          '<span class="so-pick-role">' + escHtml(p.role || '') + '</span></span></button>';
      }).join('');
    }

    listEl.addEventListener('click', function (e) {
      var btn = e.target.closest('.so-pick');
      if (!btn) return;
      var picked = all.find(function (p) { return p.id === btn.getAttribute('data-id'); });
      if (picked) { setIdentity(picked); if (onPick) onPick(getIdentity()); close(); }
    });

    searchEl.addEventListener('input', function () {
      var q = searchEl.value.trim().toLowerCase();
      render(q ? all.filter(function (p) {
        return (p.displayName || '').toLowerCase().indexOf(q) >= 0 ||
               (p.company || '').toLowerCase().indexOf(q) >= 0;
      }) : all);
    });

    fetch(PROFILES_ENDPOINT)
      .then(function (r) { return r.json(); })
      .then(function (data) { all = (data && data.items) || []; render(all); })
      .catch(function () { listEl.innerHTML = '<p class="so-muted">Could not load profiles.</p>'; });
  }

  // ── Industry-standard photo/video filters ──
  // Each look is a plain CSS `filter` string so it applies identically to images
  // and video and is fully reversible (we store only the chosen name). Original
  // uploads stay untouched and reusable.
  var FILTERS = [
    { id: '', name: 'Original', css: '' },
    { id: 'vivid', name: 'Vivid', css: 'saturate(1.5) contrast(1.08)' },
    { id: 'warm', name: 'Warm', css: 'sepia(0.3) saturate(1.4) brightness(1.05) hue-rotate(-10deg)' },
    { id: 'cool', name: 'Cool', css: 'saturate(1.2) hue-rotate(15deg) brightness(1.04)' },
    { id: 'fade', name: 'Fade', css: 'contrast(0.85) brightness(1.1) saturate(0.82)' },
    { id: 'vintage', name: 'Vintage', css: 'sepia(0.45) contrast(0.92) brightness(1.08) saturate(1.3)' },
    { id: 'dramatic', name: 'Dramatic', css: 'contrast(1.4) brightness(0.96) saturate(1.2)' },
    { id: 'bw', name: 'B&W', css: 'grayscale(1) contrast(1.08)' },
    { id: 'noir', name: 'Noir', css: 'grayscale(1) contrast(1.45) brightness(0.9)' }
  ];

  function filterCss(id) {
    for (var i = 0; i < FILTERS.length; i++) { if (FILTERS[i].id === id) return FILTERS[i].css; }
    return '';
  }

  // ── Reliable optional media uploads ──
  // Mixed photo/video pickers use one MIME-aware path. Images are compressed
  // before upload; videos never enter the image decoder and larger videos use
  // bounded resumable chunks.
  var MAX_IMAGE_EDGE = 1600;            // longest side, in pixels
  var TARGET_IMAGE_BYTES = 2 * 1024 * 1024;
  var DIRECT_MEDIA_BYTES = 3 * 1024 * 1024;

  function mediaKindForFile(file) {
    if (!file) return '';
    var type = String(file.type || '').trim().toLowerCase();
    if (type.indexOf('image/') === 0) return 'image';
    if (type.indexOf('video/') === 0) return 'video';

    // File.type can be blank on mobile browsers and for drag/drop. Keep this
    // extension list aligned with the media-library function.
    var name = String(file.name || '').trim().toLowerCase();
    if (/\.(jpe?g|png|gif|webp|svg|avif)$/.test(name)) return 'image';
    if (/\.(mp4|m4v|webm|ogv|mov)$/.test(name)) return 'video';
    return '';
  }

  function readFileBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result).split(',')[1] || ''); };
      reader.onerror = function () { reject(new Error('Could not read that file.')); };
      reader.readAsDataURL(file);
    });
  }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('That file could not be read as an image.')); };
      img.src = url;
    });
  }

  function prepareImageForUpload(file) {
    if (mediaKindForFile(file) !== 'image') {
      return Promise.reject(new Error('Choose an image file.'));
    }
    var name = file && file.name ? file.name : 'photo';
    var type = (file && file.type) || '';
    // SVGs are vector/text and tiny — send unchanged.
    if (type === 'image/svg+xml' || /\.svg$/i.test(name)) {
      return readFileBase64(file).then(function (b) { return { dataBase64: b, contentType: type, filename: name }; });
    }
    return loadImage(file).then(function (img) {
      var w = img.naturalWidth || img.width;
      var h = img.naturalHeight || img.height;
      // Small enough already — keep the original bytes (preserves PNG transparency).
      if (w <= MAX_IMAGE_EDGE && h <= MAX_IMAGE_EDGE && file.size <= TARGET_IMAGE_BYTES) {
        return readFileBase64(file).then(function (b) { return { dataBase64: b, contentType: type || '', filename: name }; });
      }
      var scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(w, h));
      var canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      var ctx = canvas.getContext('2d');
      if (!ctx || typeof canvas.toDataURL !== 'function') {
        return readFileBase64(file).then(function (b) { return { dataBase64: b, contentType: type || '', filename: name }; });
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      var quality = 0.85;
      var dataUrl = canvas.toDataURL('image/jpeg', quality);
      while (dataUrl.length * 0.75 > TARGET_IMAGE_BYTES && quality > 0.4) {
        quality -= 0.1;
        dataUrl = canvas.toDataURL('image/jpeg', quality);
      }
      var comma = dataUrl.indexOf(',');
      var base = (name || 'photo').replace(/\.[^.]+$/, '');
      return {
        dataBase64: comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl,
        contentType: 'image/jpeg',
        filename: base + '.jpg',
      };
    }).catch(function (error) {
      // Preserve a valid image's original bytes if this browser cannot decode it
      // for optimization. mediaKindForFile already rejected non-images.
      return readFileBase64(file).then(function (b) {
        return { dataBase64: b, contentType: type || '', filename: name };
      }).catch(function () { throw error; });
    });
  }

  function readMediaForUpload(file, kind) {
    return readFileBase64(file).then(function (dataBase64) {
      return {
        dataBase64: dataBase64,
        contentType: file.type || '',
        filename: file.name || (kind === 'video' ? 'video.mp4' : 'photo.jpg')
      };
    });
  }

  function createMediaPreview(file) {
    if (window.URL && typeof window.URL.createObjectURL === 'function') {
      return Promise.resolve({
        preview: window.URL.createObjectURL(file),
        previewObjectUrl: true
      });
    }
    return readFileBase64(file).then(function (dataBase64) {
      return {
        preview: 'data:' + (file.type || 'application/octet-stream') + ';base64,' + dataBase64,
        previewObjectUrl: false
      };
    });
  }

  function releaseMediaPreview(media) {
    if (!media || !media.previewObjectUrl || !media.preview) return;
    if (window.URL && typeof window.URL.revokeObjectURL === 'function') {
      window.URL.revokeObjectURL(media.preview);
    }
    media.previewObjectUrl = false;
  }

  function prepareMediaForUpload(file) {
    var kind = mediaKindForFile(file);
    if (kind === 'image') return prepareImageForUpload(file);
    if (kind === 'video') return readMediaForUpload(file, kind);
    return Promise.reject(new Error('Choose a photo or video file.'));
  }

  function responseJson(response, fallback) {
    return response.json().catch(function () { return {}; }).then(function (data) {
      if (!response.ok) {
        var error = new Error(data.error || fallback || 'Upload failed');
        error.status = response.status;
        throw error;
      }
      return data;
    });
  }

  function requestJsonWithRetry(url, options, fallback, retries) {
    var attempt = 0;
    function run() {
      return fetch(url, options)
        .then(function (response) { return responseJson(response, fallback); })
        .catch(function (error) {
          var retryable = !error.status || error.status === 408 || error.status === 425 || error.status >= 500;
          if (!retryable || attempt >= retries) throw error;
          attempt += 1;
          return new Promise(function (resolve) {
            setTimeout(resolve, 250 * attempt);
          }).then(run);
        });
    }
    return run();
  }

  function clientUploadId() {
    var value = window.crypto && typeof window.crypto.randomUUID === 'function'
      ? window.crypto.randomUUID().toLowerCase()
      : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    return 'upload_' + value.replace(/[^a-z0-9-]/g, '').slice(0, 100);
  }

  function uploadPreparedMedia(prepared, options) {
    options = options || {};
    return fetch(options.endpoint || MEDIA_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerId: options.ownerId || '',
        filename: prepared.filename,
        contentType: prepared.contentType,
        dataBase64: prepared.dataBase64,
        caption: options.caption || '',
        filter: options.filter || ''
      })
    }).then(function (response) { return responseJson(response, 'Upload failed'); });
  }

  function uploadMediaInChunks(file, kind, options) {
    options = options || {};
    var endpoint = options.endpoint || MEDIA_ENDPOINT;
    var uploadId = clientUploadId();
    var chunkSize = 0;
    var totalChunks = 0;

    return requestJsonWithRetry(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'initUpload',
        clientUploadId: uploadId,
        ownerId: options.ownerId || '',
        filename: file.name || (kind === 'video' ? 'video.mp4' : 'photo.jpg'),
        contentType: file.type || '',
        totalBytes: file.size
      })
    }, 'Could not start upload.', 2).then(function (session) {
      uploadId = session.uploadId;
      chunkSize = Number(session.chunkSize);
      totalChunks = Number(session.totalChunks);
      if (!uploadId || !chunkSize || !totalChunks) throw new Error('Upload session could not start.');

      function sendChunk(index) {
        if (index >= totalChunks) return Promise.resolve();
        var start = index * chunkSize;
        var end = Math.min(file.size, start + chunkSize);
        var chunk = file.slice(start, end);
        return requestJsonWithRetry(
          endpoint + '?uploadId=' + encodeURIComponent(uploadId) + '&chunk=' + encodeURIComponent(index),
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/octet-stream',
              'Content-Range': 'bytes ' + start + '-' + (end - 1) + '/' + file.size
            },
            body: chunk
          },
          'A media chunk could not be uploaded.',
          2
        ).then(function () {
          if (typeof options.onProgress === 'function') {
            options.onProgress(Math.round(((index + 1) / totalChunks) * 100));
          }
          return sendChunk(index + 1);
        });
      }

      return sendChunk(0).then(function () {
        return requestJsonWithRetry(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'finishUpload',
            uploadId: uploadId,
            caption: options.caption || '',
            filter: options.filter || ''
          })
        }, 'Could not finish upload.', 2);
      });
    });
  }

  function uploadMediaFile(file, options) {
    var kind = mediaKindForFile(file);
    if (!kind) return Promise.reject(new Error('Choose a photo or video file.'));
    if (kind === 'video' && Number(file.size || 0) > DIRECT_MEDIA_BYTES) {
      return uploadMediaInChunks(file, kind, options);
    }
    return prepareMediaForUpload(file).then(function (prepared) {
      var preparedBytes = Math.floor((String(prepared.dataBase64 || '').length * 3) / 4);
      // Optimization normally keeps images below the direct ceiling. If a
      // browser cannot decode an otherwise supported image (or a large SVG must
      // remain lossless), use the same resumable transport as video.
      if (preparedBytes > DIRECT_MEDIA_BYTES) {
        return uploadMediaInChunks(file, kind, options);
      }
      return uploadPreparedMedia(prepared, options);
    });
  }

  // Shared social sub-navigation, injected at the top of every social page so the
  // whole platform is reachable from anywhere (the old dead-end is gone).
  function renderNav(active) {
    var links = [
      { href: '/community', key: 'community', label: 'Community' },
      { href: '/hub', key: 'hub', label: 'My hub' },
      { href: '/feed', key: 'feed', label: 'Feed' },
      { href: '/reels', key: 'reels', label: 'Reels' },
      { href: '/stories', key: 'stories', label: 'Stories' },
      { href: '/library', key: 'library', label: 'Library' },
      { href: '/groups', key: 'groups', label: 'Groups' },
      { href: '/map', key: 'map', label: 'Map' },
      { href: '/messages', key: 'messages', label: 'Messages' },
      { href: '/directory', key: 'directory', label: 'Directory' }
    ];
    var html = '<nav class="so-subnav"><div class="so-subnav-inner">' +
      links.map(function (l) {
        return '<a href="' + l.href + '"' + (l.key === active ? ' class="active"' : '') + '>' + escHtml(l.label) + '</a>';
      }).join('') +
      '<a href="/create" class="so-subnav-cta">Build & grow</a>' +
      '<a href="#" class="so-subnav-logout" data-beslyfe-logout>Log out</a>' +
      '</div></nav>';
    var holder = document.getElementById('soNav');
    if (holder) {
      holder.innerHTML = html;
      var logoutLink = holder.querySelector('[data-beslyfe-logout]');
      if (logoutLink) {
        logoutLink.addEventListener('click', function (e) {
          e.preventDefault();
          // Full sign-out: revoke the server session, then clear the account
          // session and the social identity locally.
          try {
            fetch('/.netlify/functions/auth', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'logout' }), keepalive: true
            }).catch(function () {});
          } catch (err) {}
          try { localStorage.removeItem('beslyfe_session'); } catch (err) {}
          clearIdentity();
          window.location.href = '/';
        });
      }
    }
    return html;
  }

  window.BeslyfeSocial = {
    SOCIAL_ENDPOINT: SOCIAL_ENDPOINT,
    PROFILES_ENDPOINT: PROFILES_ENDPOINT,
    MEDIA_ENDPOINT: MEDIA_ENDPOINT,
    GROUPS_ENDPOINT: '/.netlify/functions/groups',
    LOCATIONS_ENDPOINT: '/.netlify/functions/locations',
    NOTIFICATIONS_ENDPOINT: '/.netlify/functions/notifications',
    escHtml: escHtml,
    initials: initials,
    timeAgo: timeAgo,
    avatar: avatar,
    getIdentity: getIdentity,
    setIdentity: setIdentity,
    clearIdentity: clearIdentity,
    openProfilePicker: openProfilePicker,
    FILTERS: FILTERS,
    filterCss: filterCss,
    mediaKindForFile: mediaKindForFile,
    prepareImageForUpload: prepareImageForUpload,
    prepareMediaForUpload: prepareMediaForUpload,
    createMediaPreview: createMediaPreview,
    releaseMediaPreview: releaseMediaPreview,
    uploadMediaFile: uploadMediaFile,
    renderNav: renderNav
  };
})();
