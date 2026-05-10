/**
 * Wire types — kept minimal and structural; the Drizzle schema is the source
 * of truth, but the mobile app only needs the columns it actually reads.
 */

export type DailyLogKind = 'clean_result' | 'blocker' | 'decision' | 'note';

export type DailyLogEntry = {
  id: string;
  day: string;
  kind: DailyLogKind;
  bodyMd: string;
  entityKind?: string | null;
  entityId?: string | null;
  position: number;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AgentRunKind = 'plan' | 'apply' | 'qa' | 'experiment';

export type AgentRunStatus =
  | 'queued'
  | 'running'
  | 'awaiting_approval'
  | 'approved'
  | 'rejected'
  | 'deploying'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type AgentRun = {
  id: string;
  kind: AgentRunKind;
  status: AgentRunStatus;
  request: string;
  planMd?: string | null;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Me = {
  user: { id: string; email: string };
};
