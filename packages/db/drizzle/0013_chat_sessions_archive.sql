ALTER TABLE "chat_sessions" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "chat_sessions_archived_idx" ON "chat_sessions" USING btree ("archived_at");
