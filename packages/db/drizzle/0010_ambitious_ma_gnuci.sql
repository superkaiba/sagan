CREATE TABLE "idea_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body_md" text NOT NULL,
	"author_kind" text DEFAULT 'sagan' NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"source_kind" "entity_kind" NOT NULL,
	"source_id" uuid NOT NULL,
	"promotion_kind" text,
	"promoted_kind" "entity_kind",
	"promoted_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idea_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"source_kind" "entity_kind" NOT NULL,
	"source_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"notes_md" text,
	"prompt_deck" jsonb,
	"created_by" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "idea_cards" ADD CONSTRAINT "idea_cards_session_id_idea_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."idea_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_sessions" ADD CONSTRAINT "idea_sessions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idea_cards_session_idx" ON "idea_cards" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idea_cards_state_idx" ON "idea_cards" USING btree ("state");--> statement-breakpoint
CREATE INDEX "idea_cards_source_idx" ON "idea_cards" USING btree ("source_kind","source_id");--> statement-breakpoint
CREATE INDEX "idea_cards_promoted_idx" ON "idea_cards" USING btree ("promoted_kind","promoted_id");--> statement-breakpoint
CREATE INDEX "idea_sessions_source_idx" ON "idea_sessions" USING btree ("source_kind","source_id");--> statement-breakpoint
CREATE INDEX "idea_sessions_status_idx" ON "idea_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idea_sessions_created_idx" ON "idea_sessions" USING btree ("created_at");