CREATE TABLE "social_comments" (
	"id" text PRIMARY KEY,
	"post_id" text DEFAULT '' NOT NULL,
	"author_id" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_follows" (
	"follower_id" text,
	"followee_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_follows_pkey" PRIMARY KEY("follower_id","followee_id")
);
--> statement-breakpoint
CREATE TABLE "social_likes" (
	"post_id" text,
	"profile_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_likes_pkey" PRIMARY KEY("post_id","profile_id")
);
--> statement-breakpoint
CREATE TABLE "social_posts" (
	"id" text PRIMARY KEY,
	"author_id" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"image_url" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "social_comments_post_idx" ON "social_comments" ("post_id");--> statement-breakpoint
CREATE INDEX "social_follows_followee_idx" ON "social_follows" ("followee_id");--> statement-breakpoint
CREATE INDEX "social_follows_follower_idx" ON "social_follows" ("follower_id");--> statement-breakpoint
CREATE INDEX "social_posts_author_idx" ON "social_posts" ("author_id");--> statement-breakpoint
CREATE INDEX "social_posts_created_idx" ON "social_posts" ("created_at");