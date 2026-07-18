# Production Readiness Checklist

Bak'd On The Bay is the live event ecosystem. Beslyfe is the parent platform.
Use this checklist before changing production DNS, Netlify deploy settings,
email delivery, database attachment, or rollback posture.

## Required Manual Checks

- [ ] DNS check: confirm the intended production host resolves to the Netlify site and no unexpected Beslyfe-to-Cannadispo redirect changed.
- [ ] Netlify deploy check: confirm the latest `main` deploy is successful and points to the expected commit.
- [ ] Netlify Database attached check: confirm the production site has Netlify Database attached and no second database or external storage is configured.
- [ ] Resend domain verification check: confirm the sending domain is verified in Resend before enabling production mail.
- [ ] Admin login check: sign in through the production admin path with the expected admin account.
- [ ] Application submission check: submit a test application and confirm it is stored in Netlify Database.
- [ ] Approval email check: approve the test application and confirm the applicant receives the approval email.
- [ ] Password reset email check: request a password reset for a non-admin test account and confirm the reset email arrives.
- [ ] Public profile creation check: create or approve a public profile and confirm it stores correctly.
- [ ] Directory visibility check: confirm public directory pages hide private email fields and show only approved visible profiles.
- [ ] Feed/comment/message notification check: create a feed/comment/message notification and confirm it appears in-site; email is not expected unless explicitly configured later.
- [ ] Mobile navigation check: verify the public site, admin login, applications, directory, feed, messages, and package access on a mobile viewport.
- [ ] 404/redirect check: confirm unknown routes, canonical redirects, and current Cannadispo/Beslyfe routing behave intentionally.

## Email Environment

Resend is the primary expected provider. Configure these production variables in
Netlify without exposing values in logs, frontend code, tests, or docs:

- `RESEND_API_KEY`
- `EMAIL_FROM_ADDRESS`
- `APPROVAL_EMAIL_FROM`
- `ADMIN_NOTIFY_EMAIL`
- `PROFILE_NOTIFICATION_TO`

SendGrid may remain configured only as a legacy fallback if an existing
environment already uses it. New production setup should not require SendGrid.

## Rollback Instructions

1. In Netlify, find the last known-good production deploy.
2. Use Netlify's rollback or "Publish deploy" control to restore that deploy.
3. Do not change database schema, DNS, or email provider settings during rollback unless the incident specifically requires it.
4. Re-run the admin login, application submission, approval email, password reset, directory visibility, and notification checks.
5. Record the failed deploy commit, rollback deploy, visible symptom, and follow-up fix in the incident notes.
