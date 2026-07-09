CREATE TABLE "ticket_orders" (
	"id" text PRIMARY KEY,
	"event_id" text DEFAULT '' NOT NULL,
	"provider_id" text DEFAULT '' NOT NULL,
	"provider" text DEFAULT 'generic' NOT NULL,
	"external_order_id" text DEFAULT '' NOT NULL,
	"dedup_key" text DEFAULT '' NOT NULL,
	"buyer_name" text DEFAULT '' NOT NULL,
	"buyer_email" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"tier_name" text DEFAULT '' NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"gross_cents" integer DEFAULT 0 NOT NULL,
	"fees_cents" integer DEFAULT 0 NOT NULL,
	"net_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"purchased_at" timestamp with time zone,
	"raw" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_providers" (
	"id" text PRIMARY KEY,
	"event_id" text DEFAULT '' NOT NULL,
	"provider" text DEFAULT 'generic' NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"external_event_id" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"ingest_token_hash" text DEFAULT '' NOT NULL,
	"ingest_token_hint" text DEFAULT '' NOT NULL,
	"last_sync_at" timestamp with time zone,
	"orders_ingested" integer DEFAULT 0 NOT NULL,
	"settings" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_orders_dedup_idx" ON "ticket_orders" ("dedup_key");--> statement-breakpoint
CREATE INDEX "ticket_orders_event_idx" ON "ticket_orders" ("event_id");--> statement-breakpoint
CREATE INDEX "ticket_orders_provider_idx" ON "ticket_orders" ("provider_id");--> statement-breakpoint
CREATE INDEX "ticket_orders_purchased_idx" ON "ticket_orders" ("purchased_at");--> statement-breakpoint
CREATE INDEX "ticket_orders_status_idx" ON "ticket_orders" ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_providers_token_hash_idx" ON "ticket_providers" ("ingest_token_hash");--> statement-breakpoint
CREATE INDEX "ticket_providers_event_idx" ON "ticket_providers" ("event_id");