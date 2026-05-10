/**
 * One-shot: scrape the legacy GitHub project board for the mentor's
 * "Useful" / "Not useful" results and write the snapshot to
 * apps/web/data/mentor-legacy-results.json.
 *
 * The runtime dashboard reads only the snapshot — it never hits GitHub.
 * Run this when you publish a new useful result and want it visible to
 * the mentor at /mentor/updates:
 *
 *   pnpm --filter @eps/runner snapshot-mentor
 *   git commit -am "snapshot: refresh mentor results"
 *
 * Requires GITHUB_TOKEN (or GH_TOKEN) in the environment for the
 * issue-body API hits.
 */
import '../src/env.js';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const PROJECT_URL =
  process.env.GITHUB_RESULTS_PROJECT_URL ?? 'https://github.com/users/superkaiba/projects/1';
const REPO_PATH = process.env.GITHUB_RESULTS_REPO ?? 'superkaiba/explore-persona-space';
const CURRENT_USEFUL_DONE_DAY = process.env.GITHUB_RESULTS_USEFUL_DONE_DAY ?? '2026-05-07';

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

function ghHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'eps-research-dashboard-snapshot',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function readScriptJson<T>(html: string, id: string): T | null {
  const re = new RegExp(
    `<script type="application/json" id="${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">([\\s\\S]*?)<\\/script>`,
  );
  const m = html.match(re);
  if (!m?.[1]) return null;
  try {
    return JSON.parse(m[1]) as T;
  } catch {
    return null;
  }
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

function stableId(n: number): string {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0').slice(-12)}`;
}

function confidenceFromTitle(title: string): 'HIGH' | 'MODERATE' | 'LOW' | null {
  const m = title.match(/\b(HIGH|MODERATE|LOW)\s+confidence\b/i);
  return m?.[1] ? (m[1].toUpperCase() as 'HIGH' | 'MODERATE' | 'LOW') : null;
}

async function main() {
  const res = await fetch(PROJECT_URL, {
    headers: { Accept: 'text/html', 'User-Agent': 'eps-research-dashboard-snapshot' },
  });
  if (!res.ok) throw new Error(`project fetch ${res.status}`);
  const html = await res.text();
  const columns = readScriptJson<MemexColumn[]>(html, 'memex-columns-data') ?? [];
  const payload = readScriptJson<{ nodes?: MemexItem[] }>(html, 'memex-paginated-items-data');

  const statusOptions = new Map<string, string>();
  for (const c of columns) {
    if (c.id !== 'Status') continue;
    for (const o of c.settings?.options ?? []) statusOptions.set(o.id, o.name);
  }

  const byNumber = new Map<
    number,
    { number: number; title: string; useful: boolean; statusName: string; createdAt: string; updatedAt: string; url: string }
  >();
  for (const item of payload?.nodes ?? []) {
    if (item.contentType !== 'Issue') continue;
    const url = item.content?.url ?? '';
    if (!url.includes(`/${REPO_PATH}/issues/`)) continue;
    const titleVal = item.memexProjectColumnValues?.find((v) => v.memexProjectColumnId === 'Title')
      ?.value as { title?: { raw?: string }; number?: number } | undefined;
    const statusVal = item.memexProjectColumnValues?.find((v) => v.memexProjectColumnId === 'Status')
      ?.value as { id?: string } | undefined;
    const statusName = statusVal?.id ? statusOptions.get(statusVal.id) : null;
    if (statusName !== 'Useful' && statusName !== 'Not useful') continue;
    const number = titleVal?.number;
    const title = titleVal?.title?.raw;
    const createdAt = item.issueCreatedAt;
    if (!number || !title || !createdAt) continue;
    byNumber.set(number, {
      number,
      title,
      useful: statusName === 'Useful',
      statusName,
      createdAt,
      updatedAt: item.updatedAt ?? createdAt,
      url,
    });
  }

  const hydrated = await Promise.all(
    Array.from(byNumber.values()).map(async (iss) => {
      const r = await fetch(`https://api.github.com/repos/${REPO_PATH}/issues/${iss.number}`, {
        headers: ghHeaders(),
      });
      if (!r.ok) return { ...iss, body: '' };
      const d = (await r.json()) as { body?: string | null };
      return { ...iss, body: d.body ?? '' };
    }),
  );

  const results = hydrated
    .map((iss) => {
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
        excerpt: body.replace(/\s+/g, ' ').slice(0, 320),
        confidence: confidenceFromTitle(iss.title),
        useful: iss.useful,
        statusName: iss.statusName,
        createdAt: iss.createdAt,
        doneAt,
        url: iss.url,
      };
    })
    .sort((a, b) => new Date(b.doneAt).getTime() - new Date(a.doneAt).getTime());

  const out = path.resolve(process.cwd(), '../../apps/web/data/mentor-legacy-results.json');
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify({ results }, null, 2) + '\n');
  console.log(`wrote ${results.length} result(s) to ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
