/**
 * RunPod GraphQL client. TypeScript port of the explore-persona-space
 * Python adapter (scripts/runpod_api.py). Two scopes:
 *
 *   - account = 'personal' → uses RUNPOD_API_KEY_PERSONAL. (default)
 *                            No team header sent (RunPod rejects X-Team-Id on
 *                            personal-account API keys).
 *   - account = 'team'     → uses RUNPOD_API_KEY_TEAM + RUNPOD_TEAM_ID_TEAM.
 *                            Falls back to legacy RUNPOD_API_KEY/RUNPOD_TEAM_ID.
 *                            Kept so historic pod_lifecycle rows
 *                            (account='team') can still be terminated/queried.
 *
 * The team scope is hard-pinned to Anthropic Safety Research by default, since
 * RunPod silently returns zero pods if the wrong scope is used (a confusing
 * footgun). Set RUNPOD_TEAM_ID_TEAM to override.
 */

import { wrapDockerArgsForBootstrap } from '../lib/pod-bootstrap.js';

const GRAPHQL_URL = 'https://api.runpod.io/graphql';
const ANTHROPIC_SAFETY_RESEARCH_TEAM_ID = 'cm8ipuyys0004l108gb23hody';

export const DEFAULT_IMAGE = 'runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04';
export const DEFAULT_VOLUME_GB = 200;
export const DEFAULT_CONTAINER_DISK_GB = 50;

// RunPod requires GPU type IDs in the exact form below.
export const GPU_TYPE_IDS: Record<string, string> = {
  H100: 'NVIDIA H100 80GB HBM3',
  H200: 'NVIDIA H200',
  A100: 'NVIDIA A100-SXM4-80GB',
  L40S: 'NVIDIA L40S',
  RTX4090: 'NVIDIA GeForce RTX 4090',
};

export type RunpodAccount = 'team' | 'personal';

export class RunPodError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RunPodError';
  }
}

interface PodPort {
  ip?: string;
  publicPort?: number;
  privatePort?: number;
  type?: string;
  isIpPublic?: boolean;
}

interface RawPod {
  id: string;
  name?: string;
  desiredStatus?: string;
  gpuCount?: number;
  createdAt?: string;
  lastStartedAt?: string;
  costPerHr?: number;
  adjustedCostPerHr?: number;
  machine?: { gpuTypeId?: string; costPerHr?: number; currentPricePerGpu?: number };
  runtime?: { ports?: PodPort[]; uptimeInSeconds?: number };
}

export interface PodInfo {
  podId: string;
  name: string;
  desiredStatus: string;
  gpuCount: number | null;
  gpuTypeId: string | null;
  sshHost: string | null;
  sshPort: number | null;
  createdAt: string | null;
  lastStartedAt: string | null;
  costPerHr: number | null;
  adjustedCostPerHr: number | null;
  uptimeSeconds: number | null;
}

interface AccountAuth {
  apiKey: string;
  teamId: string | null;
}

function resolveAuth(account: RunpodAccount): AccountAuth {
  const personalKey = (process.env.RUNPOD_API_KEY_PERSONAL ?? '').trim();
  if (account === 'personal') {
    if (!personalKey) {
      throw new RunPodError(
        'RUNPOD_API_KEY_PERSONAL is not set. Add it to .env to use account=personal.',
      );
    }
    return { apiKey: personalKey, teamId: null };
  }
  // account === 'team' — historic pod_lifecycle rows still resolve here. Fall
  // through empty strings (not just undefined) and, when team-specific vars
  // are missing, fall back to the personal key so legacy 'team'-labeled pods
  // can still be terminated/queried. RunPod ignores X-Team-Id on personal-
  // account keys, so we drop the header when we fall back.
  const teamKey =
    process.env.RUNPOD_API_KEY_TEAM?.trim() ||
    process.env.RUNPOD_API_KEY?.trim() ||
    '';
  if (!teamKey) {
    if (!personalKey) {
      throw new RunPodError(
        'No RunPod API key configured (set RUNPOD_API_KEY_PERSONAL in .env).',
      );
    }
    return { apiKey: personalKey, teamId: null };
  }
  const teamId =
    process.env.RUNPOD_TEAM_ID_TEAM?.trim() ||
    process.env.RUNPOD_TEAM_ID?.trim() ||
    ANTHROPIC_SAFETY_RESEARCH_TEAM_ID;
  if (!teamId) {
    throw new RunPodError('RUNPOD_TEAM_ID resolved to empty for account=team.');
  }
  return { apiKey: teamKey, teamId };
}

