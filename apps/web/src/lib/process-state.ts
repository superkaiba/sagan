export type ProcessStateTone =
  | 'neutral'
  | 'info'
  | 'running'
  | 'approval'
  | 'warning'
  | 'danger'
  | 'success';

export interface ProcessState {
  label: string;
  detail: string | null;
  tone: ProcessStateTone;
}

export interface ProcessRunLike {
  kind: string;
  status: string;
}

export interface ProcessPodLike {
  status: string;
}

const ACTIVE_RUN_STATUSES = new Set(['queued', 'running', 'approved', 'deploying']);
const REVIEW_RUN_STATUSES = new Set(['awaiting_approval', 'rejected']);
const ACTIVE_POD_STATUSES = new Set(['queued', 'deploying', 'running', 'retrying', 'stop_requested']);

export function deriveProcessState(input: {
  entityKind: string;
  status: string | null | undefined;
  run?: ProcessRunLike | null;
  pods?: ProcessPodLike[];
}): ProcessState {
  const status = input.status ?? null;
  const pods = input.pods ?? [];
  const activePod = pods.find((pod) => ACTIVE_POD_STATUSES.has(pod.status));
  if (activePod) {
    if (activePod.status === 'running') return state('Experiment', 'RunPod running', 'running');
    if (activePod.status === 'retrying') return state('Experiment retry', 'RunPod watcher retrying', 'warning');
    if (activePod.status === 'stop_requested') return state('Stopping', 'RunPod stop requested', 'warning');
    return state('Experiment launch', 'RunPod starting', 'info');
  }

  const run = input.run ?? null;
  if (run) {
    const active = ACTIVE_RUN_STATUSES.has(run.status);
    const reviewing = REVIEW_RUN_STATUSES.has(run.status);
    if (run.status === 'failed' || run.status === 'blocked') return state('Recovery needed', run.status, 'danger');
    if (run.status === 'cancelled') return state('Cancelled', 'agent run cancelled', 'warning');
    if (run.kind === 'apply' && active) return state('Implementing', run.status, 'running');
    if (run.kind === 'qa' && active) return state(input.entityKind === 'experiment' ? 'Analyzing' : 'Code reviewer', run.status, 'info');
    if (run.kind === 'experiment' && active) return state('Experiment planning', run.status, 'info');
    if (run.kind === 'plan' && active) return state('Planning + critic', run.status, 'info');
    if (reviewing) return state('Awaiting approval', run.kind.replaceAll('_', ' '), 'approval');
  }

  if (!status) return state('Untracked', null, 'neutral');
  if (['blocked', 'failed', 'rejected'].includes(status)) return state('Blocked', status, 'danger');
  if (['cancelled', 'archived'].includes(status)) return state(status === 'archived' ? 'Archived' : 'Cancelled', status, 'warning');
  if (['completed', 'done', 'shared', 'approved'].includes(status)) return state(status === 'approved' ? 'Approved' : 'Done', status, 'success');
  if (['awaiting_approval', 'gate_pending', 'plan_pending'].includes(status)) return state('Awaiting approval', status, 'approval');
  if (['proposed', 'inbox', 'open', 'scoped'].includes(status)) return state('Scoping', status, 'neutral');
  if (['clarifying'].includes(status)) return state('Clarifying', status, 'info');
  if (['awaiting_clarifications'].includes(status)) return state('Awaiting clarifications', status, 'approval');
  if (['planning'].includes(status)) return state('Planning + critic', status, 'info');
  if (['queued'].includes(status)) return state('Queued', status, 'info');
  if (['implementing', 'code_reviewing', 'testing', 'running', 'uploading', 'in_progress'].includes(status)) {
    return state(input.entityKind === 'experiment' ? 'Experiment' : 'Implementing', status, 'running');
  }
  if (['verifying'].includes(status)) return state('Verifying', status, 'info');
  if (['interpreting', 'followups_running'].includes(status)) return state('Analyzing', status, 'info');
  if (['reviewing'].includes(status)) return state(input.entityKind === 'clean_result' ? 'Critic review' : 'Code reviewer', status, 'approval');
  if (['awaiting_promotion', 'draft'].includes(status)) return state('Writing result', status, 'info');
  return state(titleize(status), status, 'neutral');
}

function state(label: string, detail: string | null, tone: ProcessStateTone): ProcessState {
  return { label, detail, tone };
}

function titleize(value: string) {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
