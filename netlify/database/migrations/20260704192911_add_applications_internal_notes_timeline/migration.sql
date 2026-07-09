ALTER TABLE "applications" ADD COLUMN "internal_notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "timeline" jsonb DEFAULT '[]' NOT NULL;