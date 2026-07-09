ALTER TABLE "crm_people" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_people" ADD COLUMN IF NOT EXISTS "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_people" ADD COLUMN IF NOT EXISTS "lead_source" text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_people" ADD COLUMN IF NOT EXISTS "pipeline_stage" text DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_people" ADD COLUMN IF NOT EXISTS "owner_account_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_people" ADD COLUMN IF NOT EXISTS "follow_up_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crm_people" ADD COLUMN IF NOT EXISTS "last_contacted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crm_people" ADD COLUMN IF NOT EXISTS "lifetime_value_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_people" ADD COLUMN IF NOT EXISTS "priority" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint

ALTER TABLE "crm_companies" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_companies" ADD COLUMN IF NOT EXISTS "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_companies" ADD COLUMN IF NOT EXISTS "lead_source" text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_companies" ADD COLUMN IF NOT EXISTS "pipeline_stage" text DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_companies" ADD COLUMN IF NOT EXISTS "owner_account_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_companies" ADD COLUMN IF NOT EXISTS "follow_up_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crm_companies" ADD COLUMN IF NOT EXISTS "last_contacted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crm_companies" ADD COLUMN IF NOT EXISTS "lifetime_value_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_companies" ADD COLUMN IF NOT EXISTS "priority" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "crm_activities" (
  "id" text PRIMARY KEY,
  "subject_type" text DEFAULT 'person' NOT NULL,
  "subject_id" text DEFAULT '' NOT NULL,
  "event_id" text DEFAULT '' NOT NULL,
  "actor_account_id" text DEFAULT '' NOT NULL,
  "kind" text DEFAULT 'note' NOT NULL,
  "title" text DEFAULT '' NOT NULL,
  "body" text DEFAULT '' NOT NULL,
  "due_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "crm_people_pipeline_idx" ON "crm_people" ("pipeline_stage");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_people_status_idx" ON "crm_people" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_people_owner_idx" ON "crm_people" ("owner_account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_people_follow_up_idx" ON "crm_people" ("follow_up_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_companies_pipeline_idx" ON "crm_companies" ("pipeline_stage");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_companies_status_idx" ON "crm_companies" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_companies_owner_idx" ON "crm_companies" ("owner_account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_companies_follow_up_idx" ON "crm_companies" ("follow_up_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_activities_subject_idx" ON "crm_activities" ("subject_type","subject_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_activities_due_idx" ON "crm_activities" ("due_at","completed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_activities_event_idx" ON "crm_activities" ("event_id");
