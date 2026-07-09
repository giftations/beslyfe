CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY,
	"actor_account_id" text DEFAULT '' NOT NULL,
	"actor_name" text DEFAULT '' NOT NULL,
	"action" text DEFAULT '' NOT NULL,
	"resource_type" text DEFAULT '' NOT NULL,
	"resource_id" text DEFAULT '' NOT NULL,
	"details" jsonb DEFAULT '{}' NOT NULL,
	"ip" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_attempts" (
	"id" text PRIMARY KEY,
	"bucket" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audit_log_created_idx" ON "audit_log" ("created_at");--> statement-breakpoint
CREATE INDEX "audit_log_resource_idx" ON "audit_log" ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" ("actor_account_id");--> statement-breakpoint
CREATE INDEX "auth_attempts_bucket_idx" ON "auth_attempts" ("bucket","created_at");--> statement-breakpoint
CREATE INDEX "auth_attempts_created_idx" ON "auth_attempts" ("created_at");