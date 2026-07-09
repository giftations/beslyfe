CREATE TABLE "accounts" (
	"id" text PRIMARY KEY,
	"email" text DEFAULT '' NOT NULL,
	"email_lower" text DEFAULT '' NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"role" text DEFAULT 'attendee' NOT NULL,
	"status" text DEFAULT 'approved' NOT NULL,
	"password_hash" text DEFAULT '' NOT NULL,
	"password_salt" text DEFAULT '' NOT NULL,
	"profile_id" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_messages" (
	"id" text PRIMARY KEY,
	"sender_id" text DEFAULT '' NOT NULL,
	"recipient_id" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_email_lower_idx" ON "accounts" ("email_lower");--> statement-breakpoint
CREATE INDEX "social_messages_sender_idx" ON "social_messages" ("sender_id");--> statement-breakpoint
CREATE INDEX "social_messages_recipient_idx" ON "social_messages" ("recipient_id");--> statement-breakpoint
CREATE INDEX "social_messages_pair_idx" ON "social_messages" ("sender_id","recipient_id");