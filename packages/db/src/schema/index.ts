import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
  vector,
} from 'drizzle-orm/pg-core';

// ─── Enums ─────────────────────────────────────────────────────────────────

export const entityKindEnum = pgEnum('entity_kind', [
  'project',
  'belief',
  'experiment',
  'run',
  'todo',
  'lit_item',
  'project_narrative',
]);

export const confidenceEnum = pgEnum('confidence', ['LOW', 'MODERATE', 'HIGH']);

export const beliefStatusEnum = pgEnum('belief_status', [
  'draft',
  'active',
  'supported',
  'weakened',
  'falsified',
  'retracted',
  'archived',
]);

export const projectStatusEnum = pgEnum('project_status', [
  'active',
  'paused',
  'completed',
  'archived',
]);

export const projectNarrativeStatusEnum = pgEnum('project_narrative_status', [
  'draft',
  'published',
  'archived',
]);

export const todoStatusEnum = pgEnum('todo_status', [
  'inbox',
  'scoped',
  'planning',
  'open',
  'in_progress',
  'running',
  'interpreting',
  'awaiting_promotion',
  'blocked',
  'done',
  'cancelled',
  'archived',
]);

export const todoIntentEnum = pgEnum('todo_intent', [
  'exploratory',
  'hypothesis',
  'replication',
  'measurement',
  'engineering',
]);

export const priorityEnum = pgEnum('priority', ['low', 'normal', 'high', 'urgent']);

export const experimentStatusEnum = pgEnum('experiment_status', [
  'planning',
  'awaiting_approval',
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
  'archived',
]);

export const runClassificationEnum = pgEnum('run_classification', [
  'pending',
  'useful',
  'not_useful',
  'archived',
]);

export const litItemTypeEnum = pgEnum('lit_item_type', [
  'paper',
  'blog_post',
  'forum_post',
  'newsletter',
  'report',
  'repo',
  'video',
  'other',
]);

export const litReadStateEnum = pgEnum('lit_read_state', [
  'unread',
  'queued',
  'reading',
  'read',
  'archived',
]);

export const litSourceKindEnum = pgEnum('lit_source_kind', [
  'arxiv',
  'openreview',
  'semantic_scholar',
  'hn',
  'twitter_list',
  'rss',
]);

export const edgeTypeEnum = pgEnum('edge_type', [
  'parent',
  'child',
  'sibling',
  'supports',
  'contradicts',
  'derives_from',
  'cites',
  'tests',
  'produces_evidence_for',
  'blocks',
  'answers',
  'duplicates',
  'method',
  'baseline',
  'background',
  'threat',
  'inspiration',
]);

export const agentRunKindEnum = pgEnum('agent_run_kind', [
  'plan',
  'apply',
  'qa',
  'experiment',
]);

export const agentRunStatusEnum = pgEnum('agent_run_status', [
  'queued',
  'running',
  'awaiting_approval',
  'approved',
  'rejected',
  'deploying',
  'completed',
  'failed',
  'cancelled',
]);

export const agentProviderEnum = pgEnum('agent_provider', ['claude_code', 'codex']);

export const chatRoleEnum = pgEnum('chat_role', ['user', 'assistant', 'tool', 'system']);

export const commentAuthorKindEnum = pgEnum('comment_author_kind', [
  'human',
  'claude',
  'system',
]);

export const commentKindEnum = pgEnum('comment_kind', ['discussion', 'ask_claude', 'todo']);

export const dailyLogKindEnum = pgEnum('daily_log_kind', [
  'clean_result',
  'blocker',
  'decision',
  'note',
]);

// ─── Auth ──────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 320 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('sessions_user_idx').on(t.userId),
    expiresIdx: index('sessions_expires_idx').on(t.expiresAt),
  }),
);

// ─── Projects ──────────────────────────────────────────────────────────────

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: varchar('slug', { length: 120 }).notNull().unique(),
    title: text('title').notNull(),
    summaryMd: text('summary_md'),
    status: projectStatusEnum('status').notNull().default('active'),
    public: boolean('public').notNull().default(false),
    shareToken: text('share_token').unique(),
    embedding: vector('embedding', { dimensions: 1536 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index('projects_status_idx').on(t.status),
  }),
);

export const projectNarratives = pgTable(
  'project_narratives',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    bodyMd: text('body_md').notNull(),
    status: projectNarrativeStatusEnum('status').notNull().default('draft'),
    generatedFromKind: entityKindEnum('generated_from_kind'),
    generatedFromId: uuid('generated_from_id'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    projectIdx: index('project_narratives_project_idx').on(t.projectId),
    statusIdx: index('project_narratives_status_idx').on(t.status),
  }),
);

