CREATE TYPE "public"."access_invite_status" AS ENUM('pending', 'accepted', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."entity_membership_role" AS ENUM('owner', 'collaborator', 'mentor', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('comment', 'mention', 'claude_started', 'claude_finished', 'membership', 'system');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner', 'collaborator', 'mentor');--> statement-breakpoint
ALTER TYPE "public"."entity_kind" ADD VALUE 'daily_log_entry';--> statement-breakpoint
ALTER TYPE "public"."entity_kind" ADD VALUE 'weekly_digest';--> statement-breakpoint
CREATE TABLE "access_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"role" "entity_membership_role" NOT NULL,
	"entity_kind" "entity_kind" NOT NULL,
	"entity_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"status" "access_invite_status" DEFAULT 'pending' NOT NULL,
	"created_by" uuid,
	"invited_user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "comment_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"entity_kind" "entity_kind" NOT NULL,
	"entity_id" uuid NOT NULL,
	"root_comment_id" uuid,
	"reason" text DEFAULT 'commented' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comment_subscriptions_user_entity_root_uq" UNIQUE("user_id","entity_kind","entity_id","root_comment_id")
);
--> statement-breakpoint
CREATE TABLE "entity_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"entity_kind" "entity_kind" NOT NULL,
	"entity_id" uuid NOT NULL,
	"role" "entity_membership_role" DEFAULT 'viewer' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entity_memberships_user_entity_uq" UNIQUE("user_id","entity_kind","entity_id")
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"email_comments" boolean DEFAULT true NOT NULL,
	"email_mentions" boolean DEFAULT true NOT NULL,
	"email_claude_replies" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"kind" "notification_kind" NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"entity_kind" "entity_kind",
	"entity_id" uuid,
	"comment_id" uuid,
	"agent_run_id" uuid,
	"email_status" text DEFAULT 'pending' NOT NULL,
	"emailed_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "user_role" DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "access_invites" ADD CONSTRAINT "access_invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_invites" ADD CONSTRAINT "access_invites_invited_user_id_users_id_fk" FOREIGN KEY ("invited_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_subscriptions" ADD CONSTRAINT "comment_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_subscriptions" ADD CONSTRAINT "comment_subscriptions_root_comment_id_comments_id_fk" FOREIGN KEY ("root_comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_memberships" ADD CONSTRAINT "entity_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_memberships" ADD CONSTRAINT "entity_memberships_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_invites_email_idx" ON "access_invites" USING btree ("email");--> statement-breakpoint
CREATE INDEX "access_invites_entity_idx" ON "access_invites" USING btree ("entity_kind","entity_id");--> statement-breakpoint
CREATE INDEX "access_invites_token_idx" ON "access_invites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "comment_subscriptions_user_idx" ON "comment_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "comment_subscriptions_entity_idx" ON "comment_subscriptions" USING btree ("entity_kind","entity_id");--> statement-breakpoint
CREATE INDEX "comment_subscriptions_root_idx" ON "comment_subscriptions" USING btree ("root_comment_id");--> statement-breakpoint
CREATE INDEX "entity_memberships_user_idx" ON "entity_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "entity_memberships_entity_idx" ON "entity_memberships" USING btree ("entity_kind","entity_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "notifications_entity_idx" ON "notifications" USING btree ("entity_kind","entity_id");--> statement-breakpoint
CREATE INDEX "notifications_comment_idx" ON "notifications" USING btree ("comment_id");--> statement-breakpoint
CREATE INDEX "notifications_agent_run_idx" ON "notifications" USING btree ("agent_run_id");