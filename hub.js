/* Member hub: the post-login home base. Renders the active identity, a
   package-purchase call to action tailored to the member's role (and whether
   their application has been approved), and the floating Create button that
   opens the studio. Relies on window.BaySocial + window.BaySocial.openStudio. */
(function () {
  var S = window.BaySocial;
  var APPLICATIONS_ENDPOINT = '/.netlify/functions/applications';

  var idAvatar = document.getElementById('idAvatar');
  var idText = document.getElementById('idText');
  var idChangeBtn = document.getElementById('idChangeBtn');
  var cta = document.getElementById('packageCta');
  var ctaTitle = document.getElementById('ctaTitle');
  var ctaText = document.getElementById('ctaText');
  var ctaBtn = document.getElementById('ctaBtn');
  var ctaPassword = document.getElementById('ctaPassword');
  var ctaPasswordValue = document.getElementById('ctaPasswordValue');

  S.renderNav('hub');

  function me() { return S.getIdentity(); }

  function renderIdentity() {
    var id = me();
    if (id) {
      if (id.headshotUrl) {
        idAvatar.outerHTML = '<img class="so-avatar" id="idAvatar" src="' + S.escHtml(id.headshotUrl) + '" alt="">';
      } else {
        idAvatar.outerHTML = '<div class="so-avatar placeholder" id="idAvatar">' + S.escHtml(S.initials(id.displayName)) + '</div>';
      }
      idAvatar = document.getElementById('idAvatar');
      idText.innerHTML = '<strong>' + S.escHtml(id.displayName || '(no name)') + '</strong>' +
        '<span>You’re here as ' + S.escHtml(id.role || 'member') + ' · <a href="/profile?id=' + encodeURIComponent(id.id) + '" style="color:var(--green)">view profile</a>' +
        ' · <a href="/profile/edit?id=' + encodeURIComponent(id.id) + '" style="color:var(--green)">edit profile</a></span>';
      idChangeBtn.textContent = 'Switch';
    } else {
      idText.innerHTML = '<strong>Welcome</strong><span>Choose your profile to get started</span>';
      idChangeBtn.textContent = 'Choose profile';
    }
    renderCta();
  }

  // The package CTA is most prominent for vendors and sponsors — the dead-end
  // this build fixes. It also checks the applications endpoint so an approved
  // member can jump straight to their Eventbrite link, while everyone else is
  // pointed at the unlock page.
  function renderCta() {
    var id = me();
    var role = id && id.role;
    if (role !== 'vendor' && role !== 'sponsor') { cta.hidden = true; return; }
    cta.hidden = false;
    var label = role === 'vendor' ? 'Vendor' : 'Sponsor';
    ctaTitle.textContent = 'Buy your ' + label + ' package';
    ctaText.textContent = 'Once your ' + label.toLowerCase() + ' application is approved, your Eventbrite purchase link unlocks here.';
    ctaBtn.textContent = 'Buy your ' + label + ' package →';
    ctaBtn.href = '/packages';
    if (ctaPassword) ctaPassword.hidden = true;

    // The account email (needed to check approval) lives on the account session,
    // not on the lightweight social identity — read it from BaySession.
    var account = (window.BaySession && window.BaySession.get()) || null;
    var email = account && account.email;
    if (!email) return;
    // If the account's email is approved, surface the direct link.
    fetch(APPLICATIONS_ENDPOINT + '?access=1&email=' + encodeURIComponent(email), { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        var packages = (data && data.packages) || [];
        var pkg = packages.find(function (p) { return p.type === role; }) || packages[0];
        // Approved applicants also get the shared Eventbrite access password so
        // they can clear the ticket page's password prompt.
        if (data && data.approved && data.eventbritePassword && ctaPassword && ctaPasswordValue) {
          ctaPasswordValue.textContent = data.eventbritePassword;
          ctaPassword.hidden = false;
        }
        if (pkg && pkg.eventbriteUrl) {
          ctaText.textContent = 'You’re approved! Your secure ' + label + ' purchase link is ready.';
          ctaBtn.textContent = 'Buy on Eventbrite →';
          ctaBtn.href = pkg.eventbriteUrl;
          ctaBtn.target = '_blank';
          ctaBtn.rel = 'noopener noreferrer';
        } else if (data && data.approved) {
          // Approved, but the Eventbrite link isn't configured yet. Reassure the
          // member they're approved rather than implying they still aren't.
          ctaText.textContent = 'You’re approved! Your ' + label + ' purchase link is being finalized and will appear here shortly.';
        }
      })
      .catch(function () { /* leave the generic CTA */ });
  }

  idChangeBtn.addEventListener('click', function () {
    S.openProfilePicker(function () { renderIdentity(); });
  });

  // ── Apply for a position (signed-in members) ──
  // A member can apply for any role straight from their hub. The request carries
  // their session cookie, so the applications function reuses their existing
  // account — no second login, and no "email already exists" dead-end. Admins
  // still approve or deny each application.
  var CONTRACTS = {
    vendor: '/assets/contracts/bakd-on-the-bay-vendor-rules.pdf',
    sponsor: '/assets/contracts/bakd-on-the-bay-sponsor-agreement.pdf',
    speaker: '/assets/contracts/bakd-on-the-bay-speaker-dj-entertainer-agreement.pdf',
    dj: '/assets/contracts/bakd-on-the-bay-speaker-dj-entertainer-agreement.pdf'
  };

  var applyPanel = document.getElementById('applyPanel');
  var applyToggle = document.getElementById('applyToggle');
  var applyBody = document.getElementById('applyBody');
  var applyForm = document.getElementById('applyForm');
  var applyType = document.getElementById('applyType');
  var applyBoothWrap = document.getElementById('applyBoothWrap');
  var applyBooth = document.getElementById('applyBooth');
  var applyPitch = document.getElementById('applyPitch');
  var applyContract = document.getElementById('applyContract');
  var applyContractLink = document.getElementById('applyContractLink');
  var applySignature = document.getElementById('applySignature');
  var applyAccept = document.getElementById('applyAccept');
  var applySubmit = document.getElementById('applySubmit');
  var applyMsg = document.getElementById('applyMsg');

  function account() { return (window.BaySession && window.BaySession.get()) || null; }

  function syncApplyControls() {
    var type = applyType.value;
    if (applyBoothWrap) applyBoothWrap.hidden = type !== 'vendor';
    var contract = CONTRACTS[type];
    if (contract) {
      applyContract.hidden = false;
      applyContractLink.href = contract;
    } else {
      applyContract.hidden = true;
    }
  }

  function renderApplyPanel() {
    // Only signed-in accounts can apply from the hub; guests use the public forms.
    if (!applyPanel) return;
    applyPanel.hidden = !account();
    syncApplyControls();
  }

  if (applyType) applyType.addEventListener('change', syncApplyControls);

  // The apply panel is collapsed by default so it never crowds a member's tools;
  // their open/closed choice is remembered across visits.
  var APPLY_OPEN_KEY = 'bay-apply-open';
  function setApplyOpen(open) {
    if (!applyToggle || !applyBody) return;
    applyBody.hidden = !open;
    applyToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    try { localStorage.setItem(APPLY_OPEN_KEY, open ? '1' : '0'); } catch (e) { /* ignore */ }
  }
  if (applyToggle && applyBody) {
    var startOpen = false;
    try { startOpen = localStorage.getItem(APPLY_OPEN_KEY) === '1'; } catch (e) { /* ignore */ }
    setApplyOpen(startOpen);
    applyToggle.addEventListener('click', function () {
      setApplyOpen(applyBody.hidden);
    });
  }

  if (applyForm) {
    applyForm.addEventListener('submit', function (e) {
      e.preventDefault();
      applyMsg.textContent = '';
      applyMsg.className = 'apply-msg';

      var type = applyType.value;
      var needsContract = !!CONTRACTS[type];
      if (needsContract && (!applySignature.value.trim() || !applyAccept.checked)) {
        applyMsg.textContent = 'Please sign and accept the agreement for this role before submitting.';
        applyMsg.classList.add('err');
        return;
      }

      // Only send what the member typed here; the applications function fills in
      // their name, email and other profile details from their existing account.
      var fields = { description: applyPitch.value.trim() };
      if (type === 'vendor') fields.package = applyBooth.value;
      if (needsContract) {
        fields.contractSignature = applySignature.value.trim();
        fields.contractAccepted = applyAccept.checked ? 'yes' : '';
      }

      applySubmit.disabled = true;
      applySubmit.textContent = 'Submitting…';

      fetch(APPLICATIONS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: type, fields: fields })
      })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (data) {
            if (!res.ok) throw new Error((data && data.error) || ('Submission failed (HTTP ' + res.status + ').'));
            return data;
          });
        })
        .then(function () {
          applyMsg.textContent = 'Application submitted! Our team will review it and let you know.';
          applyMsg.classList.add('ok');
          applyForm.reset();
          syncApplyControls();
        })
        .catch(function (err) {
          applyMsg.textContent = (err && err.message) || 'Something went wrong. Please try again.';
          applyMsg.classList.add('err');
        })
        .finally(function () {
          applySubmit.disabled = false;
          applySubmit.textContent = 'Submit application →';
        });
    });
  }

  var fab = document.getElementById('createFab');
  if (fab) fab.addEventListener('click', function () { S.openStudio({ mode: 'post', onDone: function () { window.location.href = '/feed'; } }); });

  document.addEventListener('bay-identity-change', renderIdentity);
  document.addEventListener('bay-identity-change', renderApplyPanel);
  renderIdentity();
  renderApplyPanel();
})();
