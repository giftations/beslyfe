ALTER TABLE "accounts" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "username_lower" text;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_username_lower_idx" ON "accounts" ("username_lower");