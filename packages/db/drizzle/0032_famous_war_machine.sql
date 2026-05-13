CREATE TYPE "public"."lit_topic" AS ENUM('current_project', 'general_safety', 'general_ai', 'cognitive_science', 'neuroscience', 'other');--> statement-breakpoint
ALTER TABLE "lit_items" ADD COLUMN "topic" "lit_topic" DEFAULT 'other' NOT NULL;--> statement-breakpoint
CREATE INDEX "lit_items_topic_idx" ON "lit_items" USING btree ("topic");