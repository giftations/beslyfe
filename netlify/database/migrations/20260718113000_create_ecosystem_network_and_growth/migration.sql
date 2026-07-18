CREATE TABLE IF NOT EXISTS "ecosystems" (
  "id" text PRIMARY KEY,
  "slug" text DEFAULT '' NOT NULL,
  "name" text DEFAULT '' NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "product_type" text DEFAULT 'website' NOT NULL,
  "primary_outcome" text DEFAULT 'community-growth' NOT NULL,
  "owner_profile_id" text DEFAULT '' NOT NULL,
  "parent_ecosystem_id" text DEFAULT 'beslyfe-network' NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "visibility" text DEFAULT 'public' NOT NULL,
  "capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "ecosystems_slug_idx" ON "ecosystems" ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ecosystems_owner_idx" ON "ecosystems" ("owner_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ecosystems_product_idx" ON "ecosystems" ("product_type", "status");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ecosystem_memberships" (
  "ecosystem_id" text NOT NULL,
  "profile_id" text NOT NULL,
  "role" text DEFAULT 'member' NOT NULL,
  "source" text DEFAULT 'direct' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "joined_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ecosystem_memberships_pk" PRIMARY KEY("ecosystem_id", "profile_id")
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ecosystem_memberships_profile_idx" ON "ecosystem_memberships" ("profile_id", "status");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "growth_channels" (
  "id" text PRIMARY KEY,
  "ecosystem_id" text DEFAULT '' NOT NULL,
  "owner_profile_id" text DEFAULT '' NOT NULL,
  "mode" text DEFAULT 'lead' NOT NULL,
  "provider" text DEFAULT 'contact-form' NOT NULL,
  "offer_name" text DEFAULT '' NOT NULL,
  "action_label" text DEFAULT 'Get started' NOT NULL,
  "destination_url" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "attribution" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "growth_channels_ecosystem_idx" ON "growth_channels" ("ecosystem_id", "status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "growth_channels_owner_idx" ON "growth_channels" ("owner_profile_id");--> statement-breakpoint

ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "ecosystem_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "home_ecosystem_id" text DEFAULT 'beslyfe-network' NOT NULL;--> statement-breakpoint
ALTER TABLE "social_posts" ADD COLUMN IF NOT EXISTS "ecosystem_id" text DEFAULT 'beslyfe-network' NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_posts_ecosystem_idx" ON "social_posts" ("ecosystem_id", "created_at");--> statement-breakpoint

INSERT INTO "ecosystems" (
  "id", "slug", "name", "description", "product_type", "primary_outcome",
  "owner_profile_id", "parent_ecosystem_id", "status", "visibility",
  "capabilities", "answers", "settings"
) VALUES (
  'beslyfe-network', 'beslyfe-network', 'Beslyfe Community',
  'The shared community connecting every person and ecosystem built with Beslyfe.',
  'community', 'community-growth', '', '', 'active', 'public',
  '["community","messaging","directory","cms","analytics"]'::jsonb,
  '{}'::jsonb, '{"network":true,"canonicalUrl":"https://beslyfe.com/community"}'::jsonb
) ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

-- The existing event community is the proof that seeded Beslyfe. Keep its
-- identity and public contributions, but make their origin explicit while the
-- shared feed continues to include them.
INSERT INTO "ecosystems" (
  "id", "slug", "name", "description", "product_type", "primary_outcome",
  "owner_profile_id", "parent_ecosystem_id", "status", "visibility",
  "capabilities", "answers", "settings"
) VALUES (
  'proof-bakd-on-the-bay', 'proof-bakd-on-the-bay', 'Bak''d On The Bay',
  'The first proof ecosystem powered by Beslyfe.', 'event', 'community-growth',
  '', 'beslyfe-network', 'active', 'public',
  '["cms","community","messaging","directory","scheduling","applications","ticketing"]'::jsonb,
  '{}'::jsonb, '{"proof":true,"canonicalUrl":"https://cannadispo.com"}'::jsonb
) ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

UPDATE "profiles"
SET "home_ecosystem_id" = 'proof-bakd-on-the-bay'
WHERE COALESCE("event_id", '') <> '' AND "home_ecosystem_id" = 'beslyfe-network';--> statement-breakpoint

UPDATE "social_posts" p
SET "ecosystem_id" = 'proof-bakd-on-the-bay'
FROM "profiles" pr
WHERE p."author_id" = pr."id"
  AND COALESCE(pr."event_id", '') <> ''
  AND p."ecosystem_id" = 'beslyfe-network';--> statement-breakpoint

INSERT INTO "ecosystem_memberships" ("ecosystem_id", "profile_id", "role", "source", "status")
SELECT 'beslyfe-network', p."id", 'member',
  CASE WHEN COALESCE(p."event_id", '') <> '' THEN 'proof-ecosystem' ELSE 'direct' END,
  'active'
FROM "profiles" p
WHERE p."status" = 'approved'
ON CONFLICT ("ecosystem_id", "profile_id") DO NOTHING;--> statement-breakpoint

INSERT INTO "ecosystem_memberships" ("ecosystem_id", "profile_id", "role", "source", "status")
SELECT 'proof-bakd-on-the-bay', p."id", 'member', 'proof-ecosystem', 'active'
FROM "profiles" p
WHERE p."status" = 'approved' AND COALESCE(p."event_id", '') <> ''
ON CONFLICT ("ecosystem_id", "profile_id") DO NOTHING;
