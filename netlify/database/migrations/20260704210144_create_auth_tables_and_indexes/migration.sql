CREATE TABLE "password_resets" (
	"token_hash" text PRIMARY KEY,
	"account_id" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token" text PRIMARY KEY,
	"account_id" text DEFAULT '' NOT NULL,
	"profile_id" text DEFAULT '' NOT NULL,
	"role" text DEFAULT 'attendee' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "password_resets_account_idx" ON "password_resets" ("account_id");--> statement-breakpoint
CREATE INDEX "sessions_account_idx" ON "sessions" ("account_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" ("expires_at");