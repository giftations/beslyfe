// Approval-gated package purchase. The applicant enters the email they applied
// with; the applications function checks the database and only returns an
// Eventbrite link when an admin has approved a vendor or sponsor application for
// that email. Nothing here knows the link until the server reveals it.

var TYPE_LABELS = { vendor: 'Vendor', sponsor: 'Sponsor' };

function escHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showResult(html, cls) {
  var result = document.getElementById('result');
  result.className = 'result' + (cls ? ' ' + cls : '');
  result.innerHTML = html;
  result.hidden = false;
}

// The password-protected Eventbrite ticket page asks approved buyers for a shared
// access password. It is revealed alongside the purchase link (and even while the
// link is still being finalized) so an approved applicant always has everything
// they need to check out.
function passwordBlock(password) {
  if (!password) return '';
  return '<div class="pkg-password">'
    + '<span class="pkg-password-label">Eventbrite access password</span>'
    + '<span class="pkg-password-value">' + escHtml(password) + '</span>'
    + '<span class="pkg-password-hint">Enter this password on the Eventbrite ticket page to unlock checkout.</span>'
    + '</div>';
}

document.getElementById('accessForm').addEventListener('submit', function (e) {
  e.preventDefault();

  var btn = document.getElementById('submitBtn');
  var email = document.getElementById('email').value.trim();
  if (!email) return;

  btn.disabled = true;
  btn.textContent = 'Checking…';

  fetch('/.netlify/functions/applications?access=1&email=' + encodeURIComponent(email), {
    headers: { Accept: 'application/json' }
  })
    .then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.error || 'Request failed (HTTP ' + res.status + ')');
        return data;
      });
    })
    .then(function (data) {
      var packages = (data && data.packages) || [];
      var password = (data && data.eventbritePassword) || '';
      if (!packages.length) {
        // Approved, but the organizers haven't pasted the Eventbrite purchase
        // link yet. The applicant IS approved — telling them "not approved" here
        // would be wrong and is exactly the confusion this branch avoids. The
        // access password is still shown so they have it ready for checkout.
        if (data && data.approved) {
          showResult(
            '<h3>You’re approved — link on the way</h3>'
            + '<p>Your application for <strong>' + escHtml(email) + '</strong> is approved. '
            + 'Your secure Eventbrite purchase link is being finalized by our team and will appear here shortly. '
            + 'Please check back soon, or reach out to the organizers if you need it right away.</p>'
            + passwordBlock(password),
            'pending'
          );
          return;
        }
        showResult(
          '<h3>Not approved yet</h3>'
          + '<p>We couldn’t find an approved vendor or sponsor application for <strong>'
          + escHtml(email) + '</strong>. Once our team approves your application, your purchase link will appear here. '
          + 'If you haven’t applied yet, start with the <a href="/vendors">vendor</a> or <a href="/sponsors">sponsor</a> form.</p>',
          'pending'
        );
        return;
      }
      var links = packages.map(function (pkg) {
        var label = TYPE_LABELS[pkg.type] || pkg.type;
        return '<a class="pkg-link" href="' + escHtml(pkg.eventbriteUrl) + '" target="_blank" rel="noopener noreferrer">'
          + 'Buy your ' + escHtml(label) + ' package on Eventbrite →</a>';
      }).join('');
      showResult(
        '<h3>You’re approved — welcome aboard!</h3>'
        + '<p>Use the secure Eventbrite link' + (packages.length > 1 ? 's' : '')
        + ' below to purchase your package.</p>' + links + passwordBlock(password),
        'success'
      );
    })
    .catch(function (err) {
      showResult('<h3>Something went wrong</h3><p>' + escHtml(err.message) + ' Please try again in a moment.</p>', 'error');
    })
    .finally(function () {
      btn.disabled = false;
      btn.textContent = 'Unlock My Package →';
    });
});