// ─── Beliefs (formerly belief + claim) ─────────────────────────────────────

export const beliefs = pgTable(
  'beliefs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    slug: varchar('slug', { length: 120 }).unique(),
    title: text('title').notNull(),
    denseDescription: text('dense_description'),
    currentBelief: text('current_belief'),
    motivation: text('motivation'),
    evidence: text('evidence'),
    counterevidence: text('counterevidence'),
    epistemicStatus: text('epistemic_status'),
    confidence: confidenceEnum('confidence').notNull().default('MODERATE'),
    status: beliefStatusEnum('status').notNull().default('draft'),
    topic: text('topic'),
    killCriteria: text('kill_criteria'),
    nextTest: text('next_test'),
    public: boolean('public').notNull().default(false),
    embedding: vector('embedding', { dimensions: 1536 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    projectIdx: index('beliefs_project_idx').on(t.projectId),
    statusIdx: index('beliefs_status_idx').on(t.status),
    topicIdx: index('beliefs_topic_idx').on(t.topic),
    updatedIdx: index('beliefs_updated_idx').on(t.updatedAt),
  }),
);

export const beliefVersions = pgTable(
  'belief_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    beliefId: uuid('belief_id')
      .notNull()
      .references(() => beliefs.id, { onDelete: 'cascade' }),
    snapshot: jsonb('snapshot').notNull(),
    editedAt: timestamp('edited_at', { withTimezone: true }).notNull().defaultNow(),
    editedBy: uuid('edited_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => ({
    beliefIdx: index('belief_versions_belief_idx').on(t.beliefId),
    editedIdx: index('belief_versions_edited_idx').on(t.editedAt),
  }),
);

// ─── Experiments + runs ────────────────────────────────────────────────────

export const experiments = pgTable(
  'experiments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    beliefId: uuid('belief_id').references(() => beliefs.id, { onDelete: 'set null' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    hypothesis: text('hypothesis'),
    planJson: jsonb('plan_json'),
    configYaml: text('config_yaml'),
    status: experimentStatusEnum('status').notNull().default('planning'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    beliefIdx: index('experiments_belief_idx').on(t.beliefId),
    projectIdx: index('experiments_project_idx').on(t.projectId),
    statusIdx: index('experiments_status_idx').on(t.status),
  }),
);

export const runs = pgTable(
  'runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    experimentId: uuid('experiment_id')
      .notNull()
      .references(() => experiments.id, { onDelete: 'cascade' }),
    seed: integer('seed'),
    configYaml: text('config_yaml'),
    wandbUrl: text('wandb_url'),
    hfUrl: text('hf_url'),
    metricsJson: jsonb('metrics_json'),
    classification: runClassificationEnum('classification').notNull().default('pending'),
    notesMd: text('notes_md'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    experimentIdx: index('runs_experiment_idx').on(t.experimentId),
    classificationIdx: index('runs_classification_idx').on(t.classification),
    completedIdx: index('runs_completed_idx').on(t.completedAt),
  }),
);

// ─── Todos ─────────────────────────────────────────────────────────────────

export const todos = pgTable(
  'todos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    text: text('text').notNull(),
    bodyMd: text('body_md'),
    status: todoStatusEnum('status').notNull().default('inbox'),
    intentMode: todoIntentEnum('intent_mode'),
    priority: priorityEnum('priority').notNull().default('normal'),
    due: timestamp('due', { withTimezone: true }),
    linkedKind: entityKindEnum('linked_kind'),
    linkedId: uuid('linked_id'),
    ownerNote: text('owner_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index('todos_status_idx').on(t.status),
    linkedIdx: index('todos_linked_idx').on(t.linkedKind, t.linkedId),
  }),
);

// ─── Literature ────────────────────────────────────────────────────────────

export const litItems = pgTable(
  'lit_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: litItemTypeEnum('type').notNull().default('paper'),
    title: text('title').notNull(),
    authors: jsonb('authors'),
    abstract: text('abstract'),
    url: text('url'),
    pdfUrl: text('pdf_url'),
    arxivId: varchar('arxiv_id', { length: 64 }),
    doi: varchar('doi', { length: 200 }),
    tags: jsonb('tags'),
    readState: litReadStateEnum('read_state').notNull().default('unread'),
    queuePosition: integer('queue_position'),
    public: boolean('public').notNull().default(false),
    embedding: vector('embedding', { dimensions: 1536 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    arxivUq: unique('lit_items_arxiv_uq').on(t.arxivId),
    doiUq: unique('lit_items_doi_uq').on(t.doi),
    typeIdx: index('lit_items_type_idx').on(t.type),
    readStateIdx: index('lit_items_read_state_idx').on(t.readState),
  }),
);

