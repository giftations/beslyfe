CREATE TABLE "events" (
	"id" text PRIMARY KEY,
	"slug" text DEFAULT '' NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"tagline" text DEFAULT '' NOT NULL,
	"venue" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"status" text DEFAULT 'planning' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"settings" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "event_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "event_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX "applications_event_idx" ON "applications" ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "events_slug_idx" ON "events" ("slug");--> statement-breakpoint
CREATE INDEX "events_active_idx" ON "events" ("is_active");--> statement-breakpoint
CREATE INDEX "profiles_event_idx" ON "profiles" ("event_id");