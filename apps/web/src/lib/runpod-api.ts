const GRAPHQL_URL = 'https://api.runpod.io/graphql';
const ANTHROPIC_SAFETY_RESEARCH_TEAM_ID = 'cm8ipuyys0004l108gb23hody';

export type RunPodAccount = 'team' | 'personal';

export interface RunPodAccountSummary {
  account: RunPodAccount;
  label: string;
  email: string | null;
  clientBalance: number | null;
  currentSpendPerHr: number | null;
  spendLimit: number | null;
  minBalance: number | null;
  underBalance: boolean | null;
  fetchedAt: string;
  error: string | null;
}

interface AccountAuth {
  apiKey: string;
  teamId: string | null;
}

interface RawRunPodUser {
  email?: string | null;
  clientBalance?: number | null;
  currentSpendPerHr?: number | null;
  spendLimit?: number | null;
  minBalance?: number | null;
  underBalance?: boolean | null;
}

function resolveAuth(account: RunPodAccount): AccountAuth | null {
  if (account === 'personal') {
    const apiKey = process.env.RUNPOD_API_KEY_PERSONAL?.trim();
    return apiKey ? { apiKey, teamId: null } : null;
  }

  const apiKey = process.env.RUNPOD_API_KEY_TEAM?.trim() || process.env.RUNPOD_API_KEY?.trim();
  if (!apiKey) return null;
  const teamId =
    process.env.RUNPOD_TEAM_ID_TEAM?.trim() ||
    process.env.RUNPOD_TEAM_ID?.trim() ||
    ANTHROPIC_SAFETY_RESEARCH_TEAM_ID;
  return { apiKey, teamId };
}

function accountLabel(account: RunPodAccount) {
  return account === 'team' ? 'Team' : 'Personal';
}

function emptySummary(account: RunPodAccount, error: string | null): RunPodAccountSummary {
  return {
    account,
    label: accountLabel(account),
    email: null,
    clientBalance: null,
    currentSpendPerHr: null,
    spendLimit: null,
    minBalance: null,
    underBalance: null,
    fetchedAt: new Date().toISOString(),
    error,
  };
}

async function fetchRunPodAccountSummary(account: RunPodAccount): Promise<RunPodAccountSummary | null> {
  const auth = resolveAuth(account);
  if (!auth) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.apiKey}`,
        ...(auth.teamId ? { 'X-Team-Id': auth.teamId } : {}),
        'Content-Type': 'application/json',
        'User-Agent': 'sagan/web (curl-compat)',
      },
      body: JSON.stringify({
        query: `{
          myself {
            email
            clientBalance
            currentSpendPerHr
            spendLimit
            minBalance
            underBalance
          }
        }`,
      }),
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return emptySummary(account, `RunPod HTTP ${res.status}: ${text.slice(0, 180)}`);
    }

    const parsed = (await res.json()) as {
      data?: { myself?: RawRunPodUser | null };
      errors?: unknown;
    };
    if (parsed.errors) return emptySummary(account, `RunPod GraphQL error: ${JSON.stringify(parsed.errors).slice(0, 180)}`);
    const user = parsed.data?.myself;
    if (!user) return emptySummary(account, 'RunPod returned no account data');

    return {
      account,
      label: accountLabel(account),
      email: user.email ?? null,
      clientBalance: finiteNumber(user.clientBalance),
      currentSpendPerHr: finiteNumber(user.currentSpendPerHr),
      spendLimit: finiteNumber(user.spendLimit),
      minBalance: finiteNumber(user.minBalance),
      underBalance: typeof user.underBalance === 'boolean' ? user.underBalance : null,
      fetchedAt: new Date().toISOString(),
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return emptySummary(account, `RunPod request failed: ${message.slice(0, 180)}`);
  } finally {
    clearTimeout(timeout);
  }
}

export async function loadRunPodAccountSummaries(): Promise<RunPodAccountSummary[]> {
  const summaries = await Promise.all([fetchRunPodAccountSummary('team'), fetchRunPodAccountSummary('personal')]);
  return summaries.filter((summary): summary is RunPodAccountSummary => Boolean(summary));
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
