CREATE TYPE "public"."job_run_kind" AS ENUM('lit_review', 'weekly_digest', 'insight_scan', 'comment_summary', 'clean_result');--> statement-breakpoint
CREATE TYPE "public"."job_run_status" AS ENUM('queued', 'running', 'completed', 'failed', 'skipped');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day" date DEFAULT CURRENT_DATE NOT NULL,
	"actor_kind" text DEFAULT 'system' NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"why" text NOT NULL,
	"detail" text,
	"entity_kind" "entity_kind",
	"entity_id" uuid,
	"source" text DEFAULT 'web' NOT NULL,
	"correlation_id" text,
	"agent_run_id" uuid,
	"job_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "job_run_kind" NOT NULL,
	"status" "job_run_status" DEFAULT 'queued' NOT NULL,
	"requested_by" uuid,
	"request_payload" jsonb,
	"result_payload" jsonb,
	"last_error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_job_run_id_job_runs_id_fk" FOREIGN KEY ("job_run_id") REFERENCES "public"."job_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_day_idx" ON "audit_events" USING btree ("day");--> statement-breakpoint
CREATE INDEX "audit_events_entity_idx" ON "audit_events" USING btree ("entity_kind","entity_id");--> statement-breakpoint
CREATE INDEX "audit_events_agent_run_idx" ON "audit_events" USING btree ("agent_run_id");--> statement-breakpoint
CREATE INDEX "audit_events_job_run_idx" ON "audit_events" USING btree ("job_run_id");--> statement-breakpoint
CREATE INDEX "audit_events_correlation_idx" ON "audit_events" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "job_runs_kind_idx" ON "job_runs" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "job_runs_status_idx" ON "job_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "job_runs_created_idx" ON "job_runs" USING btree ("created_at");