ALTER TABLE "social_group_messages"
  ADD COLUMN IF NOT EXISTS "media_kind" text DEFAULT '' NOT NULL;

CREATE INDEX IF NOT EXISTS "social_media_url_idx"
  ON "social_media" ("url");

-- Existing group attachments were uploaded into social_media, which already
-- records their authoritative kind. Backfill matches where possible; unmatched
-- legacy URLs remain blank and use the API/browser extension fallback.
UPDATE "social_group_messages" AS gm
SET "media_kind" = sm."kind"
FROM "social_media" AS sm
WHERE gm."media_kind" = ''
  AND gm."media_url" <> ''
  AND gm."media_url" = sm."url"
  AND sm."kind" IN ('image', 'video');
