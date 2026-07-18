/* Single profile view: reads ?id= from the URL and renders one profile. */
(function () {
  var ENDPOINT = '/.netlify/functions/profiles';
  var container = document.getElementById('profileDetail');

  function escHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function initials(name) {
    var parts = String(name || '?').trim().split(/\s+/);
    return ((parts[0] || '')[0] || '?').toUpperCase() + ((parts[1] || '')[0] || '').toUpperCase();
  }

  // Set or create a <meta> tag by name (e.g. "description", "twitter:title")
  // or property (e.g. "og:title"), then set its content.
  function setMeta(key, isProperty, content) {
    var attr = isProperty ? 'property' : 'name';
    var el = document.head.querySelector('meta[' + attr + '="' + key + '"]');
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attr, key);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  }

  // Rewrite the page's title/description/OG/Twitter tags to describe a specific
  // profile so links shared to social platforms and search engines are rich,
  // instead of the generic "Community Profile" defaults baked into the HTML.
  function applyProfileMeta(p) {
    var name = p.displayName || 'Community Member';
    var title = name + ' — Beslyfe';
    var descBits = [p.role, p.tagline].filter(Boolean);
    var desc = descBits.length
      ? name + ' — ' + descBits.join(' · ') + ' in the Beslyfe community.'
      : name + ' is part of the Beslyfe community.';
    document.title = title;
    setMeta('description', false, desc);
    setMeta('og:title', true, title);
    setMeta('og:description', true, desc);
    setMeta('og:url', true, window.location.href);
    setMeta('twitter:title', false, title);
    setMeta('twitter:description', false, desc);
    if (p.headshotUrl) {
      setMeta('og:image', true, p.headshotUrl);
      setMeta('twitter:image', false, p.headshotUrl);
    }
  }

  // Friendly labels for the free-form detail keys.
  var DETAIL_LABELS = {
    products: 'Products / services', booth: 'Where to find me', tier: 'Organization focus',
    talkTitle: 'Talk', talkTopic: 'Topic', interests: 'Interests',
    actType: 'Act Type', genre: 'Genre', mixLink: 'Listen'
  };

  function render(p) {
    var avatar = p.headshotUrl
      ? '<img class="detail-avatar" src="' + escHtml(p.headshotUrl) + '" alt="' + escHtml(p.displayName) + '">'
      : '<div class="detail-avatar placeholder">' + escHtml(initials(p.displayName)) + '</div>';

    var html = '<div class="bubble profile-detail">'
      + avatar
      + '<span class="role-pill">' + escHtml(p.role) + '</span>'
      + '<h1>' + escHtml(p.displayName || '(no name)') + '</h1>';
    if (p.company) html += '<p class="detail-company">' + escHtml(p.company) + '</p>';
    if (p.tagline) html += '<p class="detail-company" style="color:var(--muted)">' + escHtml(p.tagline) + '</p>';
    if (p.bio) html += '<p class="detail-bio">' + escHtml(p.bio) + '</p>';

    var details = p.details || {};
    var keys = Object.keys(details);
    if (keys.length) {
      html += '<dl class="detail-extras">';
      keys.forEach(function (k) {
        html += '<dt>' + escHtml(DETAIL_LABELS[k] || k) + '</dt><dd>' + escHtml(details[k]) + '</dd>';
      });
      html += '</dl>';
    }

    if (p.website) {
      var href = /^https?:\/\//i.test(p.website) ? p.website : 'https://' + p.website;
      html += '<a class="detail-link" href="' + escHtml(href) + '" target="_blank" rel="noopener">Visit website →</a>';
    }

    // Owners (and admins) get an Edit button so anyone can update their own
    // profile and photo, and admins can edit any profile.
    if (canEdit(p)) {
      html += '<a class="detail-link" href="/profile/edit?id=' + encodeURIComponent(p.id) + '" style="margin-left:10px">Edit profile ✎</a>';
    }
    html += '</div>';
    container.innerHTML = html;
  }

  // True when the visitor may edit this profile: it is their own active identity,
  // it is the profile linked to their account, or they are signed in as an admin.
  function canEdit(p) {
    try {
      var session = JSON.parse(localStorage.getItem('beslyfe_session') || 'null');
      if (session && session.role === 'admin') return true;
      if (session && session.profileId === p.id) return true;
    } catch (e) {}
    var me = window.BeslyfeSocial && window.BeslyfeSocial.getIdentity && window.BeslyfeSocial.getIdentity();
    return !!(me && me.id === p.id);
  }

  async function load() {
    var id = new URLSearchParams(window.location.search).get('id');
    if (!id) { container.innerHTML = '<p class="empty">No profile specified.</p>'; return; }
    try {
      var res = await fetch(ENDPOINT + '?id=' + encodeURIComponent(id));
      var data = await res.json();
      if (res.status === 404) { container.innerHTML = '<p class="empty">This profile could not be found.</p>'; return; }
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      render(data.item);
      document.title = (data.item.displayName || 'Profile') + ' — Beslyfe';
      applyProfileMeta(data.item);
      initSocial(data.item);
    } catch (err) {
      container.innerHTML = '<p class="empty">Could not load this profile: ' + escHtml(err.message) + '</p>';
    }
  }

  // ── Social layer: follower stats, a follow button, and this profile's posts ──
  function initSocial(profile) {
    var S = window.BeslyfeSocial;
    if (!S) return;
    var me = S.getIdentity();

    var social = document.createElement('div');
    social.className = 'profile-social';
    social.innerHTML =
      '<div class="profile-stats" id="pStats"><span><b>–</b>posts</span><span><b>–</b>followers</span><span><b>–</b>following</span></div>' +
      '<div id="pFollowWrap"></div>';
    var detail = container.querySelector('.profile-detail');
    (detail || container).appendChild(social);

    var statsEl = social.querySelector('#pStats');
    var followWrap = social.querySelector('#pFollowWrap');

    function renderFollowButton(stats) {
      if (me && me.id === profile.id) {
        followWrap.innerHTML = '<a class="so-btn ghost" href="/feed">Share an update →</a>';
        return;
      }
      var following = stats && stats.isFollowing;
      followWrap.innerHTML = '<button class="so-btn ' + (following ? 'ghost' : '') + '" id="followBtn">' +
        (following ? 'Following ✓' : 'Follow') + '</button>' +
        '<a class="so-btn ghost" id="messageBtn" href="/messages?to=' + encodeURIComponent(profile.id) + '">Message</a>';
      var btn = followWrap.querySelector('#followBtn');
      btn.addEventListener('click', async function () {
        var who = S.getIdentity();
        if (!who) { S.openProfilePicker(function () { refreshStats(); }); return; }
        if (who.id === profile.id) return;
        btn.disabled = true;
        var isFollowing = btn.textContent.indexOf('Following') >= 0;
        try {
          var r = isFollowing
            ? await fetch(S.SOCIAL_ENDPOINT + '?kind=follow&followerId=' + encodeURIComponent(who.id) + '&followeeId=' + encodeURIComponent(profile.id), { method: 'DELETE' })
            : await fetch(S.SOCIAL_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'follow', followerId: who.id, followeeId: profile.id }) });
          var d = await r.json();
          if (!r.ok) throw new Error(d.error || 'Failed');
          refreshStats();
        } catch (e) { btn.disabled = false; }
      });
      // Messaging requires a signed-in identity; route guests to sign in first.
      var msgBtn = followWrap.querySelector('#messageBtn');
      if (msgBtn) {
        msgBtn.addEventListener('click', function (e) {
          var who = S.getIdentity();
          if (!who) { e.preventDefault(); window.location.href = '/admin-login.html'; }
        });
      }
    }

    async function refreshStats() {
      var who = S.getIdentity();
      var q = '?type=stats&profileId=' + encodeURIComponent(profile.id) + (who ? '&viewer=' + encodeURIComponent(who.id) : '');
      try {
        var res = await fetch(S.SOCIAL_ENDPOINT + q);
        var s = await res.json();
        statsEl.innerHTML = '<span><b>' + s.posts + '</b>posts</span><span><b>' + s.followers + '</b>followers</span><span><b>' + s.following + '</b>following</span>';
        renderFollowButton(s);
      } catch (e) { /* leave defaults */ }
    }

    async function loadPosts() {
      var wrap = document.getElementById('profilePosts');
      if (!wrap) return;
      var who = S.getIdentity();
      var q = '?type=feed&author=' + encodeURIComponent(profile.id) + (who ? '&viewer=' + encodeURIComponent(who.id) : '');
      try {
        var res = await fetch(S.SOCIAL_ENDPOINT + q);
        var data = await res.json();
        var items = data.items || [];
        if (!items.length) { wrap.innerHTML = ''; return; }
        var html = '<h3>Posts</h3><div class="so-feed">';
        html += items.map(function (p) {
          var fcss = (S.filterCss && S.filterCss(p.filter)) || '';
          var media = '';
          if (p.videoUrl) media = '<video class="so-post-img" src="' + S.escHtml(p.videoUrl) + '" controls playsinline preload="metadata" style="filter:' + fcss + '"></video>';
          else if (p.imageUrl) media = '<img class="so-post-img" src="' + S.escHtml(p.imageUrl) + '" alt="" loading="lazy" style="filter:' + fcss + '">';
          var body = p.body ? '<div class="so-post-body">' + S.escHtml(p.body) + '</div>' : '';
          var badge = (p.postType && p.postType !== 'post') ? '<span class="so-role-pill">' + S.escHtml(p.postType) + '</span>' : '';
          return '<article class="so-post">' +
            '<div class="so-post-head">' + S.avatar(p.author) +
            '<div class="so-name">' + S.escHtml(p.author.displayName) + badge +
            '<div class="so-sub">' + S.timeAgo(p.createdAt) + '</div></div></div>' +
            body + media +
            '<div class="so-post-actions"><span class="so-action">♥ ' + p.likeCount + '</span>' +
            '<span class="so-action">💬 ' + p.commentCount + '</span></div></article>';
        }).join('');
        html += '</div>';
        wrap.innerHTML = html;
      } catch (e) { wrap.innerHTML = ''; }
    }

    refreshStats();
    loadPosts();
    document.addEventListener('beslyfe-identity-change', function () { refreshStats(); loadPosts(); });
  }

  load();
})();
