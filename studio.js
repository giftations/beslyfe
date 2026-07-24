/* Beslyfe — the creation Studio.
   One modal for composing posts, reels and stories with: media from your
   library or a fresh upload, industry-standard filters, a public/private
   location pin, and royalty-free background music.

   The music is generated live in the browser with the Web Audio API — short
   arpeggio loops built from oscillators. Nothing is sampled or streamed, so
   there is zero copyright exposure: the "tracks" are sound the page synthesises
   on the fly. Exposes window.BeslyfeMusic (player) and extends window.BeslyfeSocial
   with openStudio(). */
(function () {
  var S = window.BeslyfeSocial;
  if (!S) return;

  // ── Royalty-free music engine ──────────────────────────────────────────
  // Each track is a chord progression; the player arpeggiates it on a loop.
  var TRACKS = [
    { id: '', name: 'No music' },
    { id: 'chill',     name: 'Chill',      tempo: 320, wave: 'sine',     chords: [[220, 277.18, 329.63], [196, 246.94, 293.66], [174.61, 220, 261.63], [196, 246.94, 293.66]] },
    { id: 'upbeat',    name: 'Upbeat',     tempo: 200, wave: 'triangle', chords: [[261.63, 329.63, 392], [293.66, 369.99, 440], [349.23, 440, 523.25], [293.66, 369.99, 440]] },
    { id: 'lofi',      name: 'Lo-Fi',      tempo: 380, wave: 'sine',     chords: [[196, 233.08, 293.66], [174.61, 220, 261.63], [164.81, 196, 246.94], [174.61, 220, 261.63]] },
    { id: 'cinematic', name: 'Cinematic',  tempo: 440, wave: 'sawtooth', chords: [[130.81, 196, 261.63], [146.83, 220, 293.66], [174.61, 261.63, 349.23], [164.81, 246.94, 329.63]] },
    { id: 'funk',      name: 'Funk',       tempo: 170, wave: 'square',   chords: [[110, 164.81, 220], [146.83, 220, 293.66], [130.81, 196, 261.63], [98, 146.83, 196]] }
  ];

  function trackName(id) {
    for (var i = 0; i < TRACKS.length; i++) { if (TRACKS[i].id === id) return TRACKS[i].name; }
    return '';
  }

  var BeslyfeMusic = {
    TRACKS: TRACKS,
    trackName: trackName,
    _ctx: null,
    _timer: null,
    _master: null,
    _playing: '',
    _ensureCtx: function () {
      if (!this._ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        this._ctx = new AC();
      }
      if (this._ctx.state === 'suspended') { try { this._ctx.resume(); } catch (e) {} }
      return this._ctx;
    },
    play: function (id) {
      this.stop();
      var track = null;
      for (var i = 0; i < TRACKS.length; i++) { if (TRACKS[i].id === id) track = TRACKS[i]; }
      if (!track || !track.id) return;
      var ctx = this._ensureCtx();
      if (!ctx) return;
      this._playing = id;
      var master = ctx.createGain();
      master.gain.value = 0.18;
      master.connect(ctx.destination);
      this._master = master;
      var step = 0;
      var beat = track.tempo;
      var self = this;
      function tick() {
        var chord = track.chords[Math.floor(step / 3) % track.chords.length];
        var note = chord[step % 3];
        var osc = ctx.createOscillator();
        var g = ctx.createGain();
        osc.type = track.wave;
        osc.frequency.value = note;
        var now = ctx.currentTime;
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.9, now + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + beat / 1000 * 0.9);
        osc.connect(g); g.connect(master);
        osc.start(now);
        osc.stop(now + beat / 1000);
        step++;
      }
      tick();
      this._timer = setInterval(tick, beat);
    },
    stop: function () {
      if (this._timer) { clearInterval(this._timer); this._timer = null; }
      if (this._master) { try { this._master.disconnect(); } catch (e) {} this._master = null; }
      this._playing = '';
    }
  };
  window.BeslyfeMusic = BeslyfeMusic;

  // ── Helpers ─────────────────────────────────────────────────────────────
  // Upload a file through the shared MIME-aware path. Images are optimized;
  // videos stay untouched and use resumable chunks when needed.
  function uploadToLibrary(file, ownerId, filter, onProgress) {
    if (!S.uploadMediaFile) return Promise.reject(new Error('Upload tools could not start.'));
    return S.uploadMediaFile(file, {
      ownerId: ownerId,
      filter: filter || '',
      onProgress: onProgress
    });
  }

  // ── Studio modal ──────────────────────────────────────────────────────
  // opts: { mode: 'post'|'reel'|'story', onDone: fn }
  function openStudio(opts) {
    opts = opts || {};
    var me = S.getIdentity();
    if (!me) { S.openProfilePicker(function () { openStudio(opts); }); return; }

    var mode = opts.mode || 'post';
    var state = { media: null, filter: '', music: '', location: null };
    var submitting = false;

    var overlay = document.createElement('div');
    overlay.className = 'so-modal-overlay';
    overlay.innerHTML =
      '<div class="so-modal studio" role="dialog" aria-modal="true" aria-label="Create">' +
        '<button class="so-modal-close" aria-label="Close">&times;</button>' +
        '<div class="studio-tabs">' +
          tab('post', 'Post', mode) + tab('reel', 'Reel', mode) + tab('story', 'Story', mode) +
        '</div>' +
        '<div class="studio-stage" id="stStage"><div class="studio-drop" id="stDrop"><span>+ Add photo or video</span><small>or choose from your library below</small></div></div>' +
        '<input type="file" id="stFile" accept="image/*,video/*" hidden>' +
        '<div class="studio-library" id="stLibrary"></div>' +
        '<textarea id="stCaption" class="studio-caption" maxlength="2000" placeholder="Write a caption…"></textarea>' +
        '<div class="studio-section"><label>Filter</label><div class="studio-filters" id="stFilters"></div></div>' +
        '<div class="studio-section"><label>Music <small>(royalty-free)</small></label><div class="studio-music" id="stMusic"></div></div>' +
        '<div class="studio-section"><label>Location</label><div class="studio-loc" id="stLoc">' +
          '<button class="so-btn ghost" id="stLocBtn" type="button">📍 Add my location</button>' +
          '<div id="stLocPicked" hidden><input type="text" id="stLocLabel" placeholder="Name this place (optional)" maxlength="120">' +
          '<select id="stLocVis"><option value="public">Public</option><option value="followers">Followers</option><option value="private">Private (only me)</option></select>' +
          '<button class="so-btn ghost" id="stLocClear" type="button">Remove</button></div>' +
        '</div></div>' +
        '<div class="studio-section"><label>Who can see this</label>' +
          '<select id="stVis" class="studio-vis"><option value="public">Everyone on Beslyfe</option><option value="ecosystem">This ecosystem only</option><option value="followers">Followers</option><option value="private">Only me</option></select>' +
        '</div>' +
        '<div class="so-error" id="stError" hidden></div>' +
        '<button class="so-btn studio-publish" id="stPublish" type="button">Share</button>' +
      '</div>';
    document.body.appendChild(overlay);

    function tab(key, label, active) {
      return '<button class="studio-tab' + (key === active ? ' active' : '') + '" data-mode="' + key + '">' + label + '</button>';
    }

    var stage = overlay.querySelector('#stStage');
    var drop = overlay.querySelector('#stDrop');
    var fileInput = overlay.querySelector('#stFile');
    var captionEl = overlay.querySelector('#stCaption');
    var filtersEl = overlay.querySelector('#stFilters');
    var musicEl = overlay.querySelector('#stMusic');
    var libraryEl = overlay.querySelector('#stLibrary');
    var errorEl = overlay.querySelector('#stError');
    var publishBtn = overlay.querySelector('#stPublish');

    function close() {
      if (submitting) return;
      BeslyfeMusic.stop();
      if (S.releaseMediaPreview) S.releaseMediaPreview(state.media);
      overlay.remove();
    }
    function setBusy(busy) {
      submitting = busy;
      Array.prototype.forEach.call(overlay.querySelectorAll('button,input,textarea,select'), function (control) {
        control.disabled = busy;
      });
    }
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    overlay.querySelector('.so-modal-close').addEventListener('click', close);

    // Tabs switch the mode in place.
    overlay.querySelector('.studio-tabs').addEventListener('click', function (e) {
      if (submitting) return;
      var t = e.target.closest('.studio-tab'); if (!t) return;
      mode = t.getAttribute('data-mode');
      Array.prototype.forEach.call(overlay.querySelectorAll('.studio-tab'), function (b) { b.classList.toggle('active', b === t); });
      renderStage();
    });

    // ── Media stage ──
    drop.addEventListener('click', function () { if (!submitting) fileInput.click(); });
    fileInput.addEventListener('change', function () {
      if (submitting) return;
      var f = fileInput.files[0]; if (!f) return;
      if (S.releaseMediaPreview) S.releaseMediaPreview(state.media);
      state.media = null;
      renderStage();
      var kind = S.mediaKindForFile ? S.mediaKindForFile(f) : '';
      if (!kind) {
        errorEl.textContent = 'Choose a photo or video file.';
        errorEl.hidden = false;
        fileInput.value = '';
        return;
      }
      errorEl.hidden = true;
      var previewPromise = S.createMediaPreview
        ? S.createMediaPreview(f)
        : Promise.reject(new Error('Preview tools could not start.'));
      previewPromise.then(function (preview) {
        if (!overlay.isConnected || fileInput.files[0] !== f) {
          if (S.releaseMediaPreview) S.releaseMediaPreview(preview);
          return;
        }
        state.media = {
          file: f,
          kind: kind,
          preview: preview.preview,
          previewObjectUrl: preview.previewObjectUrl,
          url: ''
        };
        renderStage();
      }).catch(function (error) {
        if (!overlay.isConnected || fileInput.files[0] !== f) return;
        fileInput.value = '';
        errorEl.textContent = error.message || 'Could not preview that file.';
        errorEl.hidden = false;
      });
    });

    function renderStage() {
      var css = S.filterCss(state.filter);
      if (state.media) {
        var src = state.media.preview || state.media.url;
        if (state.media.kind === 'video') {
          stage.innerHTML = '<video src="' + S.escHtml(src) + '" controls playsinline style="filter:' + css + '"></video>' + clearBtn();
        } else {
          stage.innerHTML = '<img src="' + S.escHtml(src) + '" alt="" style="filter:' + css + '">' + clearBtn();
        }
        var cb = stage.querySelector('.studio-clear');
        if (cb) cb.addEventListener('click', function () {
          if (submitting) return;
          if (S.releaseMediaPreview) S.releaseMediaPreview(state.media);
          state.media = null;
          fileInput.value = '';
          renderStage();
        });
      } else {
        var need = mode === 'reel' ? 'Add a video for your reel' : '+ Add an optional photo or video';
        stage.innerHTML = '<div class="studio-drop" id="stDrop2"><span>' + S.escHtml(need) + '</span><small>or choose from your library below</small></div>';
        stage.querySelector('#stDrop2').addEventListener('click', function () { if (!submitting) fileInput.click(); });
      }
    }
    function clearBtn() { return '<button class="studio-clear" type="button" title="Remove">×</button>'; }

    // ── Filters ──
    S.FILTERS.forEach(function (f) {
      var b = document.createElement('button');
      b.className = 'studio-filter' + (f.id === state.filter ? ' active' : '');
      b.type = 'button';
      b.innerHTML = '<span class="studio-filter-sw" style="filter:' + f.css + '"></span>' + S.escHtml(f.name);
      b.addEventListener('click', function () {
        if (submitting) return;
        state.filter = f.id;
        Array.prototype.forEach.call(filtersEl.children, function (c) { c.classList.remove('active'); });
        b.classList.add('active');
        renderStage();
      });
      filtersEl.appendChild(b);
    });

    // ── Music ──
    BeslyfeMusic.TRACKS.forEach(function (t) {
      var b = document.createElement('button');
      b.className = 'studio-chip' + (t.id === state.music ? ' active' : '');
      b.type = 'button';
      b.textContent = t.id ? '♪ ' + t.name : t.name;
      b.addEventListener('click', function () {
        if (submitting) return;
        state.music = t.id;
        Array.prototype.forEach.call(musicEl.children, function (c) { c.classList.remove('active'); });
        b.classList.add('active');
        if (t.id) BeslyfeMusic.play(t.id); else BeslyfeMusic.stop();
      });
      musicEl.appendChild(b);
    });

    // ── Location ──
    var locBtn = overlay.querySelector('#stLocBtn');
    var locPicked = overlay.querySelector('#stLocPicked');
    var locVis = overlay.querySelector('#stLocVis');
    var locLabel = overlay.querySelector('#stLocLabel');
    overlay.querySelector('#stLocClear').addEventListener('click', function () {
      if (submitting) return;
      state.location = null; locPicked.hidden = true; locBtn.hidden = false;
    });
    locBtn.addEventListener('click', function () {
      if (submitting) return;
      if (!navigator.geolocation) { errorEl.textContent = 'Location is not available in this browser.'; errorEl.hidden = false; return; }
      locBtn.disabled = true; locBtn.textContent = 'Locating…';
      navigator.geolocation.getCurrentPosition(function (pos) {
        state.location = { lat: String(pos.coords.latitude.toFixed(6)), lng: String(pos.coords.longitude.toFixed(6)) };
        locBtn.hidden = true; locBtn.disabled = submitting; locBtn.textContent = '📍 Add my location';
        locPicked.hidden = false;
      }, function () {
        locBtn.disabled = submitting; locBtn.textContent = '📍 Add my location';
        errorEl.textContent = 'Could not get your location. Please allow access and try again.'; errorEl.hidden = false;
      });
    });

    // ── Member's existing library ──
    fetch(S.MEDIA_ENDPOINT + '?owner=' + encodeURIComponent(me.id))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var items = (data && data.items) || [];
        if (!items.length) { libraryEl.innerHTML = '<p class="so-muted" style="margin:0;font-size:.8rem">Your library is empty — uploads land here.</p>'; return; }
        libraryEl.innerHTML = '<div class="studio-lib-strip">' + items.map(function (it) {
          var css = S.filterCss(it.filter);
          var thumb = it.kind === 'video'
            ? '<video src="' + S.escHtml(it.url) + '#t=0.1" muted style="filter:' + css + '"></video>'
            : '<img src="' + S.escHtml(it.url) + '" alt="" style="filter:' + css + '">';
          return '<button class="studio-lib-item" type="button" data-url="' + S.escHtml(it.url) + '" data-kind="' + S.escHtml(it.kind) + '" data-filter="' + S.escHtml(it.filter) + '">' + thumb + '</button>';
        }).join('') + '</div>';
        if (submitting) {
          Array.prototype.forEach.call(libraryEl.querySelectorAll('button'), function (button) { button.disabled = true; });
        }
        libraryEl.addEventListener('click', function (e) {
          if (submitting) return;
          var b = e.target.closest('.studio-lib-item'); if (!b) return;
          if (S.releaseMediaPreview) S.releaseMediaPreview(state.media);
          state.media = { file: null, kind: b.getAttribute('data-kind'), preview: '', url: b.getAttribute('data-url') };
          state.filter = b.getAttribute('data-filter') || state.filter;
          fileInput.value = '';
          renderStage();
        });
      })
      .catch(function () { libraryEl.innerHTML = ''; });

    // ── Publish ──
    publishBtn.addEventListener('click', function () {
      if (submitting) return;
      var caption = captionEl.value.trim();
      errorEl.hidden = true;
      if (mode === 'reel' && (!state.media || state.media.kind !== 'video')) { errorEl.textContent = 'A reel needs a video.'; errorEl.hidden = false; return; }
      if (mode !== 'reel' && !caption && !state.media) { errorEl.textContent = 'Write something, or choose optional media.'; errorEl.hidden = false; return; }

      // Snapshot the draft before any asynchronous work. All controls stay
      // disabled until the post succeeds or fails, so the uploaded media cannot
      // be published under a different tab/filter/audience.
      var draftMode = mode;
      var draftMedia = state.media;
      var draftFilter = state.filter;
      var draftMusic = state.music;
      var draftVisibility = overlay.querySelector('#stVis').value;
      var draftLocation = state.location
        ? { lat: state.location.lat, lng: state.location.lng, label: locLabel.value.trim(), visibility: locVis.value }
        : null;

      setBusy(true);
      publishBtn.textContent = 'Sharing…';
      var ensureMedia = Promise.resolve(draftMedia);
      // A freshly chosen file is uploaded to the library first.
      if (draftMedia && draftMedia.file) {
        publishBtn.textContent = 'Uploading…';
        ensureMedia = uploadToLibrary(draftMedia.file, me.id, draftFilter, function (percent) {
          publishBtn.textContent = 'Uploading ' + percent + '%';
        }).then(function (d) {
          // Keep the successful library item on the draft. If posting fails,
          // retrying reuses this URL instead of consuming quota with a duplicate.
          draftMedia.file = null;
          draftMedia.kind = d.kind;
          draftMedia.url = d.url;
          return draftMedia;
        });
      }

      ensureMedia.then(function (media) {
        var payload = {
          kind: 'post', postType: draftMode, authorId: me.id, body: caption,
          filter: draftFilter, music: draftMusic, visibility: draftVisibility
        };
        if (media) {
          if (media.kind === 'video') payload.videoUrl = media.url; else payload.imageUrl = media.url;
        }
        if (draftLocation) payload.location = draftLocation;
        return fetch(S.SOCIAL_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      }).then(function (r) {
        return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Could not share'); return d; });
      }).then(function () {
        submitting = false;
        close();
        if (opts.onDone) opts.onDone();
      }).catch(function (err) {
        errorEl.textContent = err.message; errorEl.hidden = false;
        setBusy(false);
        publishBtn.textContent = 'Share';
      });
    });

    renderStage();
  }

  S.openStudio = openStudio;
})();
