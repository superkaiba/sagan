type DateLike = Date | string | null | undefined;

export interface RunPodCostFields {
  status: string;
  costPerHr: number | null;
  adjustedCostPerHr: number | null;
  uptimeSeconds: number | null;
  lastCheckedAt?: DateLike;
  lastStartedAt?: DateLike;
  createdAt?: DateLike;
  stoppedAt?: DateLike;
  terminatedAt?: DateLike;
}

const METERING_STATUSES = new Set(['deploying', 'running', 'retrying', 'stop_requested']);

export function effectiveRunPodRate(pod: RunPodCostFields) {
  return finiteNonNegative(pod.adjustedCostPerHr) ?? finiteNonNegative(pod.costPerHr);
}

export function estimateRunPodUptimeSeconds(pod: RunPodCostFields, nowMs?: number) {
  const recorded = finiteNonNegative(pod.uptimeSeconds);
  const lastCheckedMs = dateMs(pod.lastCheckedAt);
  const isMetering = METERING_STATUSES.has(pod.status);

  if (recorded != null) {
    if (nowMs != null && isMetering && lastCheckedMs != null) {
      return recorded + Math.max(0, nowMs - lastCheckedMs) / 1000;
    }
    return recorded;
  }

  const startedMs = dateMs(pod.lastStartedAt) ?? dateMs(pod.createdAt);
  if (startedMs == null) return null;
  const endMs = isMetering
    ? nowMs
    : dateMs(pod.terminatedAt) ?? dateMs(pod.stoppedAt) ?? lastCheckedMs;
  if (endMs == null) return null;
  return Math.max(0, (endMs - startedMs) / 1000);
}

export function estimateRunPodSpendUsd(pod: RunPodCostFields, nowMs?: number) {
  const rate = effectiveRunPodRate(pod);
  const seconds = estimateRunPodUptimeSeconds(pod, nowMs);
  if (rate == null || seconds == null) return null;
  return rate * (seconds / 3600);
}

export function estimateRunPodRemainingCostUsd(spendPerHr: number | null, remainingMinutes: number | null) {
  if (spendPerHr == null || remainingMinutes == null || remainingMinutes < 0) return null;
  return spendPerHr * (remainingMinutes / 60);
}

export function formatUsd(value: number | null) {
  if (value == null) return 'rate pending';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatUsdPerHour(value: number | null) {
  if (value == null) return 'rate pending';
  return `${formatUsd(value)}/hr`;
}

export function estimateRunwaySeconds(balanceUsd: number | null, spendPerHr: number | null) {
  if (balanceUsd == null || spendPerHr == null || spendPerHr <= 0) return null;
  return (balanceUsd / spendPerHr) * 3600;
}

export function formatRunway(balanceUsd: number | null, spendPerHr: number | null) {
  const seconds = estimateRunwaySeconds(balanceUsd, spendPerHr);
  if (seconds == null) return 'runway pending';
  if (seconds < 60) return '<1m left';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m left`;
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days >= 2) return `${days}d left`;
  if (days === 1) return `1d ${hours % 24}h left`;
  return `${hours}h ${minutes % 60}m left`;
}

export function formatDuration(seconds: number | null) {
  if (seconds == null) return 'duration pending';
  const minutes = Math.max(0, Math.floor(seconds / 60));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

function finiteNonNegative(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function dateMs(value: DateLike) {
  if (!value) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}
