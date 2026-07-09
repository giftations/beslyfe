/* Stories: 24-hour moments grouped into a ring of bubbles by author. Tapping a
   bubble opens a full-screen viewer that steps through that author's stories. */
(function () {
  var S = window.BaySocial;
  var row = document.getElementById('stories');
  S.renderNav('stories');

  var grouped = [];

  function me() { return S.getIdentity(); }

  function bubble(g) {
    var a = g.author;
    var av = a.headshotUrl
      ? '<img src="' + S.escHtml(a.headshotUrl) + '" alt="">'
      : '<div class="ph">' + S.escHtml(S.initials(a.displayName)) + '</div>';
    return '<button class="story-bubble" data-author="' + S.escHtml(a.id) + '"><div class="story-ring">' + av + '</div><span>' + S.escHtml(a.displayName) + '</span></button>';
  }

  function load() {
    fetch(S.SOCIAL_ENDPOINT + '?type=stories')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var items = (data && data.items) || [];
        // Group consecutive stories by author, newest authors first.
        var map = {}; var order = [];
        items.forEach(function (p) {
          var aid = p.author.id || '';
          if (!map[aid]) { map[aid] = { author: p.author, stories: [] }; order.push(aid); }
          map[aid].stories.push(p);
        });
        grouped = order.map(function (aid) { return map[aid]; });
        if (!grouped.length) { row.innerHTML = '<p class="so-empty">No stories yet. Tap + to share the first.</p>'; return; }
        row.innerHTML = grouped.map(bubble).join('');
      })
      .catch(function () { row.innerHTML = '<p class="so-empty">Could not load stories.</p>'; });
  }

  row.addEventListener('click', function (e) {
    var b = e.target.closest('.story-bubble'); if (!b) return;
    var aid = b.getAttribute('data-author');
    var g = grouped.find(function (x) { return (x.author.id || '') === aid; });
    if (g) openViewer(g.stories, 0);
  });

  function openViewer(stories, start) {
    var i = start || 0;
    var viewer = document.createElement('div');
    viewer.className = 'story-viewer';
    document.body.appendChild(viewer);
    var timer = null;

    function render() {
      if (i < 0) i = 0;
      if (i >= stories.length) { close(); return; }
      var p = stories[i];
      var css = S.filterCss(p.filter);
      var media = p.videoUrl
        ? '<video src="' + S.escHtml(p.videoUrl) + '" autoplay playsinline controls style="filter:' + css + '"></video>'
        : (p.imageUrl ? '<img src="' + S.escHtml(p.imageUrl) + '" alt="" style="filter:' + css + '">' : '<div style="padding:60px;color:#fff">' + S.escHtml(p.body) + '</div>');
      var cap = p.body && (p.imageUrl || p.videoUrl) ? '<div class="sv-cap">' + S.escHtml(p.body) + '</div>' : '';
      viewer.innerHTML =
        '<button class="sv-close" aria-label="Close">&times;</button>' +
        '<div class="sv-card">' +
          '<div class="sv-meta">' + S.avatar(p.author, 'so-avatar sm') + '<span>' + S.escHtml(p.author.displayName) + '</span>' +
          '<span style="margin-left:auto;font-weight:500;font-size:.78rem;opacity:.8">' + S.timeAgo(p.createdAt) + '</span></div>' +
          media + cap +
          '<div style="position:absolute;inset:0;display:flex">' +
            '<button class="sv-prev" style="flex:1;background:none;border:none;cursor:pointer"></button>' +
            '<button class="sv-next" style="flex:1;background:none;border:none;cursor:pointer"></button>' +
          '</div>' +
        '</div>';
      viewer.querySelector('.sv-close').addEventListener('click', close);
      viewer.querySelector('.sv-prev').addEventListener('click', function () { i--; render(); });
      viewer.querySelector('.sv-next').addEventListener('click', function () { i++; render(); });
      // Auto-advance images after 5s (videos advance via their own length is left to the viewer).
      if (timer) clearTimeout(timer);
      if (!p.videoUrl) timer = setTimeout(function () { i++; render(); }, 5000);
    }
    function close() { if (timer) clearTimeout(timer); viewer.remove(); }
    viewer.addEventListener('click', function (e) { if (e.target === viewer) close(); });
    render();
  }

  var fab = document.getElementById('createFab');
  if (fab) fab.addEventListener('click', function () { S.openStudio({ mode: 'story', onDone: load }); });

  load();
})();
