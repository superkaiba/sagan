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
  'clean_result',
  'todo',
  'lit_item',
  'project_narrative',
  'daily_log_entry',
  'weekly_digest',
]);

export const confidenceEnum = pgEnum('confidence', ['LOW', 'MODERATE', 'HIGH']);

export const cleanResultStatusEnum = pgEnum('clean_result_status', [
  'draft',
  'reviewing',
  'approved',
  'shared',
  'archived',
  'blocked',
]);

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

export const experimentKindEnum = pgEnum('experiment_kind', [
  'experiment',
  'infra',
  'analysis',
  'survey',
  'batch',
]);

export const computeSizeEnum = pgEnum('compute_size', ['none', 'small', 'medium', 'large']);

export const assigneeKindEnum = pgEnum('assignee_kind', ['agent', 'human']);

export const experimentStatusEnum = pgEnum('experiment_status', [
  'proposed',
  'planning',
  'plan_pending',
  'approved',
  'awaiting_approval',
  'queued',
  'running',
  'verifying',
  'interpreting',
  'reviewing',
  'awaiting_promotion',
  'shared',
  'blocked',
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
  'blocked',
  'completed',
  'failed',
  'cancelled',
]);

export const agentProviderEnum = pgEnum('agent_provider', ['claude_code', 'codex']);

export const runpodAccountEnum = pgEnum('runpod_account', ['team', 'personal']);

export const jobRunKindEnum = pgEnum('job_run_kind', [
  'lit_review',
  'weekly_digest',
  'insight_scan',
  'comment_summary',
  'clean_result',
]);

export const jobRunStatusEnum = pgEnum('job_run_status', [
  'queued',
  'running',
  'completed',
  'failed',
  'skipped',
]);

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

export const userRoleEnum = pgEnum('user_role', ['owner', 'collaborator', 'mentor']);

export const entityMembershipRoleEnum = pgEnum('entity_membership_role', [
  'owner',
  'collaborator',
  'mentor',
  'viewer',
]);

export const accessInviteStatusEnum = pgEnum('access_invite_status', [
  'pending',
  'accepted',
  'revoked',
  'expired',
]);

export const notificationKindEnum = pgEnum('notification_kind', [
  'comment',
  'mention',
  'claude_started',
  'claude_finished',
  'membership',
  'system',
]);

export const workflowEventTypeEnum = pgEnum('workflow_event_type', [
  'created',
  'state_changed',
  'approval_requested',
  'approved',
  'deferred',
  'rejected',
  'blocked',
  'note',
]);

export const approvalRequestKindEnum = pgEnum('approval_request_kind', [
  'experiment_plan',
  'queue_launch',
  'clean_result_promotion',
]);

export const approvalRequestStatusEnum = pgEnum('approval_request_status', [
  'pending',
  'approved',
  'deferred',
  'rejected',
  'cancelled',
]);

// ─── Auth ──────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 320 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: userRoleEnum('role').notNull().default('owner'),
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

export const entityMemberships = pgTable(
  'entity_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    entityKind: entityKindEnum('entity_kind').notNull(),
    entityId: uuid('entity_id').notNull(),
    role: entityMembershipRoleEnum('role').notNull().default('viewer'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userEntityUq: unique('entity_memberships_user_entity_uq').on(
      t.userId,
      t.entityKind,
      t.entityId,
    ),
    userIdx: index('entity_memberships_user_idx').on(t.userId),
    entityIdx: index('entity_memberships_entity_idx').on(t.entityKind, t.entityId),
  }),
);

export const accessInvites = pgTable(
  'access_invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 320 }).notNull(),
    role: entityMembershipRoleEnum('role').notNull(),
    entityKind: entityKindEnum('entity_kind').notNull(),
    entityId: uuid('entity_id').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    status: accessInviteStatusEnum('status').notNull().default('pending'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    invitedUserId: uuid('invited_user_id').references(() => users.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: index('access_invites_email_idx').on(t.email),
    entityIdx: index('access_invites_entity_idx').on(t.entityKind, t.entityId),
    tokenIdx: index('access_invites_token_idx').on(t.tokenHash),
  }),
);

