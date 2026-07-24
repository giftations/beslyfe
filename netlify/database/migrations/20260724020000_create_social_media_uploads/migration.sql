CREATE TABLE IF NOT EXISTS "social_media_uploads" (
  "id" text PRIMARY KEY NOT NULL,
  "owner_id" text DEFAULT '' NOT NULL,
  "filename" text DEFAULT '' NOT NULL,
  "content_type" text DEFAULT '' NOT NULL,
  "kind" text DEFAULT '' NOT NULL,
  "total_bytes" integer DEFAULT 0 NOT NULL,
  "chunk_size" integer DEFAULT 0 NOT NULL,
  "total_chunks" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  CONSTRAINT "social_media_uploads_total_bytes_check"
    CHECK ("total_bytes" > 0 AND "total_bytes" <= 18874368),
  CONSTRAINT "social_media_uploads_chunk_size_check"
    CHECK ("chunk_size" > 0 AND "chunk_size" <= 2097152),
  CONSTRAINT "social_media_uploads_total_chunks_check"
    CHECK ("total_chunks" > 0)
);

CREATE INDEX IF NOT EXISTS "social_media_uploads_owner_idx"
  ON "social_media_uploads" ("owner_id");
CREATE INDEX IF NOT EXISTS "social_media_uploads_expires_idx"
  ON "social_media_uploads" ("expires_at");

CREATE TABLE IF NOT EXISTS "social_media_upload_chunks" (
  "upload_id" text NOT NULL,
  "chunk_index" integer NOT NULL,
  "data" bytea NOT NULL,
  "byte_length" integer DEFAULT 0 NOT NULL,
  "sha256" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "social_media_upload_chunks_upload_id_chunk_index_pk"
    PRIMARY KEY ("upload_id", "chunk_index"),
  CONSTRAINT "social_media_upload_chunks_upload_fk"
    FOREIGN KEY ("upload_id") REFERENCES "public"."social_media_uploads"("id")
    ON DELETE CASCADE,
  CONSTRAINT "social_media_upload_chunks_chunk_index_check"
    CHECK ("chunk_index" >= 0),
  CONSTRAINT "social_media_upload_chunks_byte_length_check"
    CHECK ("byte_length" > 0 AND "byte_length" <= 2097152),
  CONSTRAINT "social_media_upload_chunks_sha256_check"
    CHECK (length("sha256") = 64)
);

-- Storage is accounted in one row per owner. Existing libraries above the new
-- default are grandfathered at their current size so this additive migration
-- never makes previously accepted media undeployable.
CREATE TABLE IF NOT EXISTS "social_media_storage_usage" (
  "owner_id" text PRIMARY KEY NOT NULL,
  "used_bytes" bigint DEFAULT 0 NOT NULL,
  "reserved_bytes" bigint DEFAULT 0 NOT NULL,
  "quota_bytes" bigint DEFAULT 209715200 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "social_media_storage_usage_nonnegative_check"
    CHECK ("used_bytes" >= 0 AND "reserved_bytes" >= 0),
  CONSTRAINT "social_media_storage_quota_check"
    CHECK ("quota_bytes" >= 209715200 AND "used_bytes" + "reserved_bytes" <= "quota_bytes")
);

-- Netlify applies the migration just before publishing while the previous
-- Functions can briefly remain active. Block media writes until the ledger is
-- reconciled and every accounting trigger below is installed.
LOCK TABLE "social_media", "social_media_uploads" IN SHARE ROW EXCLUSIVE MODE;

WITH owner_usage AS (
  SELECT
    "owner_id",
    SUM("used_bytes")::bigint AS "used_bytes",
    SUM("reserved_bytes")::bigint AS "reserved_bytes"
  FROM (
    SELECT
      "owner_id",
      COALESCE(SUM(octet_length("data")), 0)::bigint AS "used_bytes",
      0::bigint AS "reserved_bytes"
    FROM "social_media"
    GROUP BY "owner_id"
    UNION ALL
    SELECT
      "owner_id",
      0::bigint AS "used_bytes",
      COALESCE(SUM("total_bytes"), 0)::bigint AS "reserved_bytes"
    FROM "social_media_uploads"
    GROUP BY "owner_id"
  ) AS totals
  GROUP BY "owner_id"
)
INSERT INTO "social_media_storage_usage" (
  "owner_id", "used_bytes", "reserved_bytes", "quota_bytes", "updated_at"
)
SELECT
  "owner_id",
  "used_bytes",
  "reserved_bytes",
  GREATEST(209715200::bigint, "used_bytes" + "reserved_bytes"),
  now()
FROM owner_usage
ON CONFLICT ("owner_id") DO UPDATE SET
  "used_bytes" = EXCLUDED."used_bytes",
  "reserved_bytes" = EXCLUDED."reserved_bytes",
  "quota_bytes" = GREATEST(
    "social_media_storage_usage"."quota_bytes",
    EXCLUDED."used_bytes" + EXCLUDED."reserved_bytes"
  ),
  "updated_at" = now();

