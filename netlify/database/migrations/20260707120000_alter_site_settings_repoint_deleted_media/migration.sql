-- Repoint site settings that still reference a deleted media file.
--
-- The site-media function serves a stored image by id
-- (/.netlify/functions/site-media?file=<id>) and correctly returns 404 when the
-- id no longer exists in the site_media table. Two published settings documents
-- still pointed at a media item that had been removed from the library:
--
--   * contact page  -> heroBackground            (rendered on every /contact view)
--   * homepage       -> speakerSchedule[13].image (an <img> in the education
--                                                   schedule, on every homepage view)
--
-- Both referenced 1782698185298-bak_d_on_the_bay_logo.jpg, whose row is gone, so
-- every homepage and contact load re-requested it and produced a 404 — the steady
-- ~40% 404 rate observed on the site-media function. The bytes for that file do
-- not exist anywhere, so the only fix is to stop referencing it.
--
-- The reference is rewritten to the site's official logo (1782880123757-
-- OFFICIAL_LOGO.png), which still exists in site_media and is the closest match to
-- the deleted "bay logo". A plain substring replace on the JSON document swaps only
-- the file id and leaves each reference's surrounding URL untouched, so the
-- contact hero stays a site-relative path and the homepage schedule entry keeps the
-- absolute URL used by its sibling slots. The id contains no JSON-special
-- characters, so the text round-trip through jsonb is safe.
--
-- Idempotent: once rewritten, no row matches the WHERE clause, so re-running is a
-- no-op. Scoped by the WHERE clause so only documents that still carry the dead
-- reference are touched.
UPDATE site_settings
SET data = replace(
      data::text,
      '1782698185298-bak_d_on_the_bay_logo.jpg',
      '1782880123757-OFFICIAL_LOGO.png'
    )::jsonb,
    updated_at = now()
WHERE data::text LIKE '%1782698185298-bak_d_on_the_bay_logo.jpg%';
