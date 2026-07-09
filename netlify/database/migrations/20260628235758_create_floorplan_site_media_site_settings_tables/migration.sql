CREATE TABLE "floorplan" (
	"key" text PRIMARY KEY,
	"data" jsonb DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_media" (
	"id" text PRIMARY KEY,
	"name" text DEFAULT '' NOT NULL,
	"content_type" text DEFAULT '' NOT NULL,
	"kind" text DEFAULT 'image' NOT NULL,
	"data" bytea NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"page" text PRIMARY KEY,
	"data" jsonb DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "social_media" ADD COLUMN "content_type" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "social_media" ADD COLUMN "data" bytea;--> statement-breakpoint
CREATE INDEX "site_media_created_idx" ON "site_media" ("created_at");