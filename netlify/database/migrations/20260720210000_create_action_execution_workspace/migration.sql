CREATE TABLE IF NOT EXISTS "ecosystem_action_plans" (
  "id" text PRIMARY KEY,
  "ecosystem_id" text DEFAULT '' NOT NULL,
  "owner_profile_id" text DEFAULT '' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "ecosystem_action_plans_ecosystem_idx" ON "ecosystem_action_plans" ("ecosystem_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ecosystem_action_plans_owner_idx" ON "ecosystem_action_plans" ("owner_profile_id", "status");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ecosystem_action_tasks" (
  "id" text PRIMARY KEY,
  "plan_id" text DEFAULT '' NOT NULL,
  "ecosystem_id" text DEFAULT '' NOT NULL,
  "owner_profile_id" text DEFAULT '' NOT NULL,
  "day_number" integer DEFAULT 1 NOT NULL,
  "sequence" integer DEFAULT 1 NOT NULL,
  "action_key" text DEFAULT '' NOT NULL,
  "title" text DEFAULT '' NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "mode" text DEFAULT 'internal' NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "requires_approval" boolean DEFAULT false NOT NULL,
  "depends_on_task_id" text DEFAULT '' NOT NULL,
  "input" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "approval_preview" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "result" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "failure_reason" text DEFAULT '' NOT NULL,
  "approved_at" timestamp with time zone,
  "approval_expires_at" timestamp with time zone,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "ecosystem_action_tasks_plan_day_idx" ON "ecosystem_action_tasks" ("plan_id", "day_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ecosystem_action_tasks_ecosystem_idx" ON "ecosystem_action_tasks" ("ecosystem_id", "status", "sequence");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ecosystem_action_tasks_owner_idx" ON "ecosystem_action_tasks" ("owner_profile_id", "status");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ecosystem_action_events" (
  "id" text PRIMARY KEY,
  "task_id" text DEFAULT '' NOT NULL,
  "plan_id" text DEFAULT '' NOT NULL,
  "ecosystem_id" text DEFAULT '' NOT NULL,
  "actor_profile_id" text DEFAULT '' NOT NULL,
  "event_type" text DEFAULT '' NOT NULL,
  "from_status" text DEFAULT '' NOT NULL,
  "to_status" text DEFAULT '' NOT NULL,
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ecosystem_action_events_task_idx" ON "ecosystem_action_events" ("task_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ecosystem_action_events_ecosystem_idx" ON "ecosystem_action_events" ("ecosystem_id", "created_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ecosystem_outcomes" (
  "id" text PRIMARY KEY,
  "ecosystem_id" text DEFAULT '' NOT NULL,
  "owner_profile_id" text DEFAULT '' NOT NULL,
  "metric_key" text DEFAULT '' NOT NULL,
  "value" integer DEFAULT 0 NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "source" text DEFAULT 'member' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ecosystem_outcomes_ecosystem_idx" ON "ecosystem_outcomes" ("ecosystem_id", "metric_key", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ecosystem_outcomes_owner_idx" ON "ecosystem_outcomes" ("owner_profile_id", "created_at");--> statement-breakpoint

ALTER TABLE "social_posts" ADD COLUMN IF NOT EXISTS "source_task_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "social_posts_source_task_idx" ON "social_posts" ("source_task_id") WHERE "source_task_id" <> '';
