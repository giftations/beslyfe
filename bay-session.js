/* Shared site session helper for the public pages.
   The signed-in account lives in localStorage ('bakd_session') and persists
   until the member explicitly logs out — there is no expiry, so a visitor stays
   signed in across pages and browser back/forward navigation.

   This script keeps navigation in sync with that session:
     • #login-btn          becomes a "My Dashboard" link and a "Log Out" link
                           appears beside it when signed in.
     • [data-logout]       any element logs the member out when clicked.
     • [data-auth-only]    shown only when signed in.
     • [data-guest-only]   shown only when signed out.
   Exposes window.BaySession for pages that need it directly. */
(function () {
  var SESSION_KEY = 'bakd_session';
  var IDENTITY_KEY = 'bay_active_profile';

  function get() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; }
  }
  function isAdmin() { var s = get(); return !!(s && s.role === 'admin'); }
  function dashboardHref(s) { return (s || get()) && (s || get()).role === 'admin' ? '/admin/' : '/hub'; }
  function logout(redirect) {
    // Best-effort server-side session teardown so the httpOnly cookie is revoked,
    // then clear the local UI state and leave.
    try {
      fetch('/.netlify/functions/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
        keepalive: true
      }).catch(function () {});
    } catch (e) {}
    try { localStorage.removeItem(SESSION_KEY); localStorage.removeItem(IDENTITY_KEY); } catch (e) {}
    try { document.dispatchEvent(new CustomEvent('bay-identity-change', { detail: null })); } catch (e) {}
    window.location.href = redirect || '/';
  }

  window.BaySession = { get: get, isAdmin: isAdmin, dashboardHref: dashboardHref, logout: logout };

  function enhance() {
    var session = get();
    var signedIn = !!session;

    // Homepage login button → dashboard, with a log-out link beside it.
    var loginBtn = document.getElementById('login-btn');
    if (loginBtn && signedIn) {
      loginBtn.textContent = 'My Dashboard';
      loginBtn.setAttribute('href', dashboardHref(session));
      if (!document.getElementById('logout-btn')) {
        var lo = document.createElement('a');
        lo.id = 'logout-btn';
        lo.href = '#';
        lo.className = loginBtn.className;
        lo.textContent = 'Log Out';
        lo.style.marginLeft = '8px';
        lo.addEventListener('click', function (e) { e.preventDefault(); logout('/'); });
        loginBtn.parentNode.insertBefore(lo, loginBtn.nextSibling);
      }
    }

    // Generic logout triggers.
    Array.prototype.forEach.call(document.querySelectorAll('[data-logout]'), function (el) {
      el.addEventListener('click', function (e) { e.preventDefault(); logout(el.getAttribute('data-logout') || '/'); });
    });

    // Auth-gated visibility helpers.
    Array.prototype.forEach.call(document.querySelectorAll('[data-auth-only]'), function (el) {
      el.hidden = !signedIn;
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-guest-only]'), function (el) {
      el.hidden = signedIn;
    });
  }

  if (document.readyState !== 'loading') enhance();
  else document.addEventListener('DOMContentLoaded', enhance);
})();
