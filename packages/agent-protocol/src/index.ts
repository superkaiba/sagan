import { z } from 'zod';

export const ENTITY_KINDS = [
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
] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];
export const entityKindSchema = z.enum(ENTITY_KINDS);

export const AGENT_RUN_KINDS = ['plan', 'apply', 'qa', 'experiment'] as const;
export type AgentRunKind = (typeof AGENT_RUN_KINDS)[number];
export const agentRunKindSchema = z.enum(AGENT_RUN_KINDS);

export const AGENT_RUN_STATUSES = [
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
] as const;
export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];
export const agentRunStatusSchema = z.enum(AGENT_RUN_STATUSES);

export const runRequestSchema = z.object({
  kind: agentRunKindSchema,
  request: z.string().min(1).max(12_000),
  scopeEntityKind: entityKindSchema.optional(),
  scopeEntityId: z.string().uuid().optional(),
  chatSessionId: z.string().uuid().optional(),
  approvalRequired: z.boolean().default(true),
});
export type RunRequest = z.infer<typeof runRequestSchema>;

export const runEventSchema = z.object({
  runId: z.string().uuid(),
  type: z.enum([
    'queued',
    'started',
    'assistant_text',
    'tool_call',
    'tool_result',
    'plan_ready',
    'awaiting_approval',
    'approved',
    'rejected',
    'file_change',
    'deploy_started',
    'deploy_pod_started',
    'deploy_pod_failed',
    'deploy_completed',
    'runpod_status',
    'runpod_retry',
    'runpod_blocked',
    'runpod_stop_requested',
    'runpod_stop_skipped',
    'runpod_stop_failed',
    'runpod_stopped',
    'auto_continuation_queued',
    'completed',
    'failed',
    'cancelled',
    'log',
  ]),
  body: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  at: z.string().datetime(),
});
export type RunEvent = z.infer<typeof runEventSchema>;

export const planSchema = z.object({
  runId: z.string().uuid(),
  bodyMd: z.string(),
  planJson: z
    .object({
      goal: z.string().optional(),
      hypothesis: z.string().optional(),
      prediction: z.string().optional(),
      killCriterion: z.string().optional(),
      compute: z.string().optional(),
      hardware: z.string().optional(),
      artifacts: z.string().optional(),
      verification: z.string().optional(),
      risks: z.string().optional(),
      likelyCleanResult: z.string().optional(),
      sections: z.array(z.object({ title: z.string(), body: z.string() })).optional(),
    })
    .optional(),
  changedFiles: z
    .array(
      z.object({
        path: z.string(),
        kind: z.enum(['add', 'modify', 'delete']),
        diffPreview: z.string().optional(),
      }),
    )
    .optional(),
});
export type Plan = z.infer<typeof planSchema>;

export const approvalSchema = z.object({
  runId: z.string().uuid(),
  decision: z.enum(['approve', 'reject']),
  note: z.string().max(2_000).optional(),
});
export type Approval = z.infer<typeof approvalSchema>;
