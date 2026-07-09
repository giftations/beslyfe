-- Remove phantom CRM people: rows carrying neither a name nor an email.
--
-- The CRM sync (crm.mjs importFromSource) historically created a crm_people row
-- for every scanned profile/application without first checking the record had a
-- name or an email. A source row blank on both produced a nameless, email-less
-- "phantom" person that surfaced in the admin CRM People list and could never be
-- deduped (its email key falls back to a fresh id on every run). The sync now
-- skips such rows; this migration removes the phantom(s) already persisted.
--
-- Any role links belonging to a phantom are removed first so nothing is left
-- pointing at a deleted person. Real people (a name or an email present) are
-- untouched.
DELETE FROM crm_person_roles
WHERE person_id IN (
  SELECT id FROM crm_people WHERE full_name = '' AND email = ''
);
--> statement-breakpoint
DELETE FROM crm_people WHERE full_name = '' AND email = '';
