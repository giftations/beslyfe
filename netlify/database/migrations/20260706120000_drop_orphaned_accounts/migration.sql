-- Remove login accounts whose community profile has already been deleted.
--
-- Historically a profile could be deleted without cascading to its linked login
-- account, leaving an "orphaned" account that still appeared in the admin Users
-- list (and could still sign in) even though the person's profile was gone. The
-- profile delete handler now cascades to the account, but accounts orphaned
-- before that fix remain in the database. This migration cleans them up.
--
-- An account is orphaned when it references a profile id that no longer exists.
-- The 'admin' seed and any account with no linked profile (empty profile_id) are
-- intentionally left untouched. Dependent session and password-reset rows are
-- removed first so nothing is left pointing at a deleted account.
DELETE FROM sessions
WHERE account_id IN (
  SELECT id FROM accounts
  WHERE email_lower <> 'admin'
    AND profile_id <> ''
    AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = accounts.profile_id)
);
--> statement-breakpoint
DELETE FROM password_resets
WHERE account_id IN (
  SELECT id FROM accounts
  WHERE email_lower <> 'admin'
    AND profile_id <> ''
    AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = accounts.profile_id)
);
--> statement-breakpoint
DELETE FROM accounts
WHERE email_lower <> 'admin'
  AND profile_id <> ''
  AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = accounts.profile_id);
