-- Seed the administrator login used to reach /admin/.
--
-- The sign-in form (admin-login.html) uses an <input type="email"> field, so the
-- login identifier must be a real email address; the built-in ensureAdmin
-- username "admin" cannot be typed into it. Login matches generically on
-- email_lower and the admin area is gated purely on role = 'admin', so seeding an
-- email-addressed admin account here gives a working credential through the UI.
--
-- This does not conflict with auth.mjs -> ensureAdmin (which only manages the
-- email_lower = 'admin' row): with ADMIN_PASSWORD unset it never touches this row.
-- To rotate later, either use the site's password-reset flow or update this row.
--
-- The password is stored only as a PBKDF2-SHA256 hash (100000 iterations, 16-byte
-- random salt) -- the exact scheme derive() uses -- so the plaintext never lives
-- in the repository. The password is shared out of band, not committed.
--
-- Idempotent: upserts on the unique email_lower index so re-running converges to
-- this credential.
INSERT INTO accounts (
  "id", "email", "email_lower", "name", "role", "status",
  "password_hash", "password_salt", "profile_id"
) VALUES (
  'acct_admin_seed', 'admin@bakdonthebay.com', 'admin@bakdonthebay.com', 'Administrator', 'admin', 'approved',
  'a30d7990bd0bdaf2177a813206a66af3d5ba530e52f91708d2cf000f273fc98d', '0a40a4387d9421f46fa62c060886e478', ''
)
ON CONFLICT ("email_lower") DO UPDATE SET
  "password_hash" = EXCLUDED."password_hash",
  "password_salt" = EXCLUDED."password_salt",
  "role" = 'admin',
  "status" = 'approved';
