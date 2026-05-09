CREATE TYPE "public"."agent_provider" AS ENUM('claude_code', 'codex');--> statement-breakpoint
CREATE TYPE "public"."agent_run_kind" AS ENUM('plan', 'apply', 'qa', 'experiment');--> statement-breakpoint
CREATE TYPE "public"."agent_run_status" AS ENUM('queued', 'running', 'awaiting_approval', 'approved', 'rejected', 'deploying', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."belief_status" AS ENUM('draft', 'active', 'supported', 'weakened', 'falsified', 'retracted', 'archived');--> statement-breakpoint
CREATE TYPE "public"."chat_role" AS ENUM('user', 'assistant', 'tool', 'system');--> statement-breakpoint
CREATE TYPE "public"."comment_author_kind" AS ENUM('human', 'claude', 'system');--> statement-breakpoint
CREATE TYPE "public"."comment_kind" AS ENUM('discussion', 'ask_claude', 'todo');--> statement-breakpoint
CREATE TYPE "public"."confidence" AS ENUM('LOW', 'MODERATE', 'HIGH');--> statement-breakpoint
CREATE TYPE "public"."daily_log_kind" AS ENUM('clean_result', 'blocker', 'decision', 'note');--> statement-breakpoint
CREATE TYPE "public"."edge_type" AS ENUM('parent', 'child', 'sibling', 'supports', 'contradicts', 'derives_from', 'cites', 'tests', 'produces_evidence_for', 'blocks', 'answers', 'duplicates', 'method', 'baseline', 'background', 'threat', 'inspiration');--> statement-breakpoint
CREATE TYPE "public"."entity_kind" AS ENUM('project', 'belief', 'experiment', 'run', 'todo', 'lit_item', 'project_narrative');--> statement-breakpoint
CREATE TYPE "public"."experiment_status" AS ENUM('planning', 'awaiting_approval', 'queued', 'running', 'completed', 'failed', 'cancelled', 'archived');--> statement-breakpoint
CREATE TYPE "public"."lit_item_type" AS ENUM('paper', 'blog_post', 'forum_post', 'newsletter', 'report', 'repo', 'video', 'other');--> statement-breakpoint
CREATE TYPE "public"."lit_read_state" AS ENUM('unread', 'queued', 'reading', 'read', 'archived');--> statement-breakpoint
CREATE TYPE "public"."lit_source_kind" AS ENUM('arxiv', 'openreview', 'semantic_scholar', 'hn', 'twitter_list', 'rss');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."project_narrative_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('active', 'paused', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."run_classification" AS ENUM('pending', 'useful', 'not_useful', 'archived');--> statement-breakpoint
CREATE TYPE "public"."todo_intent" AS ENUM('exploratory', 'hypothesis', 'replication', 'measurement', 'engineering');--> statement-breakpoint
CREATE TYPE "public"."todo_status" AS ENUM('inbox', 'scoped', 'planning', 'open', 'in_progress', 'running', 'interpreting', 'awaiting_promotion', 'blocked', 'done', 'cancelled', 'archived');--> statement-breakpoint
CREATE TABLE "agent_run_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"body" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "agent_run_kind" NOT NULL,
	"provider" "agent_provider" DEFAULT 'claude_code' NOT NULL,
	"status" "agent_run_status" DEFAULT 'queued' NOT NULL,
	"request" text NOT NULL,
	"plan_md" text,
	"approval_required" boolean DEFAULT true NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"scope_entity_kind" "entity_kind",
	"scope_entity_id" uuid,
	"chat_session_id" uuid,
	"branch_name" text,
	"vercel_deployment_url" text,
	"runpod_pod_id" text,
	"runpod_status" text,
	"transcript_log_path" text,
	"changed_files_json" jsonb,
	"last_error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "belief_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"belief_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"edited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_by" uuid
);
--> statement-breakpoint
CREATE TABLE "beliefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"slug" varchar(120),
	"title" text NOT NULL,
	"dense_description" text,
	"current_belief" text,
	"motivation" text,
	"evidence" text,
	"counterevidence" text,
	"epistemic_status" text,
	"confidence" "confidence" DEFAULT 'MODERATE' NOT NULL,
	"status" "belief_status" DEFAULT 'draft' NOT NULL,
	"topic" text,
	"kill_criteria" text,
	"next_test" text,
	"public" boolean DEFAULT false NOT NULL,
	"embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "beliefs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"role" "chat_role" NOT NULL,
	"body" text,
	"tool_call_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope_entity_kind" "entity_kind",
	"scope_entity_id" uuid,
	"agent_handle" text,
	"created_by_user_id" uuid,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_kind" "entity_kind" NOT NULL,
	"entity_id" uuid NOT NULL,
	"parent_comment_id" uuid,
	"author_user_id" uuid,
	"author_kind" "comment_author_kind" DEFAULT 'human' NOT NULL,
	"kind" "comment_kind" DEFAULT 'discussion' NOT NULL,
	"body" text NOT NULL,
	"anchor_node_id" text,
	"anchored_quote" text,
	"mentions" text[],
	"auto_continue_claude" boolean DEFAULT false NOT NULL,
	"agent_run_id" uuid,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"resolved_summary_md" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_digests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day" date NOT NULL,
	"body_md" text NOT NULL,
	"snapshot_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_digests_day_unique" UNIQUE("day")
);
--> statement-breakpoint
CREATE TABLE "daily_log_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day" date NOT NULL,
	"kind" "daily_log_kind" NOT NULL,
	"body_md" text NOT NULL,
	"entity_kind" "entity_kind",
	"entity_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_kind" "entity_kind" NOT NULL,
	"from_id" uuid NOT NULL,
	"to_kind" "entity_kind" NOT NULL,
	"to_id" uuid NOT NULL,
	"type" "edge_type" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "edges_unique" UNIQUE("from_kind","from_id","to_kind","to_id","type")
);
--> statement-breakpoint
CREATE TABLE "experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"belief_id" uuid,
	"project_id" uuid,
	"title" text NOT NULL,
	"hypothesis" text,
	"plan_json" jsonb,
	"config_yaml" text,
	"status" "experiment_status" DEFAULT 'planning' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "figures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_kind" "entity_kind" NOT NULL,
	"entity_id" uuid NOT NULL,
	"url" text NOT NULL,
	"caption" text,
	"alt_text" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kanban_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"column_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body_md" text,
	"linked_kind" "entity_kind",
	"linked_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"due" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kanban_columns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_slug" varchar(120) NOT NULL,
	"title" text NOT NULL,
	"position" integer NOT NULL,
	"color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lit_inbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lit_item_id" uuid NOT NULL,
	"source_id" uuid,
	"surfaced_on" date NOT NULL,
	"score" integer,
	"reason_md" text,
	"dismissed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lit_inbox_item_day_uq" UNIQUE("lit_item_id","surfaced_on")
);
--> statement-breakpoint
CREATE TABLE "lit_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "lit_item_type" DEFAULT 'paper' NOT NULL,
	"title" text NOT NULL,
	"authors" jsonb,
	"abstract" text,
	"url" text,
	"pdf_url" text,
	"arxiv_id" varchar(64),
	"doi" varchar(200),
	"tags" jsonb,
	"read_state" "lit_read_state" DEFAULT 'unread' NOT NULL,
	"queue_position" integer,
	"public" boolean DEFAULT false NOT NULL,
	"embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lit_items_arxiv_uq" UNIQUE("arxiv_id"),
	CONSTRAINT "lit_items_doi_uq" UNIQUE("doi")
);
--> statement-breakpoint
CREATE TABLE "lit_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "lit_source_kind" NOT NULL,
	"title" text NOT NULL,
	"config" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_polled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_narratives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body_md" text NOT NULL,
	"status" "project_narrative_status" DEFAULT 'draft' NOT NULL,
	"generated_from_kind" "entity_kind",
	"generated_from_id" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(120) NOT NULL,
	"title" text NOT NULL,
	"summary_md" text,
	"status" "project_status" DEFAULT 'active' NOT NULL,
	"public" boolean DEFAULT false NOT NULL,
	"share_token" text,
	"embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_slug_unique" UNIQUE("slug"),
	CONSTRAINT "projects_share_token_unique" UNIQUE("share_token")
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid NOT NULL,
	"seed" integer,
	"config_yaml" text,
	"wandb_url" text,
	"hf_url" text,
	"metrics_json" jsonb,
	"classification" "run_classification" DEFAULT 'pending' NOT NULL,
	"notes_md" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_kind" "entity_kind" NOT NULL,
	"entity_id" uuid NOT NULL,
	"token" text NOT NULL,
	"granted_to_email" varchar(320),
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "share_grants_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "todos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"text" text NOT NULL,
	"body_md" text,
	"status" "todo_status" DEFAULT 'inbox' NOT NULL,
	"intent_mode" "todo_intent",
	"priority" "priority" DEFAULT 'normal' NOT NULL,
	"due" timestamp with time zone,
	"linked_kind" "entity_kind",
	"linked_id" uuid,
	"owner_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "weekly_digests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_start" date NOT NULL,
	"body_md" text NOT NULL,
	"drafted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"share_token" text,
	CONSTRAINT "weekly_digests_week_start_unique" UNIQUE("week_start"),
	CONSTRAINT "weekly_digests_share_token_unique" UNIQUE("share_token")
);
--> statement-breakpoint
ALTER TABLE "agent_run_events" ADD CONSTRAINT "agent_run_events_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "belief_versions" ADD CONSTRAINT "belief_versions_belief_id_beliefs_id_fk" FOREIGN KEY ("belief_id") REFERENCES "public"."beliefs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "belief_versions" ADD CONSTRAINT "belief_versions_edited_by_users_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beliefs" ADD CONSTRAINT "beliefs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_belief_id_beliefs_id_fk" FOREIGN KEY ("belief_id") REFERENCES "public"."beliefs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_cards" ADD CONSTRAINT "kanban_cards_column_id_kanban_columns_id_fk" FOREIGN KEY ("column_id") REFERENCES "public"."kanban_columns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lit_inbox" ADD CONSTRAINT "lit_inbox_lit_item_id_lit_items_id_fk" FOREIGN KEY ("lit_item_id") REFERENCES "public"."lit_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lit_inbox" ADD CONSTRAINT "lit_inbox_source_id_lit_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."lit_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_narratives" ADD CONSTRAINT "project_narratives_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_run_events_run_idx" ON "agent_run_events" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "agent_run_events_type_idx" ON "agent_run_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "agent_runs_status_idx" ON "agent_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_runs_kind_idx" ON "agent_runs" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "agent_runs_scope_idx" ON "agent_runs" USING btree ("scope_entity_kind","scope_entity_id");--> statement-breakpoint
CREATE INDEX "agent_runs_created_idx" ON "agent_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "belief_versions_belief_idx" ON "belief_versions" USING btree ("belief_id");--> statement-breakpoint
CREATE INDEX "belief_versions_edited_idx" ON "belief_versions" USING btree ("edited_at");--> statement-breakpoint
CREATE INDEX "beliefs_project_idx" ON "beliefs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "beliefs_status_idx" ON "beliefs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "beliefs_topic_idx" ON "beliefs" USING btree ("topic");--> statement-breakpoint
CREATE INDEX "beliefs_updated_idx" ON "beliefs" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "chat_messages_session_idx" ON "chat_messages" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "chat_messages_created_idx" ON "chat_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "chat_sessions_scope_idx" ON "chat_sessions" USING btree ("scope_entity_kind","scope_entity_id");--> statement-breakpoint
CREATE INDEX "chat_sessions_last_msg_idx" ON "chat_sessions" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "comments_entity_idx" ON "comments" USING btree ("entity_kind","entity_id");--> statement-breakpoint
CREATE INDEX "comments_parent_idx" ON "comments" USING btree ("parent_comment_id");--> statement-breakpoint
CREATE INDEX "comments_resolved_idx" ON "comments" USING btree ("resolved_at");--> statement-breakpoint
CREATE INDEX "daily_digests_day_idx" ON "daily_digests" USING btree ("day");--> statement-breakpoint
CREATE INDEX "daily_log_day_idx" ON "daily_log_entries" USING btree ("day");--> statement-breakpoint
CREATE INDEX "daily_log_entity_idx" ON "daily_log_entries" USING btree ("entity_kind","entity_id");--> statement-breakpoint
CREATE INDEX "edges_from_idx" ON "edges" USING btree ("from_kind","from_id");--> statement-breakpoint
CREATE INDEX "edges_to_idx" ON "edges" USING btree ("to_kind","to_id");--> statement-breakpoint
CREATE INDEX "edges_type_idx" ON "edges" USING btree ("type");--> statement-breakpoint
CREATE INDEX "experiments_belief_idx" ON "experiments" USING btree ("belief_id");--> statement-breakpoint
CREATE INDEX "experiments_project_idx" ON "experiments" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "experiments_status_idx" ON "experiments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "figures_entity_idx" ON "figures" USING btree ("entity_kind","entity_id");--> statement-breakpoint
CREATE INDEX "kanban_cards_column_idx" ON "kanban_cards" USING btree ("column_id");--> statement-breakpoint
CREATE INDEX "kanban_cards_linked_idx" ON "kanban_cards" USING btree ("linked_kind","linked_id");--> statement-breakpoint
CREATE INDEX "kanban_columns_board_idx" ON "kanban_columns" USING btree ("board_slug");--> statement-breakpoint
CREATE INDEX "lit_inbox_day_idx" ON "lit_inbox" USING btree ("surfaced_on");--> statement-breakpoint
CREATE INDEX "lit_items_type_idx" ON "lit_items" USING btree ("type");--> statement-breakpoint
CREATE INDEX "lit_items_read_state_idx" ON "lit_items" USING btree ("read_state");--> statement-breakpoint
CREATE INDEX "lit_sources_kind_idx" ON "lit_sources" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "project_narratives_project_idx" ON "project_narratives" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_narratives_status_idx" ON "project_narratives" USING btree ("status");--> statement-breakpoint
CREATE INDEX "projects_status_idx" ON "projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "runs_experiment_idx" ON "runs" USING btree ("experiment_id");--> statement-breakpoint
CREATE INDEX "runs_classification_idx" ON "runs" USING btree ("classification");--> statement-breakpoint
CREATE INDEX "runs_completed_idx" ON "runs" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "share_grants_entity_idx" ON "share_grants" USING btree ("entity_kind","entity_id");--> statement-breakpoint
CREATE INDEX "share_grants_token_idx" ON "share_grants" USING btree ("token");--> statement-breakpoint
CREATE INDEX "todos_status_idx" ON "todos" USING btree ("status");--> statement-breakpoint
CREATE INDEX "todos_linked_idx" ON "todos" USING btree ("linked_kind","linked_id");--> statement-breakpoint
CREATE INDEX "weekly_digests_week_idx" ON "weekly_digests" USING btree ("week_start");