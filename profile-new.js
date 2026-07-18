/* Create-profile page: role-specific extra fields, headshot upload to the
   site-media Blobs function, then submit the profile to the profiles function. */
(function () {
  var MEDIA_ENDPOINT = '/.netlify/functions/site-media';
  var PROFILES_ENDPOINT = '/.netlify/functions/profiles';

  // Extra fields offered per role. Each becomes a key in the profile's
  // free-form `details` map.
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
    vendor: 'Business name',
    sponsor: 'Organization name',
    speaker: 'Organization',
    dj: 'Creator name / studio',
    attendee: 'Project / affiliation'
  };

  var form = document.getElementById('profileForm');
  var roleExtras = document.getElementById('roleExtras');
  var companyLabel = document.getElementById('companyLabel');
  var headshotInput = document.getElementById('headshot');
  var headshotPreview = document.getElementById('headshotPreview');
  var submitBtn = document.getElementById('submitBtn');
  var successMsg = document.getElementById('successMsg');
  var errorMsg = document.getElementById('errorMsg');
  var viewLink = document.getElementById('viewLink');

  // ── Require an account ──
  // A community profile is owned by an account (one is created automatically at
  // sign-up). The public "Create Your Profile" CTA links here, but the profiles
  // API only accepts an authenticated write, so an anonymous visitor's submit
  // would die on a 401 with no explanation. Send them to create an account (or
  // sign in) first, which also sets up their profile.
  function session() {
    try { return JSON.parse(localStorage.getItem('beslyfe_session') || 'null'); } catch (e) { return null; }
  }
  if (!session()) {
    var card = form ? form.closest('.form-card') : null;
    if (card) {
      card.innerHTML =
        '<h2>Create your profile</h2>' +
        '<p class="hint">Your profile lives with your free Beslyfe account. ' +
        'Create an account (or sign in) and your community profile is set up for you — ' +
        'then you can add your photo, bio and role details.</p>' +
        '<div class="submit-area">' +
        '<a class="btn-submit" href="/admin-login.html">Create your account →</a>' +
        '<span class="submit-note">Already have one? <a href="/admin-login.html">Sign in</a>.</span>' +
        '</div>';
    }
    return;
  }

  function currentRole() {
    var checked = form.querySelector('input[name="role"]:checked');
    return checked ? checked.value : 'attendee';
  }

  function renderExtras() {
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
      html += '<div class="field-group"><label for="extra-' + f.name + '">' + f.label + ' <span>(optional)</span></label>';
      if (f.type === 'select') {
        html += '<select id="extra-' + f.name + '" data-detail="' + f.name + '">';
        f.options.forEach(function (o) {
          html += '<option value="' + o + '">' + (o || 'Select…') + '</option>';
        });
        html += '</select>';
      } else {
        html += '<input type="text" id="extra-' + f.name + '" data-detail="' + f.name + '" placeholder="' + (f.placeholder || '') + '">';
      }
      html += '</div>';
    });
    roleExtras.innerHTML = html;
  }

  form.querySelectorAll('input[name="role"]').forEach(function (r) {
    r.addEventListener('change', renderExtras);
  });
  renderExtras();

  headshotInput.addEventListener('change', function () {
    var file = headshotInput.files[0];
    if (!file) { headshotPreview.classList.remove('show'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      headshotPreview.src = reader.result;
      headshotPreview.classList.add('show');
    };
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
    // Resize/compress large photos and PNGs first so the upload reliably fits
    // within the server's limits (shared helper from beslyfe-social.js).
    var prepared = window.BeslyfeSocial && window.BeslyfeSocial.prepareImageForUpload
      ? await window.BeslyfeSocial.prepareImageForUpload(file)
      : { dataBase64: await fileToBase64(file), contentType: file.type, filename: file.name };
    var res = await fetch(MEDIA_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: prepared.filename, contentType: prepared.contentType, dataBase64: prepared.dataBase64 })
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Photo upload failed');
    return data.url;
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    submitBtn.disabled = true;
    submitBtn.textContent = 'Publishing…';
    successMsg.classList.remove('show');
    errorMsg.classList.remove('show');

    try {
      var headshotUrl = '';
      if (headshotInput.files[0]) headshotUrl = await uploadHeadshot(headshotInput.files[0]);

      var details = {};
      roleExtras.querySelectorAll('[data-detail]').forEach(function (el) {
        var v = (el.value || '').trim();
        if (v) details[el.getAttribute('data-detail')] = v;
      });

      var payload = {
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create profile (HTTP ' + res.status + ')');

      if (data.id) viewLink.href = '/profile?id=' + encodeURIComponent(data.id);
      successMsg.classList.add('show');
      form.reset();
      headshotPreview.classList.remove('show');
      renderExtras();
      successMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) {
      console.error('Profile create error:', err);
      errorMsg.textContent = err.message || 'Something went wrong. Please try again.';
      errorMsg.classList.add('show');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Publish Profile →';
    }
  });
})();
