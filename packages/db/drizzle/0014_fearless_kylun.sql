CREATE TYPE "public"."assignee_kind" AS ENUM('agent', 'human');--> statement-breakpoint
CREATE TYPE "public"."compute_size" AS ENUM('none', 'small', 'medium', 'large');--> statement-breakpoint
CREATE TYPE "public"."experiment_kind" AS ENUM('experiment', 'infra', 'analysis', 'survey', 'batch');--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "number" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "legacy_gh_number" integer;--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "body" text;--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "kind" "experiment_kind" DEFAULT 'experiment' NOT NULL;--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "compute_size" "compute_size";--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "priority" "priority" DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "assignee_kind" "assignee_kind" DEFAULT 'agent' NOT NULL;--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "has_clean_result" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "experiments_number_idx" ON "experiments" USING btree ("number");--> statement-breakpoint
CREATE INDEX "experiments_kind_idx" ON "experiments" USING btree ("kind");--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_number_unique" UNIQUE("number");