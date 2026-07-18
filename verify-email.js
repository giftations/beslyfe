/* Email verification for Beslyfe.
   Talks to the /auth function:
     • On load, exchanges the ?token=… from the verification email for an active,
       signed-in session (action: 'verify-email') and forwards to the hub.
     • If the link is expired/invalid, reveals a small form to request a fresh
       link (action: 'resend-verification'). */
(function () {
  var AUTH_ENDPOINT = '/.netlify/functions/auth';
  var SESSION_KEY = 'bakd_session';
  var IDENTITY_KEY = 'bay_active_profile';

  function post(payload) {
    return fetch(AUTH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) { var e = new Error(data.error || ('Request failed (HTTP ' + res.status + ')')); e.data = data; throw e; }
        return data;
      });
    });
  }

  // Mirror auth.js: persist the signed-in account and its social identity so the
  // member is immediately active across the community after verifying.
  function storeSession(account, profile) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      id: account.id,
      name: account.name,
      email: account.email,
      role: account.role,
      profileId: account.profileId || (profile && profile.id) || ''
    }));
    if (profile && profile.id) {
      localStorage.setItem(IDENTITY_KEY, JSON.stringify({
        id: profile.id,
        displayName: profile.displayName || account.name || '',
        role: profile.role || '',
        headshotUrl: profile.headshotUrl || ''
      }));
    }
  }

  function redirectFor(account) {
    return account && account.role === 'admin' ? '/admin/' : '/hub';
  }

  document.addEventListener('DOMContentLoaded', function () {
    var message = document.getElementById('verifyMessage');
    var resendForm = document.getElementById('resendForm');
    var token = new URLSearchParams(window.location.search).get('token') || '';

    if (!token) {
      message.textContent = 'This verification link is missing its token. Please use the link from your email.';
      if (resendForm) resendForm.style.display = '';
    } else {
      post({ action: 'verify-email', token: token })
        .then(function (data) {
          storeSession(data.account, data.profile);
          message.textContent = 'Your email is verified — taking you to the community…';
          setTimeout(function () { window.location.href = redirectFor(data.account); }, 900);
        })
        .catch(function (err) {
          message.textContent = err.message;
          if (resendForm) resendForm.style.display = '';
        });
    }

    if (resendForm) {
      resendForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var emailInput = document.getElementById('resendEmail');
        var btn = resendForm.querySelector('button[type="submit"]');
        var email = emailInput ? emailInput.value.trim() : '';
        if (!email) { message.textContent = 'Enter your email.'; return; }
        if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
        post({ action: 'resend-verification', email: email })
          .then(function (data) {
            message.textContent = (data && data.message) || 'If that email needs verifying, a new link is on its way.';
            resendForm.style.display = 'none';
          })
          .catch(function (err) {
            message.textContent = err.message;
            if (btn) { btn.disabled = false; btn.textContent = 'Resend verification email'; }
          });
      });
    }
  });
})();
