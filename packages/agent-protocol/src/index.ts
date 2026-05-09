import { z } from 'zod';

export const ENTITY_KINDS = [
  'project',
  'belief',
  'experiment',
  'run',
  'todo',
  'lit_item',
  'project_narrative',
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
  approvalRequired: z.boolean().default(true),
});
export type RunRequest = z.infer<typeof runRequestSchema>;

export const runEventSchema = z.object({
  runId: z.string().uuid(),
  type: z.enum([
    'queued',
    'started',
    'tool_call',
    'tool_result',
    'plan_ready',
    'awaiting_approval',
    'approved',
    'rejected',
    'file_change',
    'deploy_started',
    'deploy_completed',
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
