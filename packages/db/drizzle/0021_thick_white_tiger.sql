ALTER TABLE "pod_lifecycle" ADD COLUMN "cost_per_hr" double precision;--> statement-breakpoint
ALTER TABLE "pod_lifecycle" ADD COLUMN "adjusted_cost_per_hr" double precision;--> statement-breakpoint
ALTER TABLE "pod_lifecycle" ADD COLUMN "uptime_seconds" integer;--> statement-breakpoint
ALTER TABLE "pod_lifecycle" ADD COLUMN "last_started_at" timestamp with time zone;