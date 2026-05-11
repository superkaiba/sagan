CREATE TYPE "public"."approval_request_kind" AS ENUM('experiment_plan', 'queue_launch', 'clean_result_promotion');--> statement-breakpoint
CREATE TYPE "public"."approval_request_status" AS ENUM('pending', 'approved', 'deferred', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."workflow_event_type" AS ENUM('created', 'state_changed', 'approval_requested', 'approved', 'deferred', 'rejected', 'blocked', 'note');--> statement-breakpoint
ALTER TYPE "public"."experiment_status" ADD VALUE 'proposed' BEFORE 'planning';--> statement-breakpoint
ALTER TYPE "public"."experiment_status" ADD VALUE 'plan_pending' BEFORE 'awaiting_approval';--> statement-breakpoint
ALTER TYPE "public"."experiment_status" ADD VALUE 'approved' BEFORE 'awaiting_approval';--> statement-breakpoint
ALTER TYPE "public"."experiment_status" ADD VALUE 'verifying' BEFORE 'completed';--> statement-breakpoint
ALTER TYPE "public"."experiment_status" ADD VALUE 'interpreting' BEFORE 'completed';--> statement-breakpoint
ALTER TYPE "public"."experiment_status" ADD VALUE 'reviewing' BEFORE 'completed';--> statement-breakpoint
ALTER TYPE "public"."experiment_status" ADD VALUE 'awaiting_promotion' BEFORE 'completed';--> statement-breakpoint
ALTER TYPE "public"."experiment_status" ADD VALUE 'shared' BEFORE 'completed';--> statement-breakpoint
ALTER TYPE "public"."experiment_status" ADD VALUE 'blocked' BEFORE 'completed';--> statement-breakpoint
CREATE TABLE "approval_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "approval_request_kind" NOT NULL,
	"status" "approval_request_status" DEFAULT 'pending' NOT NULL,
	"entity_kind" "entity_kind" NOT NULL,
	"entity_id" uuid NOT NULL,
	"experiment_id" uuid,
	"agent_run_id" uuid,
	"requested_by" uuid,
	"resolved_by" uuid,
	"title" text NOT NULL,
	"body_md" text,
	"requested_state" text,
	"approved_state" text,
	"rejected_state" text,
	"metadata" jsonb,
	"resolved_note" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_kind" "entity_kind" NOT NULL,
	"entity_id" uuid NOT NULL,
	"event_type" "workflow_event_type" NOT NULL,
	"from_status" text,
	"to_status" text,
	"actor_kind" text DEFAULT 'system' NOT NULL,
	"actor_user_id" uuid,
	"note" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_events" ADD CONSTRAINT "workflow_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approval_requests_status_idx" ON "approval_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "approval_requests_entity_idx" ON "approval_requests" USING btree ("entity_kind","entity_id");--> statement-breakpoint
CREATE INDEX "approval_requests_experiment_idx" ON "approval_requests" USING btree ("experiment_id");--> statement-breakpoint
CREATE INDEX "approval_requests_created_idx" ON "approval_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "workflow_events_entity_idx" ON "workflow_events" USING btree ("entity_kind","entity_id");--> statement-breakpoint
CREATE INDEX "workflow_events_type_idx" ON "workflow_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "workflow_events_created_idx" ON "workflow_events" USING btree ("created_at");