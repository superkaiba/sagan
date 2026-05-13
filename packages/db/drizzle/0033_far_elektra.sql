ALTER TYPE "public"."agent_run_kind" ADD VALUE 'classify' BEFORE 'plan';--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "converted_to_kind" "entity_kind";--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "converted_to_id" uuid;--> statement-breakpoint
ALTER TABLE "todos" ADD COLUMN "converted_to_kind" "entity_kind";--> statement-breakpoint
ALTER TABLE "todos" ADD COLUMN "converted_to_id" uuid;