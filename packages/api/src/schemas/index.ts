import { z } from 'zod';

export const entityKindSchema = z.enum([
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
  'agent_run',
  'chat_session',
  'html_artifact',
  'figure',
]);
export type EntityKind = z.infer<typeof entityKindSchema>;

export const experimentStatusSchema = z.enum([
  'proposed',
  'clarifying',
  'gate_pending',
  'planning',
  'plan_pending',
  'approved',
  'awaiting_approval',
  'queued',
  'implementing',
  'code_reviewing',
  'testing',
  'running',
  'uploading',
  'verifying',
  'interpreting',
  'reviewing',
  'awaiting_promotion',
  'followups_running',
  'shared',
  'blocked',
  'completed',
  'done_experiment',
  'done_impl',
  'failed',
  'cancelled',
  'archived',
]);
export type ExperimentStatus = z.infer<typeof experimentStatusSchema>;

export const auditSourceSchema = z.enum(['web', 'mobile', 'runner', 'job', 'system']);
export type AuditSource = z.infer<typeof auditSourceSchema>;

export const auditEventCreateSchema = z.object({
  action: z.string().min(1).max(500),
  why: z.string().min(1).max(4000),
  detail: z.string().max(10_000).optional(),
  entityKind: entityKindSchema.optional(),
  entityId: z.string().uuid().optional(),
  source: auditSourceSchema.default('web'),
  correlationId: z.string().max(200).optional(),
  agentRunId: z.string().uuid().optional(),
  jobRunId: z.string().uuid().optional(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type AuditEventCreate = z.infer<typeof auditEventCreateSchema>;

export const jobRunKindSchema = z.enum([
  'lit_review',
  'weekly_digest',
  'insight_scan',
  'comment_summary',
  'clean_result',
  'project_lit_review',
]);
export type JobRunKind = z.infer<typeof jobRunKindSchema>;

export const jobRunStatusSchema = z.enum(['queued', 'running', 'completed', 'failed', 'skipped']);
export type JobRunStatus = z.infer<typeof jobRunStatusSchema>;