CREATE OR REPLACE FUNCTION reserve_social_media_upload_storage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO "social_media_storage_usage" (
    "owner_id", "used_bytes", "reserved_bytes", "quota_bytes", "updated_at"
  )
  VALUES (NEW."owner_id", 0, NEW."total_bytes", 209715200, now())
  ON CONFLICT ("owner_id") DO UPDATE SET
    "reserved_bytes" = "social_media_storage_usage"."reserved_bytes" + EXCLUDED."reserved_bytes",
    "updated_at" = now()
  WHERE
    "social_media_storage_usage"."used_bytes"
      + "social_media_storage_usage"."reserved_bytes"
      + EXCLUDED."reserved_bytes"
    <= "social_media_storage_usage"."quota_bytes";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'social media storage limit exceeded'
      USING ERRCODE = '23514', CONSTRAINT = 'social_media_storage_quota_check';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION release_social_media_upload_storage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE "social_media_storage_usage"
  SET
    "reserved_bytes" = "reserved_bytes" - OLD."total_bytes",
    "updated_at" = now()
  WHERE
    "owner_id" = OLD."owner_id"
    AND "reserved_bytes" >= OLD."total_bytes";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'social media storage reservation is inconsistent'
      USING ERRCODE = '23514', CONSTRAINT = 'social_media_storage_usage_nonnegative_check';
  END IF;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION account_social_media_storage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  stored_bytes bigint := COALESCE(octet_length(NEW."data"), 0);
BEGIN
  -- A completed chunked upload uses the upload id as its final media id.
  -- Removing that row releases the reservation before the same transaction
  -- converts it to used bytes. ON CONFLICT retries do not fire AFTER INSERT.
  DELETE FROM "social_media_uploads"
  WHERE "id" = NEW."id" AND "owner_id" = NEW."owner_id";

  INSERT INTO "social_media_storage_usage" (
    "owner_id", "used_bytes", "reserved_bytes", "quota_bytes", "updated_at"
  )
  VALUES (NEW."owner_id", stored_bytes, 0, 209715200, now())
  ON CONFLICT ("owner_id") DO UPDATE SET
    "used_bytes" = "social_media_storage_usage"."used_bytes" + EXCLUDED."used_bytes",
    "updated_at" = now()
  WHERE
    "social_media_storage_usage"."used_bytes"
      + "social_media_storage_usage"."reserved_bytes"
      + EXCLUDED."used_bytes"
    <= "social_media_storage_usage"."quota_bytes";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'social media storage limit exceeded'
      USING ERRCODE = '23514', CONSTRAINT = 'social_media_storage_quota_check';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION release_social_media_storage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  stored_bytes bigint := COALESCE(octet_length(OLD."data"), 0);
BEGIN
  UPDATE "social_media_storage_usage"
  SET
    "used_bytes" = "used_bytes" - stored_bytes,
    "updated_at" = now()
  WHERE
    "owner_id" = OLD."owner_id"
    AND "used_bytes" >= stored_bytes;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'social media storage usage is inconsistent'
      USING ERRCODE = '23514', CONSTRAINT = 'social_media_storage_usage_nonnegative_check';
  END IF;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION protect_social_media_upload_storage_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."owner_id" IS DISTINCT FROM OLD."owner_id"
    OR NEW."total_bytes" IS DISTINCT FROM OLD."total_bytes"
  THEN
    RAISE EXCEPTION 'accounted media identity and size are immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'social_media_storage_identity_check';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION protect_social_media_storage_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."owner_id" IS DISTINCT FROM OLD."owner_id"
    OR NEW."data" IS DISTINCT FROM OLD."data"
  THEN
    RAISE EXCEPTION 'accounted media identity and size are immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'social_media_storage_identity_check';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "social_media_upload_storage_reserve" ON "social_media_uploads";
CREATE TRIGGER "social_media_upload_storage_reserve"
AFTER INSERT ON "social_media_uploads"
FOR EACH ROW EXECUTE FUNCTION reserve_social_media_upload_storage();

DROP TRIGGER IF EXISTS "social_media_upload_storage_release" ON "social_media_uploads";
CREATE TRIGGER "social_media_upload_storage_release"
AFTER DELETE ON "social_media_uploads"
FOR EACH ROW EXECUTE FUNCTION release_social_media_upload_storage();

DROP TRIGGER IF EXISTS "social_media_upload_storage_protect" ON "social_media_uploads";
CREATE TRIGGER "social_media_upload_storage_protect"
BEFORE UPDATE ON "social_media_uploads"
FOR EACH ROW EXECUTE FUNCTION protect_social_media_upload_storage_identity();

DROP TRIGGER IF EXISTS "social_media_storage_account" ON "social_media";
CREATE TRIGGER "social_media_storage_account"
AFTER INSERT ON "social_media"
FOR EACH ROW EXECUTE FUNCTION account_social_media_storage();

DROP TRIGGER IF EXISTS "social_media_storage_release" ON "social_media";
CREATE TRIGGER "social_media_storage_release"
AFTER DELETE ON "social_media"
FOR EACH ROW EXECUTE FUNCTION release_social_media_storage();

DROP TRIGGER IF EXISTS "social_media_storage_protect" ON "social_media";
CREATE TRIGGER "social_media_storage_protect"
BEFORE UPDATE ON "social_media"
FOR EACH ROW EXECUTE FUNCTION protect_social_media_storage_identity();
