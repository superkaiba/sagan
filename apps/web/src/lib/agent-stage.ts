export type AgentStageTone = 'neutral' | 'info' | 'warn' | 'danger' | 'success';

export interface AgentStageEvent {
  eventType: string;
  body: string | null;
  metadata: unknown;
  createdAt: Date | string;
}

export interface AgentStage {
  label: string;
  detail: string | null;
  tone: AgentStageTone;
  crashed: boolean;
  lastEventAt: string | null;
  round: number;
}

interface AgentStageInput {
  status: string;
  kind: string;
  lastError: string | null;
  events: AgentStageEvent[];
}

interface ParsedMetadata {
  subagentType: string | null;
  description: string | null;
}

function parseMetadata(metadata: unknown): ParsedMetadata {
  if (!metadata || typeof metadata !== 'object') return { subagentType: null, description: null };
  const meta = metadata as Record<string, unknown>;
  const input = meta.input;
  if (!input || typeof input !== 'object') return { subagentType: null, description: null };
  const inputRecord = input as Record<string, unknown>;
  const subagentType = typeof inputRecord.subagent_type === 'string' ? inputRecord.subagent_type : null;
  const description = typeof inputRecord.description === 'string' ? inputRecord.description : null;
  return { subagentType, description };
}

function isCriticType(subagentType: string | null): boolean {
  return subagentType === 'critic' || subagentType === 'codex-critic';
}

function isPlanningSubagent(subagentType: string | null): boolean {
  return isCriticType(subagentType) || subagentType === 'reconciler';
}

function eventTime(value: Date | string): number {
  return typeof value === 'string' ? new Date(value).getTime() : value.getTime();
}

function toIso(value: Date | string | null): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.toISOString();
}

const ROUND_GAP_MS = 6 * 60 * 1000;

interface RoundInfo {
  round: number;
  criticSpawns: number;
  reconcilerSpawns: number;
  lastCriticAt: number | null;
  lastReconcilerAt: number | null;
  totalCriticSpawns: number;
}

function summarizeRounds(events: AgentStageEvent[]): RoundInfo {
  let round = 0;
  let criticSpawns = 0;
  let reconcilerSpawns = 0;
  let lastCriticAt: number | null = null;
  let lastReconcilerAt: number | null = null;
  let totalCriticSpawns = 0;
  let lastSpawnAt: number | null = null;

  for (const event of events) {
    if (event.eventType !== 'tool_call' || event.body !== 'Task') continue;
    const { subagentType } = parseMetadata(event.metadata);
    if (!isPlanningSubagent(subagentType)) continue;
    const at = eventTime(event.createdAt);
    if (isCriticType(subagentType)) {
      if (lastSpawnAt === null || at - lastSpawnAt > ROUND_GAP_MS) {
        round += 1;
        criticSpawns = 0;
        reconcilerSpawns = 0;
      }
      criticSpawns += 1;
      totalCriticSpawns += 1;
      lastCriticAt = at;
      lastSpawnAt = at;
    } else if (subagentType === 'reconciler') {
      if (round === 0) round = 1;
      reconcilerSpawns += 1;
      lastReconcilerAt = at;
      lastSpawnAt = at;
    }
  }

  return { round, criticSpawns, reconcilerSpawns, lastCriticAt, lastReconcilerAt, totalCriticSpawns };
}

const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'rejected']);