export const litSources = pgTable(
  'lit_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: litSourceKindEnum('kind').notNull(),
    title: text('title').notNull(),
    config: jsonb('config').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    lastPolledAt: timestamp('last_polled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    kindIdx: index('lit_sources_kind_idx').on(t.kind),
  }),
);

export const litInbox = pgTable(
  'lit_inbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    litItemId: uuid('lit_item_id')
      .notNull()
      .references(() => litItems.id, { onDelete: 'cascade' }),
    sourceId: uuid('source_id').references(() => litSources.id, { onDelete: 'set null' }),
    surfacedOn: date('surfaced_on').notNull(),
    score: integer('score'),
    reasonMd: text('reason_md'),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    dayIdx: index('lit_inbox_day_idx').on(t.surfacedOn),
    itemDayUq: unique('lit_inbox_item_day_uq').on(t.litItemId, t.surfacedOn),
  }),
);

// ─── Polymorphic graph (edges, comments, figures) ──────────────────────────

export const edges = pgTable(
  'edges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fromKind: entityKindEnum('from_kind').notNull(),
    fromId: uuid('from_id').notNull(),
    toKind: entityKindEnum('to_kind').notNull(),
    toId: uuid('to_id').notNull(),
    type: edgeTypeEnum('type').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    fromIdx: index('edges_from_idx').on(t.fromKind, t.fromId),
    toIdx: index('edges_to_idx').on(t.toKind, t.toId),
    typeIdx: index('edges_type_idx').on(t.type),
    edgeUq: unique('edges_unique').on(t.fromKind, t.fromId, t.toKind, t.toId, t.type),
  }),
);

export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityKind: entityKindEnum('entity_kind').notNull(),
    entityId: uuid('entity_id').notNull(),
    parentCommentId: uuid('parent_comment_id'),
    authorUserId: uuid('author_user_id').references(() => users.id, { onDelete: 'set null' }),
    authorKind: commentAuthorKindEnum('author_kind').notNull().default('human'),
    kind: commentKindEnum('kind').notNull().default('discussion'),
    body: text('body').notNull(),
    anchorNodeId: text('anchor_node_id'),
    anchoredQuote: text('anchored_quote'),
    mentions: text('mentions').array(),
    autoContinueClaude: boolean('auto_continue_claude').notNull().default(false),
    agentRunId: uuid('agent_run_id'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    resolvedSummaryMd: text('resolved_summary_md'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    entityIdx: index('comments_entity_idx').on(t.entityKind, t.entityId),
    parentIdx: index('comments_parent_idx').on(t.parentCommentId),
    resolvedIdx: index('comments_resolved_idx').on(t.resolvedAt),
  }),
);

export const figures = pgTable(
  'figures',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityKind: entityKindEnum('entity_kind').notNull(),
    entityId: uuid('entity_id').notNull(),
    url: text('url').notNull(),
    caption: text('caption'),
    altText: text('alt_text'),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    entityIdx: index('figures_entity_idx').on(t.entityKind, t.entityId),
  }),
);

// ─── Agent runs + chat ─────────────────────────────────────────────────────

export const agentRuns = pgTable(
  'agent_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: agentRunKindEnum('kind').notNull(),
    provider: agentProviderEnum('provider').notNull().default('claude_code'),
    status: agentRunStatusEnum('status').notNull().default('queued'),
    request: text('request').notNull(),
    planMd: text('plan_md'),
    approvalRequired: boolean('approval_required').notNull().default(true),
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    scopeEntityKind: entityKindEnum('scope_entity_kind'),
    scopeEntityId: uuid('scope_entity_id'),
    chatSessionId: uuid('chat_session_id'),
    branchName: text('branch_name'),
    vercelDeploymentUrl: text('vercel_deployment_url'),
    runpodPodId: text('runpod_pod_id'),
    runpodStatus: text('runpod_status'),
    transcriptLogPath: text('transcript_log_path'),
    changedFilesJson: jsonb('changed_files_json'),
    lastError: text('last_error'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index('agent_runs_status_idx').on(t.status),
    kindIdx: index('agent_runs_kind_idx').on(t.kind),
    scopeIdx: index('agent_runs_scope_idx').on(t.scopeEntityKind, t.scopeEntityId),
    createdIdx: index('agent_runs_created_idx').on(t.createdAt),
  }),
);

export const agentRunEvents = pgTable(
  'agent_run_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => agentRuns.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    body: text('body'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    runIdx: index('agent_run_events_run_idx').on(t.runId),
    typeIdx: index('agent_run_events_type_idx').on(t.eventType),
  }),
);

