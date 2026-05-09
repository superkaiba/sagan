/**
 * RunPod GraphQL client. TypeScript port of the explore-persona-space
 * Python adapter (scripts/runpod_api.py). Two scopes:
 *
 *   - account = 'team'     → uses RUNPOD_API_KEY_TEAM + RUNPOD_TEAM_ID_TEAM.
 *                            Falls back to legacy RUNPOD_API_KEY/RUNPOD_TEAM_ID
 *                            so existing setups work without changes.
 *   - account = 'personal' → uses RUNPOD_API_KEY_PERSONAL.
 *                            No team header sent (RunPod rejects X-Team-Id on
 *                            personal-account API keys).
 *
 * The team scope is hard-pinned to Anthropic Safety Research by default, since
 * RunPod silently returns zero pods if the wrong scope is used (a confusing
 * footgun). Set RUNPOD_TEAM_ID_TEAM to override.
 */

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
  machine?: { gpuTypeId?: string };
  runtime?: { ports?: PodPort[] };
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
}

interface AccountAuth {
  apiKey: string;
  teamId: string | null;
}

function resolveAuth(account: RunpodAccount): AccountAuth {
  if (account === 'personal') {
    const apiKey = (process.env.RUNPOD_API_KEY_PERSONAL ?? '').trim();
    if (!apiKey) {
      throw new RunPodError(
        'RUNPOD_API_KEY_PERSONAL is not set. Add it to .env to use account=personal.',
      );
    }
    return { apiKey, teamId: null };
  }
  // account === 'team'
  const apiKey =
    (process.env.RUNPOD_API_KEY_TEAM ?? process.env.RUNPOD_API_KEY ?? '').trim();
  const teamId = (
    process.env.RUNPOD_TEAM_ID_TEAM ??
    process.env.RUNPOD_TEAM_ID ??
    ANTHROPIC_SAFETY_RESEARCH_TEAM_ID
  ).trim();
  if (!apiKey) {
    throw new RunPodError(
      'RUNPOD_API_KEY_TEAM (or legacy RUNPOD_API_KEY) is not set. Add it to .env to use account=team.',
    );
  }
  if (!teamId) {
    throw new RunPodError('RUNPOD_TEAM_ID resolved to empty for account=team.');
  }
  return { apiKey, teamId };
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
    'User-Agent': 'eps-research-dashboard/runner (curl-compat)',
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
  };
}

// ─── Public surface ─────────────────────────────────────────────────────────

export interface DispatchPodSpec {
  /** Account scope. Default 'team'. */
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
}

export async function dispatchPod(spec: DispatchPodSpec): Promise<PodInfo> {
  const account = spec.account ?? 'team';
  const gpuTypeId = GPU_TYPE_IDS[spec.gpuType] ?? spec.gpuType;
  const inputs: Record<string, string | number | boolean> = {
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

  // RunPod GraphQL inputs use unquoted keys; bool/int/enum bare, strings quoted.
  const enumFields = new Set(['cloudType']);
  const fields: string[] = [];
  for (const [k, v] of Object.entries(inputs)) {
    if (typeof v === 'boolean') fields.push(`${k}: ${v ? 'true' : 'false'}`);
    else if (typeof v === 'number' || enumFields.has(k)) fields.push(`${k}: ${v}`);
    else fields.push(`${k}: "${v}"`);
  }
  const inputsBlock = fields.join(', ');
  const query = `
    mutation {
      podFindAndDeployOnDemand(input: { ${inputsBlock} }) {
        id name desiredStatus gpuCount createdAt
        machine { gpuTypeId }
        runtime { ports { ip publicPort privatePort type isIpPublic } }
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

/** Dispatch many pods concurrently. Use for hyperparameter sweeps etc. */
export async function dispatchBatch(specs: DispatchPodSpec[]): Promise<
  Array<{ ok: true; pod: PodInfo } | { ok: false; spec: DispatchPodSpec; error: string }>
> {
  const results = await Promise.allSettled(specs.map((s) => dispatchPod(s)));
  return results.map((r, i) => {
    if (r.status === 'fulfilled') return { ok: true as const, pod: r.value };
    return {
      ok: false as const,
      spec: specs[i]!,
      error: r.reason instanceof Error ? r.reason.message : String(r.reason),
    };
  });
}

export async function getPod(podId: string, account: RunpodAccount = 'team'): Promise<PodInfo> {
  const data = await graphql<{ pod: RawPod | null }>(
    account,
    `query Pod($id: String!) {
      pod(input: {podId: $id}) {
        id name desiredStatus gpuCount createdAt
        machine { gpuTypeId }
        runtime { ports { ip publicPort privatePort type isIpPublic } }
      }
    }`,
    { id: podId },
  );
  if (!data.pod) throw new RunPodError(`Pod ${podId} not found in account=${account}`);
  return parsePod(data.pod);
}

export async function listPods(account: RunpodAccount = 'team'): Promise<PodInfo[]> {
  const data = await graphql<{ myself: { pods?: RawPod[] } | null }>(
    account,
    `{
      myself {
        pods {
          id name desiredStatus gpuCount createdAt
          machine { gpuTypeId }
          runtime { ports { ip publicPort privatePort type isIpPublic } }
        }
      }
    }`,
  );
  return (data.myself?.pods ?? []).map(parsePod);
}

export async function terminatePod(
  podId: string,
  account: RunpodAccount = 'team',
): Promise<boolean> {
  const data = await graphql<{ podTerminate: unknown }>(
    account,
    `mutation Terminate($id: String!) { podTerminate(input: {podId: $id}) }`,
    { id: podId },
  );
  return data.podTerminate === null || data.podTerminate === true;
}

export async function stopPod(
  podId: string,
  account: RunpodAccount = 'team',
): Promise<PodInfo> {
  const data = await graphql<{ podStop: RawPod | null }>(
    account,
    `mutation Stop($id: String!) { podStop(input: {podId: $id}) { id name desiredStatus } }`,
    { id: podId },
  );
  if (!data.podStop) throw new RunPodError(`podStop returned null for ${podId}`);
  return parsePod(data.podStop);
}

export async function resumePod(
  podId: string,
  gpuCount: number,
  account: RunpodAccount = 'team',
): Promise<PodInfo> {
  const data = await graphql<{ podResume: RawPod | null }>(
    account,
    `mutation Resume($id: String!, $n: Int!) {
      podResume(input: {podId: $id, gpuCount: $n}) {
        id name desiredStatus gpuCount createdAt
        machine { gpuTypeId }
        runtime { ports { ip publicPort privatePort type isIpPublic } }
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
  account: RunpodAccount = 'team',
): Promise<PodInfo> {
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