export const notificationPreferences = pgTable('notification_preferences', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  emailComments: boolean('email_comments').notNull().default(true),
  emailMentions: boolean('email_mentions').notNull().default(true),
  emailClaudeReplies: boolean('email_claude_replies').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

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
    number: integer('number').notNull().unique(),
    legacyGhNumber: integer('legacy_gh_number'),
    beliefId: uuid('belief_id').references(() => beliefs.id, { onDelete: 'set null' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    body: text('body'),
    hypothesis: text('hypothesis'),
    planJson: jsonb('plan_json'),
    configYaml: text('config_yaml'),
    status: experimentStatusEnum('status').notNull().default('planning'),
    kind: experimentKindEnum('kind').notNull().default('experiment'),
    computeSize: computeSizeEnum('compute_size'),
    priority: priorityEnum('priority').notNull().default('normal'),
    assigneeKind: assigneeKindEnum('assignee_kind').notNull().default('agent'),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    hasCleanResult: boolean('has_clean_result').notNull().default(false),
    runpodAccount: runpodAccountEnum('runpod_account').notNull().default('team'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    numberIdx: index('experiments_number_idx').on(t.number),
    beliefIdx: index('experiments_belief_idx').on(t.beliefId),
    projectIdx: index('experiments_project_idx').on(t.projectId),
    statusIdx: index('experiments_status_idx').on(t.status),
    kindIdx: index('experiments_kind_idx').on(t.kind),
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

export const workflowEvents = pgTable(
  'workflow_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityKind: entityKindEnum('entity_kind').notNull(),
    entityId: uuid('entity_id').notNull(),
    eventType: workflowEventTypeEnum('event_type').notNull(),
    fromStatus: text('from_status'),
    toStatus: text('to_status'),
    actorKind: text('actor_kind').notNull().default('system'),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    note: text('note'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    entityIdx: index('workflow_events_entity_idx').on(t.entityKind, t.entityId),
    typeIdx: index('workflow_events_type_idx').on(t.eventType),
    createdIdx: index('workflow_events_created_idx').on(t.createdAt),
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
    summaryMd: text('summary_md'),
    relevanceReasonMd: text('relevance_reason_md'),
    threatReasonMd: text('threat_reason_md'),
    url: text('url'),
    pdfUrl: text('pdf_url'),
    arxivId: varchar('arxiv_id', { length: 64 }),
    doi: varchar('doi', { length: 200 }),
    releasedOn: date('released_on'),
    tags: jsonb('tags'),
    readState: litReadStateEnum('read_state').notNull().default('unread'),
    queuePosition: integer('queue_position'),
    lastRankedAt: timestamp('last_ranked_at', { withTimezone: true }),
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
    category: text('category').notNull().default('new_research'),
    reasonMd: text('reason_md'),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    dayIdx: index('lit_inbox_day_idx').on(t.surfacedOn),
    itemDayUq: unique('lit_inbox_item_day_uq').on(t.litItemId, t.surfacedOn),
  }),
);

// ─── Ideation ──────────────────────────────────────────────────────────────

export const ideaSessions = pgTable(
  'idea_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    sourceKind: entityKindEnum('source_kind').notNull(),
    sourceId: uuid('source_id').notNull(),
    status: text('status').notNull().default('active'),
    notesMd: text('notes_md'),
    promptDeck: jsonb('prompt_deck'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sourceIdx: index('idea_sessions_source_idx').on(t.sourceKind, t.sourceId),
    statusIdx: index('idea_sessions_status_idx').on(t.status),
    createdIdx: index('idea_sessions_created_idx').on(t.createdAt),
  }),
);

export const ideaCards = pgTable(
  'idea_cards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => ideaSessions.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    bodyMd: text('body_md').notNull(),
    authorKind: text('author_kind').notNull().default('sagan'),
    state: text('state').notNull().default('draft'),
    sourceKind: entityKindEnum('source_kind').notNull(),
    sourceId: uuid('source_id').notNull(),
    promotionKind: text('promotion_kind'),
    promotedKind: entityKindEnum('promoted_kind'),
    promotedId: uuid('promoted_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sessionIdx: index('idea_cards_session_idx').on(t.sessionId),
    stateIdx: index('idea_cards_state_idx').on(t.state),
    sourceIdx: index('idea_cards_source_idx').on(t.sourceKind, t.sourceId),
    promotedIdx: index('idea_cards_promoted_idx').on(t.promotedKind, t.promotedId),
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

export const commentSubscriptions = pgTable(
  'comment_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    entityKind: entityKindEnum('entity_kind').notNull(),
    entityId: uuid('entity_id').notNull(),
    rootCommentId: uuid('root_comment_id').references(() => comments.id, {
      onDelete: 'cascade',
    }),
    reason: text('reason').notNull().default('commented'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userEntityRootUq: unique('comment_subscriptions_user_entity_root_uq').on(
      t.userId,
      t.entityKind,
      t.entityId,
      t.rootCommentId,
    ),
    userIdx: index('comment_subscriptions_user_idx').on(t.userId),
    entityIdx: index('comment_subscriptions_entity_idx').on(t.entityKind, t.entityId),
    rootIdx: index('comment_subscriptions_root_idx').on(t.rootCommentId),
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
    planJson: jsonb('plan_json'),
    approvalRequired: boolean('approval_required').notNull().default(true),
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    scopeEntityKind: entityKindEnum('scope_entity_kind'),
    scopeEntityId: uuid('scope_entity_id'),
    chatSessionId: uuid('chat_session_id'),
    branchName: text('branch_name'),
    vercelDeploymentUrl: text('vercel_deployment_url'),
    runpodAccount: runpodAccountEnum('runpod_account').notNull().default('team'),
    runpodPodId: text('runpod_pod_id'),
    runpodPodIds: text('runpod_pod_ids').array(),
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

export const podLifecycle = pgTable(
  'pod_lifecycle',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentRunId: uuid('agent_run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
    experimentId: uuid('experiment_id').references(() => experiments.id, { onDelete: 'set null' }),
    runId: uuid('run_id').references(() => runs.id, { onDelete: 'set null' }),
    runpodPodId: text('runpod_pod_id').notNull().unique(),
    account: runpodAccountEnum('account').notNull().default('team'),
    name: text('name'),
    gpuTypeId: text('gpu_type_id'),
    gpuCount: integer('gpu_count'),
    status: text('status').notNull().default('deploying'),
    desiredStatus: text('desired_status'),
    sshHost: text('ssh_host'),
    sshPort: integer('ssh_port'),
    retryCount: integer('retry_count').notNull().default(0),
    maxRetries: integer('max_retries').notNull().default(3),
    blockedReason: text('blocked_reason'),
    lastError: text('last_error'),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }),
    stoppedAt: timestamp('stopped_at', { withTimezone: true }),
    terminatedAt: timestamp('terminated_at', { withTimezone: true }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    agentRunIdx: index('pod_lifecycle_agent_run_idx').on(t.agentRunId),
    experimentIdx: index('pod_lifecycle_experiment_idx').on(t.experimentId),
    runIdx: index('pod_lifecycle_run_idx').on(t.runId),
    statusIdx: index('pod_lifecycle_status_idx').on(t.status),
    podIdx: index('pod_lifecycle_pod_idx').on(t.runpodPodId),
  }),
);

export const runArtifacts = pgTable(
  'run_artifacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    experimentId: uuid('experiment_id').references(() => experiments.id, { onDelete: 'set null' }),
    runId: uuid('run_id').references(() => runs.id, { onDelete: 'set null' }),
    agentRunId: uuid('agent_run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
    podLifecycleId: uuid('pod_lifecycle_id').references(() => podLifecycle.id, { onDelete: 'set null' }),
    kind: text('kind').notNull(),
    uri: text('uri').notNull(),
    status: text('status').notNull().default('pending'),
    metadata: jsonb('metadata'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    experimentIdx: index('run_artifacts_experiment_idx').on(t.experimentId),
    runIdx: index('run_artifacts_run_idx').on(t.runId),
    agentRunIdx: index('run_artifacts_agent_run_idx').on(t.agentRunId),
    podLifecycleIdx: index('run_artifacts_pod_lifecycle_idx').on(t.podLifecycleId),
    statusIdx: index('run_artifacts_status_idx').on(t.status),
  }),
);

export const approvalRequests = pgTable(
  'approval_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: approvalRequestKindEnum('kind').notNull(),
    status: approvalRequestStatusEnum('status').notNull().default('pending'),
    entityKind: entityKindEnum('entity_kind').notNull(),
    entityId: uuid('entity_id').notNull(),
    experimentId: uuid('experiment_id').references(() => experiments.id, { onDelete: 'cascade' }),
    agentRunId: uuid('agent_run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
    resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    bodyMd: text('body_md'),
    requestedState: text('requested_state'),
    approvedState: text('approved_state'),
    rejectedState: text('rejected_state'),
    metadata: jsonb('metadata'),
    resolvedNote: text('resolved_note'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index('approval_requests_status_idx').on(t.status),
    entityIdx: index('approval_requests_entity_idx').on(t.entityKind, t.entityId),
    experimentIdx: index('approval_requests_experiment_idx').on(t.experimentId),
    createdIdx: index('approval_requests_created_idx').on(t.createdAt),
  }),
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    kind: notificationKindEnum('kind').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    entityKind: entityKindEnum('entity_kind'),
    entityId: uuid('entity_id'),
    commentId: uuid('comment_id').references(() => comments.id, { onDelete: 'set null' }),
    agentRunId: uuid('agent_run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
    emailStatus: text('email_status').notNull().default('pending'),
    emailedAt: timestamp('emailed_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('notifications_user_idx').on(t.userId),
    unreadIdx: index('notifications_unread_idx').on(t.userId, t.readAt),
    entityIdx: index('notifications_entity_idx').on(t.entityKind, t.entityId),
    commentIdx: index('notifications_comment_idx').on(t.commentId),
    agentRunIdx: index('notifications_agent_run_idx').on(t.agentRunId),
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

export const jobRuns = pgTable(
  'job_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: jobRunKindEnum('kind').notNull(),
    status: jobRunStatusEnum('status').notNull().default('queued'),
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
    requestPayload: jsonb('request_payload'),
    resultPayload: jsonb('result_payload'),
    lastError: text('last_error'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    kindIdx: index('job_runs_kind_idx').on(t.kind),
    statusIdx: index('job_runs_status_idx').on(t.status),
    createdIdx: index('job_runs_created_idx').on(t.createdAt),
  }),
);

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    day: date('day').notNull().default(sql`CURRENT_DATE`),
    actorKind: text('actor_kind').notNull().default('system'),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    why: text('why').notNull(),
    detail: text('detail'),
    entityKind: entityKindEnum('entity_kind'),
    entityId: uuid('entity_id'),
    source: text('source').notNull().default('web'),
    correlationId: text('correlation_id'),
    agentRunId: uuid('agent_run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
    jobRunId: uuid('job_run_id').references(() => jobRuns.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    dayIdx: index('audit_events_day_idx').on(t.day),
    entityIdx: index('audit_events_entity_idx').on(t.entityKind, t.entityId),
    agentRunIdx: index('audit_events_agent_run_idx').on(t.agentRunId),
    jobRunIdx: index('audit_events_job_run_idx').on(t.jobRunId),
    correlationIdx: index('audit_events_correlation_idx').on(t.correlationId),
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
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    scopeIdx: index('chat_sessions_scope_idx').on(t.scopeEntityKind, t.scopeEntityId),
    lastMsgIdx: index('chat_sessions_last_msg_idx').on(t.lastMessageAt),
    archivedIdx: index('chat_sessions_archived_idx').on(t.archivedAt),
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

export const cleanResults = pgTable(
  'clean_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    experimentId: uuid('experiment_id').references(() => experiments.id, { onDelete: 'set null' }),
    runId: uuid('run_id').references(() => runs.id, { onDelete: 'set null' }),
    agentRunId: uuid('agent_run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
    sourceDailyLogEntryId: uuid('source_daily_log_entry_id').references(() => dailyLogEntries.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    claim: text('claim').notNull(),
    bodyMd: text('body_md').notNull(),
    confidence: confidenceEnum('confidence'),
    status: cleanResultStatusEnum('status').notNull().default('draft'),
    artifactStatus: text('artifact_status').notNull().default('unverified'),
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    sharedAt: timestamp('shared_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    experimentIdx: index('clean_results_experiment_idx').on(t.experimentId),
    runIdx: index('clean_results_run_idx').on(t.runId),
    agentRunIdx: index('clean_results_agent_run_idx').on(t.agentRunId),
    statusIdx: index('clean_results_status_idx').on(t.status),
    approvedIdx: index('clean_results_approved_idx').on(t.approvedAt),
  }),
);

export const cleanResultVersions = pgTable(
  'clean_result_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cleanResultId: uuid('clean_result_id')
      .notNull()
      .references(() => cleanResults.id, { onDelete: 'cascade' }),
    bodyMd: text('body_md').notNull(),
    title: text('title'),
    claim: text('claim'),
    confidence: confidenceEnum('confidence'),
    authorKind: text('author_kind').notNull().default('user'),
    editedBy: uuid('edited_by').references(() => users.id, { onDelete: 'set null' }),
    sourceCommentId: uuid('source_comment_id').references(() => comments.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    cleanResultIdx: index('clean_result_versions_result_idx').on(t.cleanResultId),
    createdIdx: index('clean_result_versions_created_idx').on(t.createdAt),
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

export const pushDevicePlatformEnum = pgEnum('push_device_platform', [
  'ios',
  'android',
  'web',
]);

export const pushDevices = pgTable(
  'push_devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    platform: pushDevicePlatformEnum('platform').notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userTokenUq: unique('push_devices_user_token_uq').on(t.userId, t.token),
    userIdx: index('push_devices_user_idx').on(t.userId),
  }),
);

// ─── Type exports ──────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type EntityMembership = typeof entityMemberships.$inferSelect;
export type AccessInvite = typeof accessInvites.$inferSelect;
export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type ProjectNarrative = typeof projectNarratives.$inferSelect;
export type Belief = typeof beliefs.$inferSelect;
export type BeliefVersion = typeof beliefVersions.$inferSelect;
export type Experiment = typeof experiments.$inferSelect;
export type Run = typeof runs.$inferSelect;
export type WorkflowEvent = typeof workflowEvents.$inferSelect;
export type Todo = typeof todos.$inferSelect;
export type LitItem = typeof litItems.$inferSelect;
export type LitSource = typeof litSources.$inferSelect;
export type LitInboxEntry = typeof litInbox.$inferSelect;
export type IdeaSession = typeof ideaSessions.$inferSelect;
export type IdeaCard = typeof ideaCards.$inferSelect;
export type Edge = typeof edges.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type CommentSubscription = typeof commentSubscriptions.$inferSelect;
export type Figure = typeof figures.$inferSelect;
export type AgentRun = typeof agentRuns.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type ApprovalRequest = typeof approvalRequests.$inferSelect;
export type AgentRunEvent = typeof agentRunEvents.$inferSelect;
export type JobRun = typeof jobRuns.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type ChatSession = typeof chatSessions.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type DailyLogEntry = typeof dailyLogEntries.$inferSelect;
export type KanbanColumn = typeof kanbanColumns.$inferSelect;
export type KanbanCard = typeof kanbanCards.$inferSelect;
export type DailyDigest = typeof dailyDigests.$inferSelect;
export type WeeklyDigest = typeof weeklyDigests.$inferSelect;
export type ShareGrant = typeof shareGrants.$inferSelect;
export type PushDevice = typeof pushDevices.$inferSelect;

// Suppress unused import warning when sql is not directly referenced here.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _sql = sql;
