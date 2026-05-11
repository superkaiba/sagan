CREATE TYPE "public"."clean_result_status" AS ENUM('draft', 'reviewing', 'approved', 'shared', 'archived', 'blocked');--> statement-breakpoint
ALTER TYPE "public"."entity_kind" ADD VALUE 'clean_result' BEFORE 'todo';--> statement-breakpoint
CREATE TABLE "clean_result_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clean_result_id" uuid NOT NULL,
	"body_md" text NOT NULL,
	"title" text,
	"claim" text,
	"confidence" "confidence",
	"author_kind" text DEFAULT 'user' NOT NULL,
	"edited_by" uuid,
	"source_comment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clean_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid,
	"run_id" uuid,
	"agent_run_id" uuid,
	"source_daily_log_entry_id" uuid,
	"title" text NOT NULL,
	"claim" text NOT NULL,
	"body_md" text NOT NULL,
	"confidence" "confidence",
	"status" "clean_result_status" DEFAULT 'draft' NOT NULL,
	"artifact_status" text DEFAULT 'unverified' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"shared_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clean_result_versions" ADD CONSTRAINT "clean_result_versions_clean_result_id_clean_results_id_fk" FOREIGN KEY ("clean_result_id") REFERENCES "public"."clean_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clean_result_versions" ADD CONSTRAINT "clean_result_versions_edited_by_users_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clean_result_versions" ADD CONSTRAINT "clean_result_versions_source_comment_id_comments_id_fk" FOREIGN KEY ("source_comment_id") REFERENCES "public"."comments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clean_results" ADD CONSTRAINT "clean_results_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clean_results" ADD CONSTRAINT "clean_results_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clean_results" ADD CONSTRAINT "clean_results_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clean_results" ADD CONSTRAINT "clean_results_source_daily_log_entry_id_daily_log_entries_id_fk" FOREIGN KEY ("source_daily_log_entry_id") REFERENCES "public"."daily_log_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clean_results" ADD CONSTRAINT "clean_results_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clean_result_versions_result_idx" ON "clean_result_versions" USING btree ("clean_result_id");--> statement-breakpoint
CREATE INDEX "clean_result_versions_created_idx" ON "clean_result_versions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "clean_results_experiment_idx" ON "clean_results" USING btree ("experiment_id");--> statement-breakpoint
CREATE INDEX "clean_results_run_idx" ON "clean_results" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "clean_results_agent_run_idx" ON "clean_results" USING btree ("agent_run_id");--> statement-breakpoint
CREATE INDEX "clean_results_status_idx" ON "clean_results" USING btree ("status");--> statement-breakpoint
CREATE INDEX "clean_results_approved_idx" ON "clean_results" USING btree ("approved_at");