-- Media in direct messages + a full member notification system.
--
-- 1. Direct messages gain optional attached media (a photo or video), mirroring
--    the media already supported on group messages (social_group_messages.media_url)
--    and on posts/reels. The bytes live in the existing social_media library and
--    are served by the media-library function; these columns just reference them.
ALTER TABLE "social_messages" ADD COLUMN IF NOT EXISTS "media_url" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "social_messages" ADD COLUMN IF NOT EXISTS "media_kind" text DEFAULT '' NOT NULL;--> statement-breakpoint

-- 2. Notifications inbox — one row per event that concerns a member (new message,
--    a followed member's new post, a like/comment on their post, a new follower).
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
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_recipient_idx" ON "notifications" ("recipient_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_recipient_read_idx" ON "notifications" ("recipient_id","read_at");--> statement-breakpoint

-- 3. Per-member notification preferences so a member can opt out entirely
--    (`muted`) or per category (the `prefs` JSON map of type -> boolean). No row
--    means the default: everything enabled.
CREATE TABLE IF NOT EXISTS "notification_prefs" (
	"profile_id" text PRIMARY KEY,
	"muted" boolean DEFAULT false NOT NULL,
	"prefs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
