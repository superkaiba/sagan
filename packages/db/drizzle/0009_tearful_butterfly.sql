ALTER TABLE "lit_items" ADD COLUMN "summary_md" text;--> statement-breakpoint
ALTER TABLE "lit_items" ADD COLUMN "relevance_reason_md" text;--> statement-breakpoint
ALTER TABLE "lit_items" ADD COLUMN "threat_reason_md" text;--> statement-breakpoint
ALTER TABLE "lit_items" ADD COLUMN "last_ranked_at" timestamp with time zone;