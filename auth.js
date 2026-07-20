/* Account auth for Beslyfe.
   Talks to the /auth function: one account = one password = one community
   profile. Signing in stores the account session (`beslyfe_session`) and also sets
   the active social identity (`beslyfe_active_profile`) to the account's linked
   profile, so the member can immediately post, comment, follow and message as
   themselves — no separate "choose a profile" step. */
(function () {
  var AUTH_ENDPOINT = '/.netlify/functions/auth';
  // Beslyfe-owned browser state mirrors the authoritative server session.
  var SESSION_KEY = 'beslyfe_session';
  var IDENTITY_KEY = 'beslyfe_active_profile';

  // Persist the signed-in account and mirror its profile into the social
  // identity slot that beslyfe-social.js reads.
  function storeSession(account, profile) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      id: account.id,
      name: account.name,
      email: account.email,
      role: account.role,
      profileId: account.profileId || (profile && profile.id) || ''
    }));
    if (profile && profile.id) {
      var slim = {
        id: profile.id,
        displayName: profile.displayName || account.name || '',
        role: profile.role || '',
        headshotUrl: profile.headshotUrl || ''
      };
      localStorage.setItem(IDENTITY_KEY, JSON.stringify(slim));
      try { document.dispatchEvent(new CustomEvent('beslyfe-identity-change', { detail: slim })); } catch (e) {}
    }
  }

  async function callAuth(payload) {
    var res = await fetch(AUTH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    var data = {};
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) {
      var err = new Error(data.error || ('Request failed (HTTP ' + res.status + ')'));
      err.data = data;
      throw err;
    }
    return data;
  }

  function requestedNextPath() {
    var value = new URLSearchParams(window.location.search).get('next') || '';
    if (!value || value.charAt(0) !== '/' || value.indexOf('//') === 0 || value.indexOf('\\') !== -1) return '';
    try {
      var parsed = new URL(value, window.location.origin);
      if (parsed.origin !== window.location.origin) return '';
      if (/^\/(?:login|sign-in|signup|join)(?:\/|$)/.test(parsed.pathname)) return '';
      return parsed.pathname + parsed.search + parsed.hash;
    } catch (e) { return ''; }
  }

  function redirectFor(account) {
    if (account.role === 'admin') return '/admin/';
    return requestedNextPath() || '/hub';
  }

  // Render a "Resend verification email" action beneath a sign-in error when the
  // account exists but its address is unconfirmed. Posts resend-verification and
  // always reports the same generic outcome (the server does too), so it never
  // reveals whether the address has an account.
  function offerResend(email, container) {
    if (!container || container.querySelector('.resend-verify')) return;
    var link = document.createElement('button');
    link.type = 'button';
    link.className = 'resend-verify';
    link.textContent = 'Resend verification email';
    link.style.cssText = 'display:block;margin-top:8px;background:none;border:none;padding:0;color:inherit;text-decoration:underline;cursor:pointer;font:inherit';
    link.addEventListener('click', function () {
      link.disabled = true;
      link.textContent = 'Sending…';
      callAuth({ action: 'resend-verification', email: email })
        .then(function (data) {
          link.replaceWith(document.createTextNode((data && data.message) || 'If that email needs verifying, a new link is on its way.'));
        })
        .catch(function (e) {
          link.disabled = false;
          link.textContent = 'Resend verification email';
        });
    });
    container.appendChild(link);
  }

  // ── Tab switching ──
  var signinTabBtn = document.getElementById('signinTab');
  var createTabBtn = document.getElementById('createTab');
  if (signinTabBtn) signinTabBtn.addEventListener('click', function () { showTab('signin'); });
  if (createTabBtn) createTabBtn.addEventListener('click', function () { showTab('create'); });

  function showTab(tab) {
    var isSignin = tab === 'signin';
    var signinTab = document.getElementById('signinTab');
    var createTab = document.getElementById('createTab');
    var signinForm = document.getElementById('signinForm');
    var createForm = document.getElementById('createForm');
    if (signinTab) signinTab.classList.toggle('active', isSignin);
    if (createTab) createTab.classList.toggle('active', !isSignin);
    if (signinForm) signinForm.classList.toggle('hidden', !isSignin);
    if (createForm) createForm.classList.toggle('hidden', isSignin);
  }

  // Clean public routes use /signup?mode=create while /login defaults to sign
  // in. Keeping one form avoids two authentication implementations drifting.
  var authPath = window.location.pathname.replace(/\/+$/, '') || '/';
  var requestedMode = new URLSearchParams(window.location.search).get('mode');
  if (authPath === '/signup' || authPath === '/join' || requestedMode === 'create' || requestedMode === 'signup' || requestedMode === 'join') {
    showTab('create');
  }

  // Readiness contains booleans only—never secret values. It prevents a visitor
  // from creating an account that cannot receive its required verification.
  fetch(AUTH_ENDPOINT + '?action=readiness', { headers: { Accept: 'application/json' } })
    .then(function (res) { return res.ok ? res.json() : {}; })
    .then(function (ready) {
      var notice = document.getElementById('setupNotice');
      if (!notice) return;
      var messages = [];
      if (ready.memberSignupReady === false) messages.push('New-account email verification is temporarily unavailable. Existing members can still sign in.');
      var adminIntent = authPath === '/admin/login' || new URLSearchParams(window.location.search).get('admin') === '1';
      if (adminIntent && ready.adminAccessReady === false) messages.push('Administrator access still needs its secure production password configured.');
      if (!messages.length) return;
      notice.textContent = messages.join(' ');
      notice.hidden = false;
      if (ready.memberSignupReady === false) {
        var createButton = createForm && createForm.querySelector('button[type="submit"]');
        if (createButton) { createButton.disabled = true; createButton.textContent = 'Free signup temporarily unavailable'; }
      }
    })
    .catch(function () { /* The forms still report server errors normally. */ });

  // ── Sign In ──
  var signinForm = document.getElementById('signinForm');
  if (signinForm) {
    signinForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var identifier = document.getElementById('signinEmail').value.trim();
      var password = document.getElementById('signinPassword').value;
      var errorEl = document.getElementById('signinError');
      var btn = signinForm.querySelector('button[type="submit"]');
      errorEl.textContent = '';
      if (btn) { btn.disabled = true; btn.textContent = 'Signing in…'; }

      callAuth({ action: 'login', identifier: identifier, email: identifier, password: password })
        .then(function (data) {
          storeSession(data.account, data.profile);
          window.location.href = redirectFor(data.account);
        })
        .catch(function (err) {
          errorEl.textContent = err.message;
          // If the account exists but hasn't confirmed its email, offer a one-tap
          // way to resend the verification link (only when the identifier is an
          // email address the link can be sent to).
          if (err.data && err.data.needsVerification && identifier.indexOf('@') !== -1) {
            offerResend(identifier, errorEl);
          }
          if (btn) { btn.disabled = false; btn.textContent = 'Sign In'; }
        });
    });
  }

  // ── Create Account ──
  var createForm = document.getElementById('createForm');
  if (createForm) {
    createForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = document.getElementById('createName').value.trim();
      var email = document.getElementById('createEmail').value.trim();
      var usernameEl = document.getElementById('createUsername');
      var username = usernameEl ? usernameEl.value.trim() : '';
      var password = document.getElementById('createPassword').value;
      var role = document.getElementById('createRole').value;
      var errorEl = document.getElementById('createError');
      var successEl = document.getElementById('createSuccess');
      var btn = createForm.querySelector('button[type="submit"]');
      errorEl.textContent = '';
      successEl.textContent = '';

      if (!name || !email || !password || !role) {
        errorEl.textContent = 'Please fill in all fields.';
        return;
      }
      if (password.length < 8) {
        errorEl.textContent = 'Password must be at least 8 characters.';
        return;
      }
      if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }

      callAuth({ action: 'signup', name: name, email: email, username: username, password: password, role: role, next: requestedNextPath() })
        .then(function (data) {
          // No auto-login: the account is created pending until the emailed
          // verification link is clicked. Tell the member to check their inbox.
          createForm.reset();
          successEl.textContent = (data && data.message) || 'Almost there — check your email for a link to verify your account, then sign in.';
          if (data && data.emailSent === false) {
            successEl.textContent = 'Your account was created, but the first verification email could not be delivered. Try sending a fresh link below.';
          }
          offerResend(email, successEl);
          if (btn) { btn.disabled = false; btn.textContent = 'Join Beslyfe Free'; }
        })
        .catch(function (err) {
          errorEl.textContent = err.message;
          if (btn) { btn.disabled = false; btn.textContent = 'Join Beslyfe Free'; }
        });
    });
  }
})();
