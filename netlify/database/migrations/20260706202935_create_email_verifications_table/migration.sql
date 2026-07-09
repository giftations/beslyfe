CREATE TABLE "email_verifications" (
	"token_hash" text PRIMARY KEY,
	"account_id" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "email_verified" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "email_verifications_account_idx" ON "email_verifications" ("account_id");