CREATE TYPE "public"."runpod_account" AS ENUM('team', 'personal');--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "runpod_account" "runpod_account" DEFAULT 'team' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "runpod_pod_ids" text[];--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "runpod_account" "runpod_account" DEFAULT 'team' NOT NULL;