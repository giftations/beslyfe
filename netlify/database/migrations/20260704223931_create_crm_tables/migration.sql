CREATE TABLE "crm_companies" (
	"id" text PRIMARY KEY,
	"name" text DEFAULT '' NOT NULL,
	"name_key" text DEFAULT '' NOT NULL,
	"website" text DEFAULT '' NOT NULL,
	"industry" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"details" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_company_events" (
	"id" text PRIMARY KEY,
	"company_id" text DEFAULT '' NOT NULL,
	"event_id" text DEFAULT '' NOT NULL,
	"relationship" text DEFAULT 'exhibitor' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_people" (
	"id" text PRIMARY KEY,
	"full_name" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"email_key" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"company_id" text DEFAULT '' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"details" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_person_roles" (
	"id" text PRIMARY KEY,
	"person_id" text DEFAULT '' NOT NULL,
	"role" text DEFAULT 'attendee' NOT NULL,
	"event_id" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"details" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "crm_companies_name_key_idx" ON "crm_companies" ("name_key");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_company_events_unique_idx" ON "crm_company_events" ("company_id","event_id");--> statement-breakpoint
CREATE INDEX "crm_company_events_company_idx" ON "crm_company_events" ("company_id");--> statement-breakpoint
CREATE INDEX "crm_company_events_event_idx" ON "crm_company_events" ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_people_email_key_idx" ON "crm_people" ("email_key");--> statement-breakpoint
CREATE INDEX "crm_people_company_idx" ON "crm_people" ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_person_roles_unique_idx" ON "crm_person_roles" ("person_id","role","event_id");--> statement-breakpoint
CREATE INDEX "crm_person_roles_person_idx" ON "crm_person_roles" ("person_id");--> statement-breakpoint
CREATE INDEX "crm_person_roles_event_idx" ON "crm_person_roles" ("event_id");--> statement-breakpoint
CREATE INDEX "crm_person_roles_role_idx" ON "crm_person_roles" ("role");