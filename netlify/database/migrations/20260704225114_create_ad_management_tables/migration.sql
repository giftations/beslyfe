CREATE TABLE "ad_campaigns" (
	"id" text PRIMARY KEY,
	"event_id" text DEFAULT '' NOT NULL,
	"company_id" text DEFAULT '' NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"rate_type" text DEFAULT 'flat' NOT NULL,
	"rate_amount_cents" integer DEFAULT 0 NOT NULL,
	"budget_cents" integer DEFAULT 0 NOT NULL,
	"priority" integer DEFAULT 1 NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"notes" text DEFAULT '' NOT NULL,
	"details" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_creatives" (
	"id" text PRIMARY KEY,
	"campaign_id" text DEFAULT '' NOT NULL,
	"placement" text DEFAULT 'homepage_banner' NOT NULL,
	"headline" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"image_url" text DEFAULT '' NOT NULL,
	"cta_label" text DEFAULT '' NOT NULL,
	"target_url" text DEFAULT '' NOT NULL,
	"profile_id" text DEFAULT '' NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"details" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_events" (
	"id" text PRIMARY KEY,
	"creative_id" text DEFAULT '' NOT NULL,
	"campaign_id" text DEFAULT '' NOT NULL,
	"placement" text DEFAULT '' NOT NULL,
	"kind" text DEFAULT 'impression' NOT NULL,
	"event_id" text DEFAULT '' NOT NULL,
	"path" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_invoices" (
	"id" text PRIMARY KEY,
	"campaign_id" text DEFAULT '' NOT NULL,
	"company_id" text DEFAULT '' NOT NULL,
	"number" text DEFAULT '' NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"issued_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"line_items" jsonb DEFAULT '[]' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ad_campaigns_event_idx" ON "ad_campaigns" ("event_id");--> statement-breakpoint
CREATE INDEX "ad_campaigns_company_idx" ON "ad_campaigns" ("company_id");--> statement-breakpoint
CREATE INDEX "ad_campaigns_status_idx" ON "ad_campaigns" ("status");--> statement-breakpoint
CREATE INDEX "ad_creatives_campaign_idx" ON "ad_creatives" ("campaign_id");--> statement-breakpoint
CREATE INDEX "ad_creatives_placement_idx" ON "ad_creatives" ("placement");--> statement-breakpoint
CREATE INDEX "ad_events_campaign_idx" ON "ad_events" ("campaign_id","kind");--> statement-breakpoint
CREATE INDEX "ad_events_creative_idx" ON "ad_events" ("creative_id");--> statement-breakpoint
CREATE INDEX "ad_events_created_idx" ON "ad_events" ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ad_invoices_number_idx" ON "ad_invoices" ("number");--> statement-breakpoint
CREATE INDEX "ad_invoices_campaign_idx" ON "ad_invoices" ("campaign_id");--> statement-breakpoint
CREATE INDEX "ad_invoices_company_idx" ON "ad_invoices" ("company_id");--> statement-breakpoint
CREATE INDEX "ad_invoices_status_idx" ON "ad_invoices" ("status");