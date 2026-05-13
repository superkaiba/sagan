export type StatusTone = 'approval' | 'warning' | 'danger' | 'running' | 'success' | 'info' | 'neutral';

const LABELS: Record<string, string> = {
  code_reviewing: 'code reviewing',
  done_experiment: 'done experiment',
  done_impl: 'done implementation',
  followups_running: 'follow-ups running',
  plan_pending: 'plan pending',
  awaiting_approval: 'awaiting approval',
  awaiting_promotion: 'awaiting promotion',
  clean_result_promotion: 'clean result promotion',
  experiment_plan: 'experiment plan',
  queue_launch: 'queue launch',
  in_progress: 'in progress',
  not_useful: 'not useful',
};

export function statusLabel(status: string | null | undefined) {
  if (!status) return 'unknown';
  return LABELS[status] ?? status.replaceAll('_', ' ');
}

export function statusTone(status: string | null | undefined): StatusTone {
  const normalized = (status ?? '').toLowerCase();
  if (['pending', 'plan_pending', 'awaiting_approval', 'awaiting_promotion', 'reviewing'].includes(normalized)) {
    return 'approval';
  }
  if (['blocked', 'failed', 'rejected', 'falsified'].includes(normalized)) return 'danger';
  if (['running', 'deploying', 'queued', 'implementing', 'testing', 'uploading', 'verifying', 'followups_running', 'reading', 'in_progress'].includes(normalized)) return 'running';
  if (['approved', 'completed', 'shared', 'done', 'done_experiment', 'done_impl', 'read', 'published', 'supported', 'active', 'useful', 'resolved'].includes(normalized)) {
    return 'success';
  }
  if (['planning', 'clarifying', 'proposed', 'draft', 'deferred', 'paused', 'gate_pending'].includes(normalized)) return 'warning';
  if (['info', 'note', 'decision', 'clean_result'].includes(normalized)) return 'info';
  return 'neutral';
}

export function formatRelativeTime(value: string | Date | null | undefined) {
  if (!value) return 'no timestamp';
  const time = typeof value === 'string' ? new Date(value).getTime() : value.getTime();
  if (Number.isNaN(time)) return 'invalid date';
  const diffMs = Date.now() - time;
  const minutes = Math.floor(Math.abs(diffMs) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(time).toLocaleDateString();
}
