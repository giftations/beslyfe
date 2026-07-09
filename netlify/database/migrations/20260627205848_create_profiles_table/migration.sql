CREATE TABLE "profiles" (
	"id" text PRIMARY KEY,
	"role" text DEFAULT 'attendee' NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"company" text DEFAULT '' NOT NULL,
	"tagline" text DEFAULT '' NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"website" text DEFAULT '' NOT NULL,
	"headshot_url" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'approved' NOT NULL,
	"details" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
