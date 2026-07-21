(function () {
  'use strict';
  var list = document.getElementById('buildList');
  var greeting = document.getElementById('hubGreeting');
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
  function readSession() { try { return JSON.parse(localStorage.getItem('beslyfe_session') || 'null'); } catch (_) { return null; } }
  function renderBuilds(data) {
    var ecosystems = (data.items || []).filter(function (item) { return item.id !== 'beslyfe-network'; });
    var channels = data.growthChannels || [];
    if (!ecosystems.length) {
      list.innerHTML = '<div class="hub-empty"><strong>Your first build starts with questions, not guesswork.</strong><p>Tell Beslyfe what you want to accomplish and it will create a seven-day action workspace.</p><a href="/create">Start a build →</a></div>';
      return;
    }
    list.innerHTML = ecosystems.map(function (item) {
      var active = channels.filter(function (channel) { return channel.ecosystemId === item.id && channel.status === 'active'; }).length;
      return '<article class="build-row"><div><strong>' + esc(item.name) + '</strong><small>' + esc(item.productType || 'ecosystem') + ' · ' + esc(item.primaryOutcome || 'community growth') + '</small><small class="' + (active ? 'growth-live' : '') + '">' + (active ? active + ' growth action' + (active === 1 ? '' : 's') + ' connected' : 'Growth action not connected yet') + '</small></div><a class="build-workspace-link" href="/workspace?ecosystem=' + encodeURIComponent(item.id) + '">Open action workspace →</a></article>';
    }).join('');
  }
  async function boot() {
    var session = readSession();
    if (session && session.account && session.account.name) greeting.textContent = 'Welcome back, ' + session.account.name.split(' ')[0] + '.';
    try {
      var response = await fetch('/.netlify/functions/ecosystems', { credentials: 'same-origin' });
      if (response.status === 401) { window.location.replace('/login?next=/hub'); return; }
      var data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load your hub.');
      renderBuilds(data);
    } catch (error) { list.innerHTML = '<div class="hub-empty">' + esc(error.message) + '</div>'; }
    function mountNotifications() {
      if (window.BeslyfeNotify && window.BeslyfeNotify.mountPanel) window.BeslyfeNotify.mountPanel(document.getElementById('hubNotifications'));
      else setTimeout(mountNotifications, 120);
    }
    mountNotifications();
  }
  boot();
})();
