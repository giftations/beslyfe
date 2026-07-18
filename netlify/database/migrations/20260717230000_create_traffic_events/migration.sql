CREATE TABLE IF NOT EXISTS "traffic_events" (
  "id" text PRIMARY KEY,
  "path" text DEFAULT '/' NOT NULL,
  "source" text DEFAULT 'direct' NOT NULL,
  "medium" text DEFAULT '' NOT NULL,
  "campaign" text DEFAULT '' NOT NULL,
  "referrer_host" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "traffic_events_created_idx" ON "traffic_events" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "traffic_events_source_idx" ON "traffic_events" ("source", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "traffic_events_campaign_idx" ON "traffic_events" ("campaign", "created_at");

