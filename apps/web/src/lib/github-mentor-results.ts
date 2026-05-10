/**
 * Port of the legacy `lib/github-kanban-results.ts` from
 * explore-persona-space-dashboard, stripped of the claims-table join.
 *
 * Scrapes the public GitHub Projects v2 board, picks issues in the
 * "Useful" / "Not useful" columns, hydrates titles + bodies, and returns
 * a CleanResult[]. Used by /mentor/updates to keep the four legacy
 * results visible to the mentor after the DNS cutover.
 */

const PROJECT_URL =
  process.env.GITHUB_RESULTS_PROJECT_URL ?? 'https://github.com/users/superkaiba/projects/1';
const REPO_PATH = process.env.GITHUB_RESULTS_REPO ?? 'superkaiba/explore-persona-space';
const CURRENT_USEFUL_DONE_DAY = process.env.GITHUB_RESULTS_USEFUL_DONE_DAY ?? '2026-05-07';

export type Confidence = 'HIGH' | 'MODERATE' | 'LOW' | null;

export interface CleanResult {
  id: string;
  number: number;
  title: string;
  body: string;
  excerpt: string;
  confidence: Confidence;
  useful: boolean;
  statusName: 'Useful' | 'Not useful';
  createdAt: string;
  doneAt: string;
  url: string;
}

interface MemexColumn {
  id: string;
  name: string;
  settings?: { options?: Array<{ id: string; name: string }> } | null;
}

interface MemexItem {
  contentType?: string;
  issueCreatedAt?: string;
  updatedAt?: string;
  memexProjectColumnValues?: Array<{ memexProjectColumnId?: string; value?: unknown }>;
  content?: { url?: string } | null;
}

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'eps-research-dashboard',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readScriptJson<T>(html: string, id: string): T | null {
  const pattern = new RegExp(
    `<script type="application/json" id="${escapeRegExp(id)}">([\\s\\S]*?)<\\/script>`,
  );
  const match = html.match(pattern);
  if (!match?.[1]) return null;
  try {
    return JSON.parse(match[1]) as T;
  } catch {
    return null;
  }
}

function issueNumberFromUrl(url: string): number | null {
  const m = url.match(/\/issues\/(\d+)(?:$|[/?#])/);
  return m?.[1] ? Number(m[1]) : null;
}

function confidenceFromTitle(title: string): Confidence {
  const m = title.match(/\b(HIGH|MODERATE|LOW)\s+confidence\b/i);
  return m?.[1] ? (m[1].toUpperCase() as Confidence) : null;
}

function withDayPreservingUtcTime(value: string, day: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return `${day}T12:00:00.000Z`;
  const time = [
    String(d.getUTCHours()).padStart(2, '0'),
    String(d.getUTCMinutes()).padStart(2, '0'),
    String(d.getUTCSeconds()).padStart(2, '0'),
  ].join(':');
  return `${day}T${time}.${String(d.getUTCMilliseconds()).padStart(3, '0')}Z`;
}

function stableId(issueNumber: number): string {
  return `00000000-0000-4000-8000-${issueNumber.toString(16).padStart(12, '0').slice(-12)}`;
}

function markdownExcerpt(body: string, max = 320): string {
  const cleaned = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_`>#\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
}

interface RawIssue {
  number: number;
  title: string;
  body: string;
  useful: boolean;
  statusName: 'Useful' | 'Not useful';
  createdAt: string;
  updatedAt: string;
  url: string;
}

function kanbanIssueFromItem(
  item: MemexItem,
  statusOptions: Map<string, string>,
): RawIssue | null {
  if (item.contentType !== 'Issue') return null;
  const url = item.content?.url ?? '';
  if (!url.includes(`/${REPO_PATH}/issues/`)) return null;

  const titleValue = item.memexProjectColumnValues?.find((v) => v.memexProjectColumnId === 'Title')
    ?.value as { title?: { raw?: string }; number?: number } | undefined;
  const statusValue = item.memexProjectColumnValues?.find(
    (v) => v.memexProjectColumnId === 'Status',
  )?.value as { id?: string } | undefined;

  const statusName = statusValue?.id ? statusOptions.get(statusValue.id) : null;
  if (statusName !== 'Useful' && statusName !== 'Not useful') return null;

  const number = titleValue?.number ?? issueNumberFromUrl(url);
  const title = titleValue?.title?.raw;
  const createdAt = item.issueCreatedAt;
  if (!number || !title || !createdAt) return null;

  return {
    number,
    title,
    body: '',
    useful: statusName === 'Useful',
    statusName,
    createdAt,
    updatedAt: item.updatedAt ?? createdAt,
    url,
  };
}

async function hydrateBody(issue: RawIssue): Promise<RawIssue> {
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO_PATH}/issues/${issue.number}`, {
      cache: 'no-store',
      headers: githubHeaders(),
    });
    if (!r.ok) return issue;
    const d = (await r.json()) as {
      title?: string;
      body?: string | null;
      created_at?: string;
      updated_at?: string;
      html_url?: string;
    };
    return {
      ...issue,
      title: d.title ?? issue.title,
      body: d.body ?? issue.body,
      createdAt: d.created_at ?? issue.createdAt,
      updatedAt: d.updated_at ?? issue.updatedAt,
      url: d.html_url ?? issue.url,
    };
  } catch {
    return issue;
  }
}

export async function getMentorCleanResults(): Promise<CleanResult[]> {
  const res = await fetch(PROJECT_URL, {
    cache: 'no-store',
    headers: { Accept: 'text/html', 'User-Agent': 'eps-research-dashboard' },
  });
  if (!res.ok) {
    console.warn(`mentor scraper: GitHub project fetch failed: ${res.status}`);
    return [];
  }
  const html = await res.text();
  const columns =
    readScriptJson<MemexColumn[]>(html, 'memex-columns-data') ?? ([] as MemexColumn[]);
  const payload = readScriptJson<{ nodes?: MemexItem[] }>(html, 'memex-paginated-items-data');

  const statusOptions = new Map<string, string>();
  for (const c of columns) {
    if (c.id !== 'Status') continue;
    for (const o of c.settings?.options ?? []) statusOptions.set(o.id, o.name);
  }

  const byNumber = new Map<number, RawIssue>();
  for (const item of payload?.nodes ?? []) {
    const it = kanbanIssueFromItem(item, statusOptions);
    if (!it) continue;
    byNumber.set(it.number, it);
  }
  const issues = await Promise.all(Array.from(byNumber.values()).map(hydrateBody));

  return issues
    .map<CleanResult>((iss) => {
      const body =
        iss.body.trim() ||
        `GitHub issue #${iss.number} is in the ${iss.statusName} column of the project board.`;
      const doneAt = iss.useful
        ? withDayPreservingUtcTime(iss.createdAt, CURRENT_USEFUL_DONE_DAY)
        : iss.updatedAt;
      return {
        id: stableId(iss.number),
        number: iss.number,
        title: iss.title,
        body,
        excerpt: markdownExcerpt(body),
        confidence: confidenceFromTitle(iss.title),
        useful: iss.useful,
        statusName: iss.statusName,
        createdAt: iss.createdAt,
        doneAt,
        url: iss.url,
      };
    })
    .sort((a, b) => new Date(b.doneAt).getTime() - new Date(a.doneAt).getTime());
}
