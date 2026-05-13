ALTER TYPE "public"."experiment_status" ADD VALUE 'gate_pending' BEFORE 'planning';--> statement-breakpoint
ALTER TYPE "public"."experiment_status" ADD VALUE 'implementing' BEFORE 'running';--> statement-breakpoint
ALTER TYPE "public"."experiment_status" ADD VALUE 'code_reviewing' BEFORE 'running';--> statement-breakpoint
ALTER TYPE "public"."experiment_status" ADD VALUE 'testing' BEFORE 'running';--> statement-breakpoint
ALTER TYPE "public"."experiment_status" ADD VALUE 'uploading' BEFORE 'verifying';--> statement-breakpoint
ALTER TYPE "public"."experiment_status" ADD VALUE 'followups_running' BEFORE 'shared';--> statement-breakpoint
ALTER TYPE "public"."experiment_status" ADD VALUE 'done_experiment' BEFORE 'failed';--> statement-breakpoint
ALTER TYPE "public"."experiment_status" ADD VALUE 'done_impl' BEFORE 'failed';