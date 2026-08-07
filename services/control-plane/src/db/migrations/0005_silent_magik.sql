ALTER TABLE "task" ADD COLUMN "supervisor_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "supervisor_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "supervisor_models" text;