/* Password reset for Beslyfe.
   Talks to the /auth function:
     • forgot-password.html requests a reset link (action: 'request-reset').
     • reset-password.html confirms a new password with the emailed token
       (action: 'confirm-reset'). The token arrives as ?token=… in the URL. */
(function () {
  var AUTH_ENDPOINT = '/.netlify/functions/auth';

  function post(payload) {
    return fetch(AUTH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || ('Request failed (HTTP ' + res.status + ')'));
        return data;
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    // ── Request a reset link ──
    var requestForm = document.getElementById('resetRequestForm');
    if (requestForm) {
      requestForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var emailInput = requestForm.querySelector('input[type="email"]');
        var message = document.getElementById('message');
        var btn = requestForm.querySelector('button[type="submit"]');
        var email = emailInput ? emailInput.value.trim() : '';
        if (message) { message.textContent = ''; message.className = ''; }
        if (!email) { if (message) message.textContent = 'Enter your email.'; return; }
        if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
        post({ action: 'request-reset', email: email })
          .then(function (data) {
            if (message) { message.textContent = data.message || 'If that email has an account, a reset link is on its way.'; }
          })
          .catch(function (err) {
            if (message) message.textContent = err.message;
          })
          .then(function () {
            if (btn) { btn.disabled = false; btn.textContent = 'Send Reset Link'; }
          });
      });
    }

    // ── Confirm a new password ──
    var passwordForm = document.getElementById('newPasswordForm');
    if (passwordForm) {
      var token = new URLSearchParams(window.location.search).get('token') || '';
      var message2 = document.getElementById('resetMessage');
      if (!token && message2) {
        message2.textContent = 'This reset link is missing its token. Please use the link from your email.';
      }
      passwordForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var inputs = passwordForm.querySelectorAll('input[type="password"]');
        var pw = inputs[0] ? inputs[0].value : '';
        var confirm = inputs[1] ? inputs[1].value : '';
        var btn = passwordForm.querySelector('button[type="submit"]');
        if (message2) { message2.textContent = ''; message2.className = ''; }
        if (pw.length < 8) { if (message2) message2.textContent = 'Password must be at least 8 characters.'; return; }
        if (pw !== confirm) { if (message2) message2.textContent = 'The two passwords do not match.'; return; }
        if (!token) { if (message2) message2.textContent = 'This reset link is missing its token.'; return; }
        if (btn) { btn.disabled = true; btn.textContent = 'Updating…'; }
        post({ action: 'confirm-reset', token: token, password: pw })
          .then(function (data) {
            if (message2) message2.textContent = data.message || 'Your password has been updated.';
            passwordForm.style.display = 'none';
            setTimeout(function () { window.location.href = '/admin-login.html'; }, 1500);
          })
          .catch(function (err) {
            if (message2) message2.textContent = err.message;
            if (btn) { btn.disabled = false; btn.textContent = 'Update Password'; }
          });
      });
    }
  });
})();
