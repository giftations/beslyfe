/* Edit-profile page. Lets a member update their own community profile (the one
   linked to their account) and lets an admin edit any profile by passing ?id=.
   Reuses the same role-specific extras as the create-profile page, uploads a new
   photo to the shared site-media library, and saves via PUT to the profiles
   function. The headshot upload is resized/compressed first (shared helper in
   beslyfe-social.js) so large photos and PNGs upload reliably. */
(function () {
  var MEDIA_ENDPOINT = '/.netlify/functions/site-media';
  var PROFILES_ENDPOINT = '/.netlify/functions/profiles';
  var SESSION_KEY = 'beslyfe_session';
  var IDENTITY_KEY = 'beslyfe_active_profile';

  // Extra fields offered per role — mirrors profile-new.js so the editor exposes
  // the same details an account can set when first creating its profile.
  var ROLE_EXTRAS = {
    vendor: [
      { name: 'products', label: 'Products / services', type: 'text', placeholder: 'What can people buy or book?' },
      { name: 'booth', label: 'Where to find you', type: 'text', placeholder: 'Website, city, or online storefront' }
    ],
    sponsor: [
      { name: 'tier', label: 'Organization focus', type: 'text', placeholder: 'Mission, members, or community served' }
    ],
    speaker: [
      { name: 'talkTitle', label: 'How you can help', type: 'text', placeholder: 'Mentoring, teaching, advising, or coaching' },
      { name: 'talkTopic', label: 'Areas of expertise', type: 'text', placeholder: 'What do you know well?' }
    ],
    dj: [
      { name: 'actType', label: 'Creator type', type: 'select', options: ['', 'Video', 'Music', 'Writing', 'Design', 'Other'] },
      { name: 'genre', label: 'Style / topics', type: 'text', placeholder: 'What do you create about?' },
      { name: 'mixLink', label: 'Work link', type: 'text', placeholder: 'Portfolio or social link' }
    ],
    attendee: [
      { name: 'interests', label: 'Interests and goals', type: 'text', placeholder: 'What are you building, learning, or looking for?' }
    ]
  };

  var COMPANY_LABELS = {
    vendor: 'Business name', sponsor: 'Organization name', speaker: 'Organization',
    dj: 'Creator name / studio', attendee: 'Project / affiliation'
  };

  var form = document.getElementById('profileForm');
  var roleExtras = document.getElementById('roleExtras');
  var adminExtras = document.getElementById('adminExtras');
  var companyLabel = document.getElementById('companyLabel');
  var headshotInput = document.getElementById('headshot');
  var headshotPreview = document.getElementById('headshotPreview');
  var submitBtn = document.getElementById('submitBtn');
  var successMsg = document.getElementById('successMsg');
  var errorMsg = document.getElementById('errorMsg');
  var viewLink = document.getElementById('viewLink');

  function session() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; }
  }
  function identity() {
    try { return JSON.parse(localStorage.getItem(IDENTITY_KEY) || 'null'); } catch (e) { return null; }
  }
  function isAdmin() { var s = session(); return !!(s && s.role === 'admin'); }

  var s = session();
  var isLoggedIn = !!s;
  var current = null;          // the profile being edited
  var existingHeadshot = '';   // the saved headshot url (kept if no new upload)

  // ── Header links ──
  var logoutLink = document.getElementById('logoutLink');
  if (logoutLink && isLoggedIn) {
    logoutLink.hidden = false;
    logoutLink.addEventListener('click', function (e) {
      e.preventDefault();
      try { localStorage.removeItem(SESSION_KEY); localStorage.removeItem(IDENTITY_KEY); } catch (err) {}
      window.location.href = '/';
    });
  }
  if (isAdmin()) {
    var dash = document.getElementById('dashboardLink');
    if (dash) { dash.textContent = 'Admin Dashboard'; dash.href = '/admin'; }
  }
  document.getElementById('backLink').addEventListener('click', function (e) {
    e.preventDefault();
    if (history.length > 1) history.back(); else window.location.href = '/hub';
  });

  function currentRole() {
    var checked = form.querySelector('input[name="role"]:checked');
    return checked ? checked.value : 'attendee';
  }

  // Fully escape a value destined for an HTML attribute (all five significant
  // characters, not just the double quote) so saved profile details can never
  // break out of the value="…" context.
  function escAttr(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function renderExtras(details) {
    var role = currentRole();
    companyLabel.textContent = COMPANY_LABELS[role] || 'Company';
    var extras = ROLE_EXTRAS[role] || [];
    if (!extras.length) { roleExtras.innerHTML = ''; return; }
    var html = '<div class="form-section-label">' + role.charAt(0).toUpperCase() + role.slice(1) + ' Details</div>';
    extras.forEach(function (f) {
      if (f.type === 'note') {
        html += '<p style="color:var(--muted);font-size:.9rem;margin:0 0 10px">' + f.text + '</p>';
        return;
      }
      var val = (details && details[f.name]) || '';
      html += '<div class="field-group"><label for="extra-' + f.name + '">' + f.label + ' <span>(optional)</span></label>';
      if (f.type === 'select') {
        html += '<select id="extra-' + f.name + '" data-detail="' + f.name + '">';
        f.options.forEach(function (o) {
          html += '<option value="' + o + '"' + (o === val ? ' selected' : '') + '>' + (o || 'Select…') + '</option>';
        });
        html += '</select>';
      } else {
        html += '<input type="text" id="extra-' + f.name + '" data-detail="' + f.name + '" value="' + escAttr(val) + '" placeholder="' + (f.placeholder || '') + '">';
      }
      html += '</div>';
    });
    roleExtras.innerHTML = html;
  }

  form.querySelectorAll('input[name="role"]').forEach(function (r) {
    r.addEventListener('change', function () { renderExtras(current && current.details); });
  });

  headshotInput.addEventListener('change', function () {
    var file = headshotInput.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () { headshotPreview.src = reader.result; headshotPreview.classList.add('show'); };
    reader.readAsDataURL(file);
  });

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result).split(',')[1]); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function uploadHeadshot(file) {
    var prepared = window.BeslyfeSocial && window.BeslyfeSocial.prepareImageForUpload
      ? await window.BeslyfeSocial.prepareImageForUpload(file)
      : { dataBase64: await fileToBase64(file), contentType: file.type, filename: file.name };
    var res = await fetch(MEDIA_ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: prepared.filename, contentType: prepared.contentType, dataBase64: prepared.dataBase64 })
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Photo upload failed');
    return data.url;
  }

  function setField(id, value) { var el = document.getElementById(id); if (el) el.value = value || ''; }

  function populate(p) {
    current = p;
    existingHeadshot = p.headshotUrl || '';
    var roleRadio = form.querySelector('input[name="role"][value="' + p.role + '"]');
    if (roleRadio) roleRadio.checked = true;
    setField('displayName', p.displayName);
    setField('email', p.email);
    setField('company', p.company);
    setField('website', p.website);
    setField('tagline', p.tagline);
    setField('bio', p.bio);
    if (p.headshotUrl) { headshotPreview.src = p.headshotUrl; headshotPreview.classList.add('show'); }
    renderExtras(p.details);
    renderAdminExtras(p);
    document.title = 'Edit ' + (p.displayName || 'Profile') + ' — Beslyfe';
  }

  // Admin-only controls. Featured profiles may be promoted by Beslyfe-owned
  // discovery surfaces; members still control their descriptive fields.
  function renderAdminExtras(p) {
    if (!isAdmin()) { adminExtras.innerHTML = ''; return; }
    var d = p.details || {};
    var featured = d.featured === 'true' || d.featured === true;
    var html =
      '<div class="form-section-label">Admin</div>' +
      '<div class="field-group" style="flex-direction:row;align-items:center;gap:10px">' +
        '<input type="checkbox" id="featuredToggle" style="width:auto;margin:0"' + (featured ? ' checked' : '') + '>' +
        '<label for="featuredToggle" style="margin:0">Feature this profile on the homepage</label>' +
      '</div>';
    adminExtras.innerHTML = html;
  }

  async function load() {
    var paramId = new URLSearchParams(window.location.search).get('id');
    var me = identity();
    var ownId = (me && me.id) || (s && s.profileId) || '';
    var targetId = paramId || ownId;

    if (!targetId) {
      errorMsg.textContent = 'No profile to edit. Please sign in or create a profile first.';
      errorMsg.classList.add('show');
      submitBtn.disabled = true;
      return;
    }
    // A member may only edit their own profile; admins may edit anyone.
    if (paramId && paramId !== ownId && !isAdmin()) {
      errorMsg.textContent = 'You can only edit your own profile.';
      errorMsg.classList.add('show');
      submitBtn.disabled = true;
      return;
    }

    try {
      var res = await fetch(PROFILES_ENDPOINT + '?id=' + encodeURIComponent(targetId));
      var data = await res.json();
      if (!res.ok) throw new Error((data && data.error) || 'Could not load this profile.');
      populate(data.item);
    } catch (err) {
      errorMsg.textContent = err.message || 'Could not load this profile.';
      errorMsg.classList.add('show');
      submitBtn.disabled = true;
    }
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!current) return;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving…';
    successMsg.classList.remove('show');
    errorMsg.classList.remove('show');

    try {
      var headshotUrl = existingHeadshot;
      if (headshotInput.files[0]) {
        submitBtn.textContent = 'Uploading photo…';
        headshotUrl = await uploadHeadshot(headshotInput.files[0]);
      }

      var details = {};
      roleExtras.querySelectorAll('[data-detail]').forEach(function (el) {
        var v = (el.value || '').trim();
        if (v) details[el.getAttribute('data-detail')] = v;
      });
      // Preserve the admin-only featured flag.
      var featuredEl = document.getElementById('featuredToggle');
      if (featuredEl) details.featured = featuredEl.checked ? 'true' : 'false';
      else if (current.details && current.details.featured !== undefined) details.featured = current.details.featured;
      var payload = {
        id: current.id,
        role: currentRole(),
        displayName: document.getElementById('displayName').value.trim(),
        email: document.getElementById('email').value.trim(),
        company: document.getElementById('company').value.trim(),
        tagline: document.getElementById('tagline').value.trim(),
        bio: document.getElementById('bio').value.trim(),
        website: document.getElementById('website').value.trim(),
        headshotUrl: headshotUrl,
        details: details
      };

      var res = await fetch(PROFILES_ENDPOINT, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      var data = await res.json();
      if (!res.ok) throw new Error((data && data.error) || 'Could not save (HTTP ' + res.status + ')');

      var saved = data.item || payload;
      // If this is the signed-in member's own profile, refresh the cached
      // identity so their new photo/name appear everywhere immediately.
      var me = identity();
      if (me && me.id === saved.id) {
        var slim = { id: saved.id, displayName: saved.displayName || me.displayName, role: saved.role || me.role, headshotUrl: saved.headshotUrl || '' };
        localStorage.setItem(IDENTITY_KEY, JSON.stringify(slim));
        try { document.dispatchEvent(new CustomEvent('beslyfe-identity-change', { detail: slim })); } catch (err) {}
      }

      viewLink.href = '/profile?id=' + encodeURIComponent(saved.id);
      successMsg.classList.add('show');
      successMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) {
      errorMsg.textContent = err.message || 'Something went wrong. Please try again.';
      errorMsg.classList.add('show');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save Changes →';
    }
  });

  load();
})();
