/* Reels: a vertical player of short community videos. Each reel auto-plays
   (muted) when it scrolls into view; the member can like it and, when the reel
   has a chosen royalty-free track, toggle the synthesised music on. */
(function () {
  var S = window.BaySocial;
  var reelsEl = document.getElementById('reels');
  S.renderNav('reels');

  function me() { return S.getIdentity(); }

  function card(p) {
    var css = S.filterCss(p.filter);
    var authorLink = '/profile?id=' + encodeURIComponent(p.author.id || '');
    var music = p.music ? '<div class="reel-music">♪ ' + S.escHtml((window.BayMusic && window.BayMusic.trackName(p.music)) || p.music) + ' · tap to play</div>' : '';
    var cap = p.body ? '<div class="reel-cap">' + S.escHtml(p.body) + '</div>' : '';
    return '<div class="reel-card" data-id="' + S.escHtml(p.id) + '" data-music="' + S.escHtml(p.music || '') + '">' +
      '<video src="' + S.escHtml(p.videoUrl) + '" muted loop playsinline preload="metadata" style="filter:' + css + '"></video>' +
      '<div class="reel-actions">' +
        '<button class="reel-like ' + (p.liked ? 'liked' : '') + '" data-id="' + S.escHtml(p.id) + '" title="Like">' + (p.liked ? '♥' : '♡') + '<small class="lc">' + p.likeCount + '</small></button>' +
      '</div>' +
      '<div class="reel-overlay">' +
        '<div class="reel-author"><a href="' + authorLink + '">' + S.avatar(p.author, 'so-avatar sm') + '</a>' +
        '<a href="' + authorLink + '">' + S.escHtml(p.author.displayName) + '</a></div>' +
        cap + music +
      '</div></div>';
  }

  function load() {
    var id = me();
    var q = '?type=reels' + (id ? '&viewer=' + encodeURIComponent(id.id) : '');
    fetch(S.SOCIAL_ENDPOINT + q)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var items = (data && data.items) || [];
        if (!items.length) { reelsEl.innerHTML = '<p class="so-empty">No reels yet. Be the first — tap + to create one.</p>'; return; }
        reelsEl.innerHTML = items.map(card).join('');
        wire();
      })
      .catch(function (e) { reelsEl.innerHTML = '<p class="so-empty">Could not load reels.</p>'; });
  }

  var io = null;              // the current IntersectionObserver (disconnected before each rewire)
  var clickBound = false;    // the container click listener is bound exactly once

  function wire() {
    // Auto-play the reel nearest the centre of the viewport. Disconnect any
    // previous observer first so reloads don't stack observers on old nodes.
    if (io) { io.disconnect(); io = null; }
    var vids = reelsEl.querySelectorAll('video');
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          var v = en.target;
          if (en.isIntersecting && en.intersectionRatio > 0.6) { v.play().catch(function () {}); }
          else { v.pause(); }
        });
      }, { threshold: [0, 0.6, 1] });
      vids.forEach(function (v) { io.observe(v); });
    } else {
      vids.forEach(function (v) { v.play().catch(function () {}); });
    }

    // Bind the (delegated) click handler once — reelsEl persists across reloads,
    // so re-adding it every wire() made a single tap fire N like requests.
    if (!clickBound) {
      clickBound = true;
      reelsEl.addEventListener('click', function (e) {
        var likeBtn = e.target.closest('.reel-like');
        if (likeBtn) return toggleLike(likeBtn);
        var c = e.target.closest('.reel-card');
        if (c && window.BayMusic) {
          var mid = c.getAttribute('data-music');
          if (mid) { if (window.BayMusic._playing === mid) window.BayMusic.stop(); else window.BayMusic.play(mid); }
        }
      });
    }
  }

  function toggleLike(btn) {
    var id = me();
    if (!id) { S.openProfilePicker(function () { load(); }); return; }
    var postId = btn.getAttribute('data-id');
    var liked = btn.classList.contains('liked');
    btn.disabled = true;
    var req = liked
      ? fetch(S.SOCIAL_ENDPOINT + '?kind=like&postId=' + encodeURIComponent(postId) + '&profileId=' + encodeURIComponent(id.id), { method: 'DELETE' })
      : fetch(S.SOCIAL_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'like', postId: postId, profileId: id.id }) });
    req.then(function (r) { return r.json(); }).then(function (d) {
      btn.classList.toggle('liked', d.liked);
      btn.childNodes[0].nodeValue = d.liked ? '♥' : '♡';
      var lc = btn.querySelector('.lc'); if (lc) lc.textContent = d.likeCount;
    }).catch(function () {}).finally(function () { btn.disabled = false; });
  }

  var fab = document.getElementById('createFab');
  if (fab) fab.addEventListener('click', function () { S.openStudio({ mode: 'reel', onDone: load }); });

  document.addEventListener('bay-identity-change', load);
  load();
})();
