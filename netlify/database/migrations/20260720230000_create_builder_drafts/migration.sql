CREATE TABLE IF NOT EXISTS "builder_drafts" (
  "id" text PRIMARY KEY,
  "owner_profile_id" text DEFAULT '' NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "builder_drafts_owner_idx" ON "builder_drafts" ("owner_profile_id");