async function graphql<T>(
  account: RunpodAccount,
  query: string,
  variables?: Record<string, unknown>,
  timeoutMs = 60_000,
): Promise<T> {
  const { apiKey, teamId } = resolveAuth(account);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    // RunPod's CF rules block the default fetch UA; use a curl-shaped one.
    'User-Agent': 'sagan/runner (curl-compat)',
  };
  if (teamId) headers['X-Team-Id'] = teamId;

  let res: Response;
  try {
    res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    throw new RunPodError(
      `Network error contacting RunPod: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  clearTimeout(timer);

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new RunPodError(`HTTP ${res.status} from RunPod: ${body.slice(0, 500)}`);
  }
  const parsed = (await res.json()) as { errors?: unknown; data?: T };
  if (parsed.errors) {
    throw new RunPodError(`GraphQL errors: ${JSON.stringify(parsed.errors).slice(0, 500)}`);
  }
  if (!parsed.data) {
    throw new RunPodError(`Malformed response (no 'data' field)`);
  }
  return parsed.data;
}

function parsePod(raw: RawPod): PodInfo {
  const ports = raw.runtime?.ports ?? [];
  let sshHost: string | null = null;
  let sshPort: number | null = null;
  for (const p of ports) {
    if (p.type === 'tcp' && p.privatePort === 22 && p.isIpPublic) {
      sshHost = p.ip ?? null;
      sshPort = p.publicPort ?? null;
      break;
    }
  }
  return {
    podId: raw.id,
    name: raw.name ?? '',
    desiredStatus: raw.desiredStatus ?? '',
    gpuCount: raw.gpuCount ?? null,
    gpuTypeId: raw.machine?.gpuTypeId ?? null,
    sshHost,
    sshPort,
    createdAt: raw.createdAt ?? null,
    lastStartedAt: raw.lastStartedAt ?? null,
    costPerHr: raw.costPerHr ?? raw.machine?.costPerHr ?? null,
    adjustedCostPerHr:
      raw.adjustedCostPerHr ??
      (raw.machine?.currentPricePerGpu != null && raw.gpuCount != null
        ? raw.machine.currentPricePerGpu * raw.gpuCount
        : null),
    uptimeSeconds: raw.runtime?.uptimeInSeconds ?? null,
  };
}

// ─── Public surface ─────────────────────────────────────────────────────────

export interface DispatchPodSpec {
  /** Account scope. Default 'personal'. */
  account?: RunpodAccount;
  /** Human-readable pod name. */
  name: string;
  /**
   * Short GPU label (e.g. 'H100', 'H200', 'A100', 'L40S') or full RunPod
   * gpuTypeId. Names not in {@link GPU_TYPE_IDS} are passed through verbatim.
   */
  gpuType: string;
  gpuCount: number;
  image?: string;
  volumeGb?: number;
  containerDiskGb?: number;
  cloudType?: 'ALL' | 'SECURE' | 'COMMUNITY';
  dataCenterId?: string;
  dockerArgs?: string;
  env?: Record<string, string>;
  dryRun?: boolean;
  /**
   * Attach an existing RunPod network volume to this pod. When set, the
   * volume is mounted at `volumeMountPath` (`/workspace`) INSTEAD of
   * creating a fresh per-pod volume. Use this to share
   * `/workspace/.cache/uv`, `/workspace/.cache/huggingface`, and
   * `/workspace/explore-persona-space/.venv` across runs — cold `uv sync`
   * drops from 5-15 min to ~30s of verification.
   *
   * Region-locked: the network volume lives in a specific RunPod data
   * center. The pod-provisioner must request capacity in that DC, so the
   * planner should also set `dataCenterId` to the volume's DC (or accept
   * that scheduling will fail in other DCs and the substitution_policy
   * will not retry there).
   */
  networkVolumeId?: string;
}

export async function dispatchPod(spec: DispatchPodSpec): Promise<PodInfo> {
  if (spec.dryRun || isDryRun()) return dryRunPod(spec);

  const account = spec.account ?? 'personal';
  const gpuTypeId = GPU_TYPE_IDS[spec.gpuType] ?? spec.gpuType;
  // Wrap the planner's dockerArgs with the Sagan bootstrap pre-amble (git
  // clone client repo, install uv, sync deps, cache redirects, write .env)
  // unless the planner already inlined their own bootstrap. See
  // src/lib/pod-bootstrap.ts for the auto-skip rules.
  const wrap = wrapDockerArgsForBootstrap({ dockerArgs: spec.dockerArgs, env: spec.env });
  const finalDockerArgs = wrap.dockerArgs || spec.dockerArgs;
  const finalEnv = { ...(spec.env ?? {}), ...wrap.envAdditions };
  const inputs: Record<string, string | number | boolean | Array<{ key: string; value: string }>> = {
    name: spec.name,
    gpuTypeId,
    gpuCount: spec.gpuCount,
    cloudType: spec.cloudType ?? 'ALL',
    volumeInGb: spec.volumeGb ?? DEFAULT_VOLUME_GB,
    containerDiskInGb: spec.containerDiskGb ?? DEFAULT_CONTAINER_DISK_GB,
    imageName: spec.image ?? DEFAULT_IMAGE,
    volumeMountPath: '/workspace',
    startSsh: true,
    ports: '8888/http,22/tcp',
  };
  if (spec.dataCenterId) inputs.dataCenterId = spec.dataCenterId;
  // networkVolumeId attaches a persistent shared volume at /workspace
  // instead of provisioning a fresh per-pod volume. See DispatchPodSpec
  // docstring for the warm-cache rationale and region-lock implications.
  if (spec.networkVolumeId) inputs.networkVolumeId = spec.networkVolumeId;
  if (finalDockerArgs) inputs.dockerArgs = finalDockerArgs;
  const env = Object.entries(finalEnv)
    .filter(([key]) => key.trim())
    .map(([key, value]) => ({ key, value }));
  if (env.length > 0) inputs.env = env;

  // RunPod GraphQL inputs use unquoted keys; bool/int/enum bare, strings quoted.
  const enumFields = new Set(['cloudType']);
  const fields: string[] = [];
  for (const [k, v] of Object.entries(inputs)) {
    fields.push(`${k}: ${graphqlInputValue(v, enumFields.has(k))}`);
  }
  const inputsBlock = fields.join(', ');
  const query = `
    mutation {
      podFindAndDeployOnDemand(input: { ${inputsBlock} }) {
        id name desiredStatus gpuCount createdAt lastStartedAt costPerHr adjustedCostPerHr
        machine { gpuTypeId costPerHr currentPricePerGpu }
        runtime { uptimeInSeconds ports { ip publicPort privatePort type isIpPublic } }
      }
    }
  `;
  const data = await graphql<{ podFindAndDeployOnDemand: RawPod | null }>(account, query);
  if (!data.podFindAndDeployOnDemand) {
    throw new RunPodError(
      `podFindAndDeployOnDemand returned null — no capacity for ${spec.gpuCount}x ${spec.gpuType} on cloudType=${inputs.cloudType}.`,
    );
  }
  return parsePod(data.podFindAndDeployOnDemand);
}

function graphqlInputValue(value: string | number | boolean | Array<{ key: string; value: string }>, isEnum = false): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number' || isEnum) return String(value);
  if (Array.isArray(value)) {
    return `[${value
      .map((item) => `{ key: ${JSON.stringify(item.key)}, value: ${JSON.stringify(item.value)} }`)
      .join(', ')}]`;
  }
  return JSON.stringify(value);
}

// RunPod returns a generic INTERNAL_SERVER_ERROR on podFindAndDeployOnDemand
// when its on-demand allocator can't find capacity for the requested
// GPU/cloudType in the moment. The pool usually replenishes within minutes;
// retry transient capacity errors with bounded exponential backoff before
// giving up. Auth / malformed-spec errors should fail fast.
const TRANSIENT_RUNPOD_RE = /INTERNAL_SERVER_ERROR|returned null — no capacity|HTTP 5\d\d from RunPod|ECONNRESET|ETIMEDOUT|fetch failed/i;
const DISPATCH_RETRY_DELAYS_MS = [30_000, 60_000, 120_000];

async function dispatchPodWithRetry(
  spec: DispatchPodSpec,
): Promise<{ ok: true; pod: PodInfo } | { ok: false; error: string; attempts: number }> {
  let attempts = 0;
  let lastError = '';
  for (;;) {
    attempts++;
    try {
      const pod = await dispatchPod(spec);
      return { ok: true as const, pod };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      const transient = TRANSIENT_RUNPOD_RE.test(lastError);
      const delay = DISPATCH_RETRY_DELAYS_MS[attempts - 1];
      if (!transient || delay === undefined) {
        return { ok: false as const, error: lastError, attempts };
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/** Dispatch many pods concurrently. Use for hyperparameter sweeps etc. */
export async function dispatchBatch(specs: DispatchPodSpec[]): Promise<
  Array<
    | { ok: true; pod: PodInfo; attempts?: number }
    | { ok: false; spec: DispatchPodSpec; error: string; attempts: number }
  >
> {
  const results = await Promise.all(specs.map((s) => dispatchPodWithRetry(s)));
  return results.map((r, i) => {
    if (r.ok) return { ok: true as const, pod: r.pod };
    return { ok: false as const, spec: specs[i]!, error: r.error, attempts: r.attempts };
  });
}

export async function getPod(podId: string, account: RunpodAccount = 'personal'): Promise<PodInfo> {
  if (isDryRunPodId(podId)) return dryRunPodInfo(podId, account, 'RUNNING');

  const data = await graphql<{ pod: RawPod | null }>(
    account,
    `query Pod($id: String!) {
      pod(input: {podId: $id}) {
        id name desiredStatus gpuCount createdAt lastStartedAt costPerHr adjustedCostPerHr
        machine { gpuTypeId costPerHr currentPricePerGpu }
        runtime { uptimeInSeconds ports { ip publicPort privatePort type isIpPublic } }
      }
    }`,
    { id: podId },
  );
  if (!data.pod) throw new RunPodError(`Pod ${podId} not found in account=${account}`);
  return parsePod(data.pod);
}

export async function listPods(account: RunpodAccount = 'personal'): Promise<PodInfo[]> {
  if (isDryRun()) return [];

  const data = await graphql<{ myself: { pods?: RawPod[] } | null }>(
    account,
    `{
      myself {
        pods {
          id name desiredStatus gpuCount createdAt
          lastStartedAt costPerHr adjustedCostPerHr
          machine { gpuTypeId costPerHr currentPricePerGpu }
          runtime { uptimeInSeconds ports { ip publicPort privatePort type isIpPublic } }
        }
      }
    }`,
  );
  return (data.myself?.pods ?? []).map(parsePod);
}

export async function terminatePod(
  podId: string,
  account: RunpodAccount = 'personal',
): Promise<boolean> {
  if (isDryRunPodId(podId)) return true;

  const data = await graphql<{ podTerminate: unknown }>(
    account,
    `mutation Terminate($id: String!) { podTerminate(input: {podId: $id}) }`,
    { id: podId },
  );
  return data.podTerminate === null || data.podTerminate === true;
}

export interface NetworkVolumeInfo {
  id: string;
  name: string;
  size: number; // GB
  dataCenterId: string;
}

interface RawNetworkVolume {
  id?: string | null;
  name?: string | null;
  size?: number | null;
  dataCenterId?: string | null;
}

function parseNetworkVolume(raw: RawNetworkVolume): NetworkVolumeInfo {
  return {
    id: raw.id ?? '',
    name: raw.name ?? '',
    size: raw.size ?? 0,
    dataCenterId: raw.dataCenterId ?? '',
  };
}

export async function listNetworkVolumes(
  account: RunpodAccount = 'personal',
): Promise<NetworkVolumeInfo[]> {
  if (isDryRun()) return [];
  const data = await graphql<{ myself: { networkVolumes?: RawNetworkVolume[] } | null }>(
    account,
    `{
      myself {
        networkVolumes {
          id name size dataCenterId
        }
      }
    }`,
  );
  return (data.myself?.networkVolumes ?? []).map(parseNetworkVolume);
}

export async function createNetworkVolume(
  input: { name: string; size: number; dataCenterId: string },
  account: RunpodAccount = 'personal',
): Promise<NetworkVolumeInfo> {
  if (isDryRun()) {
    return { id: 'dry-run-volume', name: input.name, size: input.size, dataCenterId: input.dataCenterId };
  }
  const data = await graphql<{ saveNetworkVolume: RawNetworkVolume | null }>(
    account,
    `mutation CreateVolume($name: String!, $size: Int!, $dc: String!) {
      saveNetworkVolume(input: { name: $name, size: $size, dataCenterId: $dc }) {
        id name size dataCenterId
      }
    }`,
    { name: input.name, size: input.size, dc: input.dataCenterId },
  );
  if (!data.saveNetworkVolume) {
    throw new RunPodError(
      `saveNetworkVolume returned null for ${input.name} (size=${input.size}GB dc=${input.dataCenterId})`,
    );
  }
  return parseNetworkVolume(data.saveNetworkVolume);
}

export async function stopPod(
  podId: string,
  account: RunpodAccount = 'personal',
): Promise<PodInfo> {
  if (isDryRunPodId(podId)) return dryRunPodInfo(podId, account, 'STOPPED');

  const data = await graphql<{ podStop: RawPod | null }>(
    account,
    `mutation Stop($id: String!) {
      podStop(input: {podId: $id}) {
        id name desiredStatus gpuCount createdAt lastStartedAt costPerHr adjustedCostPerHr
        machine { gpuTypeId costPerHr currentPricePerGpu }
        runtime { uptimeInSeconds ports { ip publicPort privatePort type isIpPublic } }
      }
    }`,
    { id: podId },
  );
  if (!data.podStop) throw new RunPodError(`podStop returned null for ${podId}`);
  return parsePod(data.podStop);
}

export async function resumePod(
  podId: string,
  gpuCount: number,
  account: RunpodAccount = 'personal',
): Promise<PodInfo> {
  if (isDryRunPodId(podId)) return { ...dryRunPodInfo(podId, account, 'RUNNING'), gpuCount };

  const data = await graphql<{ podResume: RawPod | null }>(
    account,
    `mutation Resume($id: String!, $n: Int!) {
      podResume(input: {podId: $id, gpuCount: $n}) {
        id name desiredStatus gpuCount createdAt
        lastStartedAt costPerHr adjustedCostPerHr
        machine { gpuTypeId costPerHr currentPricePerGpu }
        runtime { uptimeInSeconds ports { ip publicPort privatePort type isIpPublic } }
      }
    }`,
    { id: podId, n: gpuCount },
  );
  if (!data.podResume) throw new RunPodError(`podResume returned null for ${podId}`);
  return parsePod(data.podResume);
}

/** Poll until 22/tcp has a public mapping. Returns the final PodInfo. */
export async function waitForSsh(
  podId: string,
  timeoutMs = 600_000,
  pollIntervalMs = 10_000,
  account: RunpodAccount = 'personal',
): Promise<PodInfo> {
  if (isDryRunPodId(podId)) return dryRunPodInfo(podId, account, 'RUNNING');

  const deadline = Date.now() + timeoutMs;
  let last: PodInfo | undefined;
  while (Date.now() < deadline) {
    last = await getPod(podId, account);
    if (last.sshHost && last.sshPort) return last;
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  throw new RunPodError(
    `Pod ${podId} did not expose public 22/tcp within ${Math.round(timeoutMs / 1000)}s. Last status: ${last?.desiredStatus ?? 'unknown'}`,
  );
}

function isDryRun() {
  return process.env.RUNPOD_DRY_RUN === '1';
}

function isDryRunPodId(podId: string) {
  return podId.startsWith('dryrun-');
}

function dryRunPod(spec: DispatchPodSpec): PodInfo {
  const gpuTypeId = GPU_TYPE_IDS[spec.gpuType] ?? spec.gpuType;
  const podId = `dryrun-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    podId,
    name: spec.name,
    desiredStatus: 'RUNNING',
    gpuCount: spec.gpuCount,
    gpuTypeId,
    sshHost: '127.0.0.1',
    sshPort: 2222,
    createdAt: new Date().toISOString(),
    lastStartedAt: new Date().toISOString(),
    costPerHr: 0,
    adjustedCostPerHr: 0,
    uptimeSeconds: 0,
  };
}

function dryRunPodInfo(
  podId: string,
  account: RunpodAccount,
  desiredStatus: 'RUNNING' | 'STOPPED' | 'TERMINATED',
): PodInfo {
  return {
    podId,
    name: `${account}-${podId}`,
    desiredStatus,
    gpuCount: 1,
    gpuTypeId: 'dry-run-gpu',
    sshHost: desiredStatus === 'RUNNING' ? '127.0.0.1' : null,
    sshPort: desiredStatus === 'RUNNING' ? 2222 : null,
    createdAt: new Date().toISOString(),
    lastStartedAt: desiredStatus === 'RUNNING' ? new Date().toISOString() : null,
    costPerHr: 0,
    adjustedCostPerHr: 0,
    uptimeSeconds: 0,
  };
}
