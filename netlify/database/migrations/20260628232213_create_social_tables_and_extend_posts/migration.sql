CREATE TABLE "social_group_members" (
	"group_id" text,
	"profile_id" text,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_group_members_pkey" PRIMARY KEY("group_id","profile_id")
);
--> statement-breakpoint
CREATE TABLE "social_group_messages" (
	"id" text PRIMARY KEY,
	"group_id" text DEFAULT '' NOT NULL,
	"sender_id" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"media_url" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_groups" (
	"id" text PRIMARY KEY,
	"name" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"owner_id" text DEFAULT '' NOT NULL,
	"avatar_url" text DEFAULT '' NOT NULL,
	"is_private" text DEFAULT 'false' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_locations" (
	"profile_id" text PRIMARY KEY,
	"lat" text DEFAULT '' NOT NULL,
	"lng" text DEFAULT '' NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_media" (
	"id" text PRIMARY KEY,
	"owner_id" text DEFAULT '' NOT NULL,
	"kind" text DEFAULT 'image' NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"caption" text DEFAULT '' NOT NULL,
	"filter" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "social_posts" ADD COLUMN "post_type" text DEFAULT 'post' NOT NULL;--> statement-breakpoint
ALTER TABLE "social_posts" ADD COLUMN "video_url" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "social_posts" ADD COLUMN "filter" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "social_posts" ADD COLUMN "music" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "social_posts" ADD COLUMN "visibility" text DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "social_posts" ADD COLUMN "location" jsonb DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "social_posts" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "social_group_members_profile_idx" ON "social_group_members" ("profile_id");--> statement-breakpoint
CREATE INDEX "social_group_messages_group_idx" ON "social_group_messages" ("group_id");--> statement-breakpoint
CREATE INDEX "social_groups_owner_idx" ON "social_groups" ("owner_id");--> statement-breakpoint
CREATE INDEX "social_media_owner_idx" ON "social_media" ("owner_id");--> statement-breakpoint
CREATE INDEX "social_media_created_idx" ON "social_media" ("created_at");--> statement-breakpoint
CREATE INDEX "social_posts_type_idx" ON "social_posts" ("post_type");