/* Account auth for Bak'd On The Bay.
   Talks to the /auth function: one account = one password = one community
   profile. Signing in stores the account session (`bakd_session`) and also sets
   the active social identity (`bay_active_profile`) to the account's linked
   profile, so the member can immediately post, comment, follow and message as
   themselves — no separate "choose a profile" step. */
(function () {
  var AUTH_ENDPOINT = '/.netlify/functions/auth';
  var SESSION_KEY = 'bakd_session';
  var IDENTITY_KEY = 'bay_active_profile';

  // Persist the signed-in account and mirror its profile into the social
  // identity slot that social-common.js reads.
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
      try { document.dispatchEvent(new CustomEvent('bay-identity-change', { detail: slim })); } catch (e) {}
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

  function redirectFor(account) {
    if (account.role === 'admin') return '/admin/';
    return '/hub';
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

      callAuth({ action: 'signup', name: name, email: email, username: username, password: password, role: role })
        .then(function (data) {
          // No auto-login: the account is created pending until the emailed
          // verification link is clicked. Tell the member to check their inbox.
          createForm.reset();
          successEl.textContent = (data && data.message) || 'Almost there — check your email for a link to verify your account, then sign in.';
          if (data && data.emailSent === false) {
            successEl.textContent += ' (If it doesn’t arrive, use “Resend verification email” after trying to sign in.)';
          }
          if (btn) { btn.disabled = false; btn.textContent = 'Create Account'; }
        })
        .catch(function (err) {
          errorEl.textContent = err.message;
          if (btn) { btn.disabled = false; btn.textContent = 'Create Account'; }
        });
    });
  }
})();
