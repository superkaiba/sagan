ALTER TABLE "experiments" ADD COLUMN IF NOT EXISTS "auto_approve_plan" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN IF NOT EXISTS "parent_experiment_id" uuid;