export const chatSessions = pgTable(
  'chat_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scopeEntityKind: entityKindEnum('scope_entity_kind'),
    scopeEntityId: uuid('scope_entity_id'),
    agentHandle: text('agent_handle'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    scopeIdx: index('chat_sessions_scope_idx').on(t.scopeEntityKind, t.scopeEntityId),
    lastMsgIdx: index('chat_sessions_last_msg_idx').on(t.lastMessageAt),
  }),
);

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => chatSessions.id, { onDelete: 'cascade' }),
    role: chatRoleEnum('role').notNull(),
    body: text('body'),
    toolCallJson: jsonb('tool_call_json'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sessionIdx: index('chat_messages_session_idx').on(t.sessionId),
    createdIdx: index('chat_messages_created_idx').on(t.createdAt),
  }),
);

// ─── Today: research log + Kanban + digests ────────────────────────────────

export const dailyLogEntries = pgTable(
  'daily_log_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    day: date('day').notNull(),
    kind: dailyLogKindEnum('kind').notNull(),
    bodyMd: text('body_md').notNull(),
    entityKind: entityKindEnum('entity_kind'),
    entityId: uuid('entity_id'),
    position: integer('position').notNull().default(0),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    dayIdx: index('daily_log_day_idx').on(t.day),
    entityIdx: index('daily_log_entity_idx').on(t.entityKind, t.entityId),
  }),
);

export const kanbanColumns = pgTable(
  'kanban_columns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    boardSlug: varchar('board_slug', { length: 120 }).notNull(),
    title: text('title').notNull(),
    position: integer('position').notNull(),
    color: text('color'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    boardIdx: index('kanban_columns_board_idx').on(t.boardSlug),
  }),
);

export const kanbanCards = pgTable(
  'kanban_cards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    columnId: uuid('column_id')
      .notNull()
      .references(() => kanbanColumns.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    bodyMd: text('body_md'),
    linkedKind: entityKindEnum('linked_kind'),
    linkedId: uuid('linked_id'),
    position: integer('position').notNull().default(0),
    due: timestamp('due', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    columnIdx: index('kanban_cards_column_idx').on(t.columnId),
    linkedIdx: index('kanban_cards_linked_idx').on(t.linkedKind, t.linkedId),
  }),
);

export const dailyDigests = pgTable(
  'daily_digests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    day: date('day').notNull().unique(),
    bodyMd: text('body_md').notNull(),
    snapshotJson: jsonb('snapshot_json'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    dayIdx: index('daily_digests_day_idx').on(t.day),
  }),
);

export const weeklyDigests = pgTable(
  'weekly_digests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    weekStart: date('week_start').notNull().unique(),
    bodyMd: text('body_md').notNull(),
    draftedAt: timestamp('drafted_at', { withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    shareToken: text('share_token').unique(),
  },
  (t) => ({
    weekIdx: index('weekly_digests_week_idx').on(t.weekStart),
  }),
);

// ─── Sharing ───────────────────────────────────────────────────────────────

export const shareGrants = pgTable(
  'share_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityKind: entityKindEnum('entity_kind').notNull(),
    entityId: uuid('entity_id').notNull(),
    token: text('token').notNull().unique(),
    grantedToEmail: varchar('granted_to_email', { length: 320 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    entityIdx: index('share_grants_entity_idx').on(t.entityKind, t.entityId),
    tokenIdx: index('share_grants_token_idx').on(t.token),
  }),
);

// ─── Type exports ──────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type ProjectNarrative = typeof projectNarratives.$inferSelect;
export type Belief = typeof beliefs.$inferSelect;
export type BeliefVersion = typeof beliefVersions.$inferSelect;
export type Experiment = typeof experiments.$inferSelect;
export type Run = typeof runs.$inferSelect;
export type Todo = typeof todos.$inferSelect;
export type LitItem = typeof litItems.$inferSelect;
export type LitSource = typeof litSources.$inferSelect;
export type LitInboxEntry = typeof litInbox.$inferSelect;
export type Edge = typeof edges.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type Figure = typeof figures.$inferSelect;
export type AgentRun = typeof agentRuns.$inferSelect;
export type AgentRunEvent = typeof agentRunEvents.$inferSelect;
export type ChatSession = typeof chatSessions.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type DailyLogEntry = typeof dailyLogEntries.$inferSelect;
export type KanbanColumn = typeof kanbanColumns.$inferSelect;
export type KanbanCard = typeof kanbanCards.$inferSelect;
export type DailyDigest = typeof dailyDigests.$inferSelect;
export type WeeklyDigest = typeof weeklyDigests.$inferSelect;
export type ShareGrant = typeof shareGrants.$inferSelect;

// Suppress unused import warning when sql is not directly referenced here.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _sql = sql;
