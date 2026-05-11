ALTER TYPE "public"."agent_run_status" ADD VALUE 'blocked' BEFORE 'completed';--> statement-breakpoint
CREATE TABLE "pod_lifecycle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_run_id" uuid,
	"experiment_id" uuid,
	"run_id" uuid,
	"runpod_pod_id" text NOT NULL,
	"account" "runpod_account" DEFAULT 'team' NOT NULL,
	"name" text,
	"gpu_type_id" text,
	"gpu_count" integer,
	"status" text DEFAULT 'deploying' NOT NULL,
	"desired_status" text,
	"ssh_host" text,
	"ssh_port" integer,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"blocked_reason" text,
	"last_error" text,
	"last_checked_at" timestamp with time zone,
	"last_heartbeat_at" timestamp with time zone,
	"stopped_at" timestamp with time zone,
	"terminated_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pod_lifecycle_runpod_pod_id_unique" UNIQUE("runpod_pod_id")
);
--> statement-breakpoint
CREATE TABLE "run_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid,
	"run_id" uuid,
	"agent_run_id" uuid,
	"pod_lifecycle_id" uuid,
	"kind" text NOT NULL,
	"uri" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"metadata" jsonb,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pod_lifecycle" ADD CONSTRAINT "pod_lifecycle_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pod_lifecycle" ADD CONSTRAINT "pod_lifecycle_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pod_lifecycle" ADD CONSTRAINT "pod_lifecycle_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_artifacts" ADD CONSTRAINT "run_artifacts_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_artifacts" ADD CONSTRAINT "run_artifacts_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_artifacts" ADD CONSTRAINT "run_artifacts_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_artifacts" ADD CONSTRAINT "run_artifacts_pod_lifecycle_id_pod_lifecycle_id_fk" FOREIGN KEY ("pod_lifecycle_id") REFERENCES "public"."pod_lifecycle"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pod_lifecycle_agent_run_idx" ON "pod_lifecycle" USING btree ("agent_run_id");--> statement-breakpoint
CREATE INDEX "pod_lifecycle_experiment_idx" ON "pod_lifecycle" USING btree ("experiment_id");--> statement-breakpoint
CREATE INDEX "pod_lifecycle_run_idx" ON "pod_lifecycle" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "pod_lifecycle_status_idx" ON "pod_lifecycle" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pod_lifecycle_pod_idx" ON "pod_lifecycle" USING btree ("runpod_pod_id");--> statement-breakpoint
CREATE INDEX "run_artifacts_experiment_idx" ON "run_artifacts" USING btree ("experiment_id");--> statement-breakpoint
CREATE INDEX "run_artifacts_run_idx" ON "run_artifacts" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "run_artifacts_agent_run_idx" ON "run_artifacts" USING btree ("agent_run_id");--> statement-breakpoint
CREATE INDEX "run_artifacts_pod_lifecycle_idx" ON "run_artifacts" USING btree ("pod_lifecycle_id");--> statement-breakpoint
CREATE INDEX "run_artifacts_status_idx" ON "run_artifacts" USING btree ("status");