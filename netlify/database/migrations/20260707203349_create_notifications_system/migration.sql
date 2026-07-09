CREATE TABLE IF NOT EXISTS "notification_prefs" (
	"profile_id" text PRIMARY KEY,
	"muted" boolean DEFAULT false NOT NULL,
	"prefs" jsonb DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" text PRIMARY KEY,
	"recipient_id" text DEFAULT '' NOT NULL,
	"actor_id" text DEFAULT '' NOT NULL,
	"type" text DEFAULT '' NOT NULL,
	"post_id" text DEFAULT '' NOT NULL,
	"message_id" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"link" text DEFAULT '' NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "social_messages" ADD COLUMN IF NOT EXISTS "media_url" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "social_messages" ADD COLUMN IF NOT EXISTS "media_kind" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_recipient_idx" ON "notifications" ("recipient_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_recipient_read_idx" ON "notifications" ("recipient_id","read_at");
