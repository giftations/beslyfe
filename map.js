/* Community map: share your location (public / followers / private) and browse
   the places others have shared. Each place renders as an OpenStreetMap embed —
   no API key, no external script, just an iframe per pin. */
(function () {
  var S = window.BeslyfeSocial;
  var idAvatar = document.getElementById('idAvatar');
  var idText = document.getElementById('idText');
  var idChangeBtn = document.getElementById('idChangeBtn');
  var shareBtn = document.getElementById('shareBtn');
  var stopBtn = document.getElementById('stopBtn');
  var locLabel = document.getElementById('locLabel');
  var locVis = document.getElementById('locVis');
  var mapError = document.getElementById('mapError');
  var grid = document.getElementById('mapGrid');
  S.renderNav('map');

  function me() { return S.getIdentity(); }

  function renderIdentity() {
    var id = me();
    if (id) {
      if (id.headshotUrl) idAvatar.outerHTML = '<img class="so-avatar" id="idAvatar" src="' + S.escHtml(id.headshotUrl) + '" alt="">';
      else idAvatar.outerHTML = '<div class="so-avatar placeholder" id="idAvatar">' + S.escHtml(S.initials(id.displayName)) + '</div>';
      idAvatar = document.getElementById('idAvatar');
      idText.innerHTML = '<strong>' + S.escHtml(id.displayName || '(no name)') + '</strong><span>Share your place below</span>';
      idChangeBtn.textContent = 'Switch';
      loadMine();
    } else {
      idText.innerHTML = '<strong>Choose your profile</strong><span>to share your location</span>';
      idChangeBtn.textContent = 'Choose profile';
      stopBtn.hidden = true;
    }
  }

  // OpenStreetMap embed for a coordinate, with a marker — no key needed.
  function mapEmbed(lat, lng) {
    var la = parseFloat(lat), ln = parseFloat(lng);
    if (isNaN(la) || isNaN(ln)) return '';
    var d = 0.01;
    var bbox = (ln - d) + ',' + (la - d) + ',' + (ln + d) + ',' + (la + d);
    return 'https://www.openstreetmap.org/export/embed.html?bbox=' + encodeURIComponent(bbox) + '&layer=mapnik&marker=' + encodeURIComponent(la + ',' + ln);
  }

  var VIS_LABEL = { public: 'Public', followers: 'Followers only', private: 'Private' };

  function loadMine() {
    var id = me(); if (!id) return;
    fetch(S.LOCATIONS_ENDPOINT + '?type=mine&me=' + encodeURIComponent(id.id))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.item) {
          stopBtn.hidden = false;
          locLabel.value = data.item.label || '';
          locVis.value = data.item.visibility || 'public';
          shareBtn.textContent = '📍 Update my location';
        } else {
          stopBtn.hidden = true;
          shareBtn.textContent = '📍 Share my location';
        }
      }).catch(function () {});
  }

  function loadMap() {
    var id = me();
    var q = id ? '?type=map&viewer=' + encodeURIComponent(id.id) : '?type=map';
    fetch(S.LOCATIONS_ENDPOINT + q)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var items = (data && data.items) || [];
        if (!items.length) { grid.innerHTML = '<p class="so-empty">No one has shared a location yet. Be the first!</p>'; return; }
        grid.innerHTML = items.map(function (it) {
          var src = mapEmbed(it.lat, it.lng);
          var place = it.label || (it.lat + ', ' + it.lng);
          return '<div class="map-card">' +
            (src ? '<iframe loading="lazy" src="' + S.escHtml(src) + '"></iframe>' : '') +
            '<div class="mc-body"><h3>' + S.escHtml(it.profile.displayName) + '</h3>' +
            '<p>' + S.escHtml(place) + ' · ' + S.escHtml(VIS_LABEL[it.visibility] || it.visibility) + '</p>' +
            '<p style="margin-top:6px"><a href="https://www.openstreetmap.org/?mlat=' + encodeURIComponent(it.lat) + '&mlon=' + encodeURIComponent(it.lng) + '#map=15/' + encodeURIComponent(it.lat) + '/' + encodeURIComponent(it.lng) + '" target="_blank" rel="noopener" style="color:var(--green)">Open in maps →</a></p>' +
            '</div></div>';
        }).join('');
      }).catch(function () { grid.innerHTML = '<p class="so-empty">Could not load the map.</p>'; });
  }

  shareBtn.addEventListener('click', function () {
    var id = me(); if (!id) { S.openProfilePicker(function () { renderIdentity(); }); return; }
    if (!navigator.geolocation) { mapError.textContent = 'Location is not available in this browser.'; mapError.hidden = false; return; }
    mapError.hidden = true;
    shareBtn.disabled = true; shareBtn.textContent = 'Locating…';
    navigator.geolocation.getCurrentPosition(function (pos) {
      fetch(S.LOCATIONS_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        profileId: id.id, lat: String(pos.coords.latitude.toFixed(6)), lng: String(pos.coords.longitude.toFixed(6)),
        label: locLabel.value.trim(), visibility: locVis.value
      }) }).then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Failed'); }); })
        .then(function () { shareBtn.disabled = false; loadMine(); loadMap(); })
        .catch(function (e) { mapError.textContent = e.message; mapError.hidden = false; shareBtn.disabled = false; shareBtn.textContent = '📍 Share my location'; });
    }, function () {
      shareBtn.disabled = false; shareBtn.textContent = '📍 Share my location';
      mapError.textContent = 'Could not get your location. Please allow access and try again.'; mapError.hidden = false;
    });
  });

  stopBtn.addEventListener('click', function () {
    var id = me(); if (!id) return;
    fetch(S.LOCATIONS_ENDPOINT + '?profileId=' + encodeURIComponent(id.id), { method: 'DELETE' })
      .then(function () { loadMine(); loadMap(); });
  });

  idChangeBtn.addEventListener('click', function () { S.openProfilePicker(function () { renderIdentity(); loadMap(); }); });
  document.addEventListener('beslyfe-identity-change', function () { renderIdentity(); loadMap(); });
  renderIdentity();
  loadMap();
})();
