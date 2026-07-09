
document.getElementById('sponsorForm').addEventListener('submit', function (e) {
  e.preventDefault();

  var btn = document.getElementById('submitBtn');
  var successMsg = document.getElementById('successMsg');
  var errorMsg = document.getElementById('errorMsg');

  btn.disabled = true;
  btn.textContent = 'Submitting…';
  successMsg.classList.remove('show');
  errorMsg.classList.remove('show');

  if (!this.reportValidity()) {
    btn.disabled = false;
    btn.textContent = 'Submit Application →';
    return;
  }

  var fields = Object.fromEntries(new FormData(this).entries());

  fetch('/.netlify/functions/applications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'sponsor', fields: fields })
  })
    .then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        // Surface the server's actual reason (duplicate email, weak password,
        // an unaccepted contract, a missing field, …) so the applicant can fix
        // it, instead of a generic "something went wrong".
        if (!res.ok) throw new Error((data && data.error) || ('Submission failed (HTTP ' + res.status + ').'));
        return data;
      });
    })
    .then(function () {
      successMsg.classList.add('show');
      e.target.reset();
    })
    .catch(function (err) {
      console.error('Sponsor application submission error:', err);
      errorMsg.textContent = (err && err.message) || 'Something went wrong. Please try again or email us directly.';
      errorMsg.classList.add('show');
    })
    .finally(function () {
      btn.disabled = false;
      btn.textContent = 'Submit Application →';
    });
});
