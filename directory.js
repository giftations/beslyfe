/* Community directory: lists approved profiles from the profiles function and
   filters them by role. Each card links to the single-profile view. */
(function () {
  var ENDPOINT = '/.netlify/functions/profiles';
  var list = document.getElementById('profileList');
  var filterBar = document.getElementById('filterBar');
  var searchInput = document.getElementById('directorySearch');
  var sortSelect = document.getElementById('directorySort');
  var categorySelect = document.getElementById('directoryCategory');
  var summary = document.getElementById('directorySummary');
  var pagination = document.getElementById('directoryPagination');
  // Honour ?role= in the URL so links like /directory?role=dj open pre-filtered.
  var activeRole = new URLSearchParams(window.location.search).get('role') || '';
  var allItems = [];
  var currentPage = 1;
  var pageSize = 12;

  var ROLE_LABELS = { vendor: 'Vendor', sponsor: 'Sponsor', speaker: 'Speaker', dj: 'Entertainment', attendee: 'Attendee' };
  var ROLE_ICONS = { vendor: 'V', sponsor: 'S', speaker: 'EDU', dj: 'DJ', attendee: 'A' };

  function escHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function initials(name) {
    var parts = String(name || '?').trim().split(/\s+/);
    return ((parts[0] || '')[0] || '?').toUpperCase() + ((parts[1] || '')[0] || '').toUpperCase();
  }

  function details(p) { return p.details || {}; }

  function categoryOf(p) {
    var d = details(p);
    return d.category || d.vendorCategory || d.industry || d.genre || d.tier || p.role || 'Community';
  }

  function boothOf(p) {
    var d = details(p);
    return d.booth || d.boothNumber || d.location || '';
  }

  function featured(p) {
    var d = details(p);
    return d.featured === true || d.featured === 'true' || d.featured === 'yes';
  }

  function searchableText(p) {
    return [p.displayName, p.company, p.tagline, p.role, categoryOf(p), boothOf(p)].join(' ').toLowerCase();
  }

  function card(p) {
    var avatar = p.headshotUrl
      ? '<img class="profile-avatar" src="' + escHtml(p.headshotUrl) + '" alt="' + escHtml(p.displayName) + '" loading="lazy">'
      : '<div class="profile-avatar placeholder">' + escHtml(initials(p.displayName)) + '</div>';
    var company = p.company ? '<p class="pc-company">' + escHtml(p.company) + '</p>' : '';
    var tagline = p.tagline ? '<p class="pc-tagline">' + escHtml(p.tagline) + '</p>' : '';
    var category = categoryOf(p);
    var booth = boothOf(p);
    var badges = '<div class="profile-badges">'
      + (featured(p) ? '<span class="profile-badge featured">Featured</span>' : '')
      + (booth ? '<span class="profile-badge">Booth ' + escHtml(booth) + '</span>' : '')
      + '<span class="profile-badge">' + escHtml(category) + '</span>'
      + '</div>';
    return '<a class="bubble profile-card' + (featured(p) ? ' is-featured' : '') + '" href="/profile?id=' + encodeURIComponent(p.id) + '">'
      + '<span class="category-icon">' + escHtml(ROLE_ICONS[p.role] || initials(p.role)) + '</span>'
      + avatar
      + '<span class="role-pill">' + escHtml(ROLE_LABELS[p.role] || p.role) + '</span>'
      + '<h3>' + escHtml(p.displayName || '(no name)') + '</h3>'
      + company + tagline
      + badges
      + '</a>';
  }

  function updateCategories(items) {
    var seen = {};
    items.forEach(function (p) { seen[categoryOf(p)] = true; });
    var current = categorySelect.value;
    categorySelect.innerHTML = '<option value="">All categories</option>' + Object.keys(seen).sort().map(function (c) {
      return '<option value="' + escHtml(c) + '">' + escHtml(c) + '</option>';
    }).join('');
    categorySelect.value = seen[current] ? current : '';
  }

  function filteredItems() {
    var q = (searchInput.value || '').trim().toLowerCase();
    var category = categorySelect.value;
    var items = allItems.filter(function (p) {
      if (category && categoryOf(p) !== category) return false;
      if (q && searchableText(p).indexOf(q) === -1) return false;
      return true;
    });
    var sort = sortSelect.value;
    items.sort(function (a, b) {
      if (sort === 'featured') {
        var f = Number(featured(b)) - Number(featured(a));
        if (f) return f;
      }
      if (sort === 'role') {
        var r = String(a.role || '').localeCompare(String(b.role || ''));
        if (r) return r;
      }
      return String(a.displayName || '').localeCompare(String(b.displayName || ''));
    });
    return items;
  }

  function render() {
    var items = filteredItems();
    var totalPages = Math.max(1, Math.ceil(items.length / pageSize));
    currentPage = Math.min(currentPage, totalPages);
    var start = (currentPage - 1) * pageSize;
    var page = items.slice(start, start + pageSize);
    summary.textContent = items.length + ' profile' + (items.length === 1 ? '' : 's') + ' found';
    if (!page.length) {
      list.innerHTML = '<p class="empty">No profiles match those filters. <a href="/profile/new" style="color:var(--green)">Create a profile</a></p>';
      pagination.hidden = true;
      return;
    }
    list.innerHTML = '<div class="profile-grid">' + page.map(card).join('') + '</div>';
    pagination.hidden = totalPages <= 1;
    pagination.innerHTML = '<button type="button" data-page="prev" ' + (currentPage === 1 ? 'disabled' : '') + '>Previous</button>'
      + '<span>Page ' + currentPage + ' of ' + totalPages + '</span>'
      + '<button type="button" data-page="next" ' + (currentPage === totalPages ? 'disabled' : '') + '>Next</button>';
  }

  async function load() {
    list.innerHTML = '<p class="loading">Loading profiles…</p>';
    try {
      var params = activeRole ? '?role=' + encodeURIComponent(activeRole) : '';
      var res = await fetch(ENDPOINT + params);
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      allItems = data.items || [];
      if (!allItems.length) {
        list.innerHTML = '<p class="empty">No profiles yet. <a href="/profile/new" style="color:var(--green)">Be the first to create one →</a></p>';
        return;
      }
      updateCategories(allItems);
      currentPage = 1;
      render();
    } catch (err) {
      list.innerHTML = '<p class="empty">Could not load the directory: ' + escHtml(err.message) + '</p>';
    }
  }

  filterBar.addEventListener('click', function (e) {
    var btn = e.target.closest('.filter-btn');
    if (!btn) return;
    activeRole = btn.getAttribute('data-role') || '';
    filterBar.querySelectorAll('.filter-btn').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    load();
  });

  [searchInput, sortSelect, categorySelect].forEach(function (control) {
    control.addEventListener('input', function () { currentPage = 1; render(); });
    control.addEventListener('change', function () { currentPage = 1; render(); });
  });

  pagination.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-page]');
    if (!btn) return;
    currentPage += btn.getAttribute('data-page') === 'next' ? 1 : -1;
    render();
    window.scrollTo({ top: filterBar.offsetTop - 90, behavior: 'smooth' });
  });

  // Reflect an initial ?role= filter in the active button state.
  (function syncActiveButton() {
    if (!activeRole) return;
    filterBar.querySelectorAll('.filter-btn').forEach(function (b) {
      b.classList.toggle('active', (b.getAttribute('data-role') || '') === activeRole);
    });
  })();

  load();
})();