export function deriveAgentStage({ status, kind, lastError, events }: AgentStageInput): AgentStage {
  const sortedAsc = [...events].sort((a, b) => eventTime(a.createdAt) - eventTime(b.createdAt));
  const lastEvent = sortedAsc.at(-1) ?? null;
  const lastEventAt = lastEvent ? toIso(lastEvent.createdAt) : null;
  const rounds = summarizeRounds(sortedAsc);
  const crashed =
    (status === 'failed' || status === 'blocked') && Boolean(lastError) ||
    sortedAsc.some((event) => event.eventType === 'runpod_blocked' || event.eventType === 'stale_recovered');

  if (status === 'completed') {
    return { label: 'Completed', detail: null, tone: 'success', crashed: false, lastEventAt, round: rounds.round };
  }
  if (status === 'cancelled') {
    return { label: 'Cancelled', detail: null, tone: 'neutral', crashed: false, lastEventAt, round: rounds.round };
  }
  if (status === 'rejected') {
    return { label: 'Approval rejected', detail: null, tone: 'warn', crashed: false, lastEventAt, round: rounds.round };
  }

  if (status === 'failed' && lastError) {
    return {
      label: 'Crashed',
      detail: crashedAtLabel(sortedAsc, rounds),
      tone: 'danger',
      crashed: true,
      lastEventAt,
      round: rounds.round,
    };
  }
  if (status === 'blocked' && lastError) {
    return {
      label: 'Blocked',
      detail: crashedAtLabel(sortedAsc, rounds),
      tone: 'danger',
      crashed: true,
      lastEventAt,
      round: rounds.round,
    };
  }

  if (status === 'awaiting_approval') {
    const detail = kind === 'plan' || kind === 'experiment' ? planAwaitingDetail(rounds) : null;
    return { label: 'Awaiting approval', detail, tone: 'warn', crashed: false, lastEventAt, round: rounds.round };
  }

  if (status === 'approved') {
    return { label: 'Approved — dispatching', detail: null, tone: 'info', crashed: false, lastEventAt, round: rounds.round };
  }

  if (status === 'deploying') {
    return { label: 'Deploying RunPod', detail: null, tone: 'info', crashed: false, lastEventAt, round: rounds.round };
  }

  if (status === 'queued') {
    return { label: 'Queued', detail: null, tone: 'neutral', crashed: false, lastEventAt, round: rounds.round };
  }

  // Status is "running" (or anything else not handled above) — derive from the
  // most recent meaningful event.
  for (let i = sortedAsc.length - 1; i >= 0; i -= 1) {
    const event = sortedAsc[i]!;
    const at = eventTime(event.createdAt);

    if (event.eventType === 'awaiting_clarifications') {
      return { label: 'Awaiting clarifications', detail: null, tone: 'warn', crashed: false, lastEventAt, round: rounds.round };
    }
    if (event.eventType === 'awaiting_approval') {
      const detail = kind === 'plan' || kind === 'experiment' ? planAwaitingDetail(rounds) : null;
      return { label: 'Awaiting approval', detail, tone: 'warn', crashed: false, lastEventAt, round: rounds.round };
    }
    if (event.eventType === 'plan_recovered') {
      return { label: 'Plan recovered', detail: null, tone: 'info', crashed: false, lastEventAt, round: rounds.round };
    }
    if (event.eventType === 'deploy_pod_started' || event.eventType === 'deploy_started') {
      return { label: 'Deploying RunPod', detail: event.body ?? null, tone: 'info', crashed: false, lastEventAt, round: rounds.round };
    }
    if (event.eventType === 'runpod_status') {
      return { label: 'RunPod running', detail: event.body ?? null, tone: 'info', crashed: false, lastEventAt, round: rounds.round };
    }
    if (event.eventType === 'runpod_blocked') {
      return { label: 'RunPod blocked', detail: event.body ?? null, tone: 'danger', crashed: true, lastEventAt, round: rounds.round };
    }
    if (event.eventType === 'tool_call' && event.body === 'Task') {
      const { subagentType, description } = parseMetadata(event.metadata);
      if (subagentType === 'reconciler') {
        return {
          label: `Reconciling round ${Math.max(rounds.round, 1)}`,
          detail: description ?? null,
          tone: 'info',
          crashed: false,
          lastEventAt,
          round: rounds.round,
        };
      }
      if (isCriticType(subagentType)) {
        const expected = 6;
        return {
          label: `Critic round ${rounds.round || 1}`,
          detail: `${rounds.criticSpawns}/${expected} critic agents spawned`,
          tone: 'info',
          crashed: false,
          lastEventAt,
          round: rounds.round,
        };
      }
      // Other subagent — fall through to generic.
    }
    // Stop scanning if we've reached the start of the most recent burst.
    if (rounds.lastCriticAt && at < rounds.lastCriticAt - ROUND_GAP_MS) break;
  }

  // Default during a live planning session.
  if (kind === 'plan' || (kind === 'experiment' && sortedAsc.length > 0)) {
    if (rounds.round > 0) {
      return {
        label: `Revising after round ${rounds.round}`,
        detail: null,
        tone: 'info',
        crashed: false,
        lastEventAt,
        round: rounds.round,
      };
    }
    return { label: 'Drafting plan', detail: null, tone: 'info', crashed: false, lastEventAt, round: rounds.round };
  }

  if (status === 'running') {
    return { label: 'Running', detail: null, tone: 'info', crashed: false, lastEventAt, round: rounds.round };
  }

  if (TERMINAL_STATUSES.has(status)) {
    return { label: status, detail: null, tone: 'neutral', crashed: false, lastEventAt, round: rounds.round };
  }

  return { label: 'Starting', detail: null, tone: 'neutral', crashed: false, lastEventAt, round: rounds.round };
}

function planAwaitingDetail(rounds: RoundInfo): string | null {
  if (rounds.round === 0) return null;
  if (rounds.reconcilerSpawns > 0) return `after ${rounds.round} critic round${rounds.round === 1 ? '' : 's'} + reconciler`;
  return `after ${rounds.round} critic round${rounds.round === 1 ? '' : 's'}`;
}

function crashedAtLabel(sortedAsc: AgentStageEvent[], rounds: RoundInfo): string | null {
  // Look backwards for the last activity hint before the failure.
  for (let i = sortedAsc.length - 1; i >= 0; i -= 1) {
    const event = sortedAsc[i]!;
    if (event.eventType === 'failed') continue;
    if (event.eventType === 'runpod_blocked') return 'while deploying RunPod';
    if (event.eventType === 'tool_call' && event.body === 'Task') {
      const { subagentType } = parseMetadata(event.metadata);
      if (subagentType === 'reconciler') return `during reconciler (round ${Math.max(rounds.round, 1)})`;
      if (isCriticType(subagentType)) return `during critic round ${rounds.round || 1}`;
    }
    if (event.eventType === 'awaiting_approval') return 'after posting the plan';
    if (event.eventType === 'awaiting_clarifications') return 'while clarifying';
    if (event.eventType === 'deploy_started' || event.eventType === 'deploy_pod_started') return 'while dispatching pods';
  }
  return null;
}
