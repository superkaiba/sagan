/**
 * One-shot: import the four "Useful" / "Not useful" results that legacy
 * `dashboard.superkaiba.com` reads live from the GitHub project board at
 * https://github.com/users/superkaiba/projects/1.
 *
 * For each issue currently in those two columns we create:
 *   - one `experiments` row (status = completed, planJson tags the source issue)
 *   - one `runs` row (classification = useful | not_useful, notes_md = issue body)
 *   - for useful results: one `daily_log_entries` row of kind = clean_result on
 *     the same day legacy renders it (CURRENT_USEFUL_DONE_DAY for useful, the
 *     issue's updated_at otherwise).
 *
 * Idempotent: rerunning skips issues already imported (matched on
 * planJson.legacyGithubIssueNumber).
 *
 * Run with the runner env loaded:
 *   pnpm --filter @eps/runner exec tsx scripts/import-mentor-results.ts
 */
import '../src/env.js';
import { sql } from 'drizzle-orm';
import { db, schema, close } from '../src/db.js';

const PROJECT_URL =
  process.env.GITHUB_RESULTS_PROJECT_URL ?? 'https://github.com/users/superkaiba/projects/1';
const REPO_PATH = process.env.GITHUB_RESULTS_REPO ?? 'superkaiba/explore-persona-space';
const CURRENT_USEFUL_DONE_DAY = process.env.GITHUB_RESULTS_USEFUL_DONE_DAY ?? '2026-05-07';

type StatusName = 'Useful' | 'Not useful';

type KanbanIssue = {
  number: number;
  title: string;
  body: string;
  useful: boolean;
  statusName: StatusName;
  createdAt: string;
  updatedAt: string;
  url: string;
};

type MemexColumn = {
  id: string;
  name: string;
  settings?: { options?: Array<{ id: string; name: string }> } | null;
};

type MemexItem = {
  contentType?: string;
  issueCreatedAt?: string;
  updatedAt?: string;
  memexProjectColumnValues?: Array<{ memexProjectColumnId?: string; value?: unknown }>;
  content?: { url?: string } | null;
};

async function fetchIssues(): Promise<KanbanIssue[]> {
  const response = await fetch(PROJECT_URL, {
    cache: 'no-store',
    headers: { Accept: 'text/html', 'User-Agent': 'eps-research-dashboard/import' },
  });
  if (!response.ok) {
    throw new Error(`GitHub project fetch failed: ${response.status} ${response.statusText}`);
  }
  const html = await response.text();

  const columns = readScriptJson<MemexColumn[]>(html, 'memex-columns-data') ?? [];
  const payload = readScriptJson<{ nodes?: MemexItem[] }>(html, 'memex-paginated-items-data');

  const statusOptions = new Map<string, string>();
  for (const column of columns) {
    if (column.id !== 'Status') continue;
    for (const option of column.settings?.options ?? []) {
      statusOptions.set(option.id, option.name);
    }
  }

  const byNumber = new Map<number, KanbanIssue>();
  for (const item of payload?.nodes ?? []) {
    if (item.contentType !== 'Issue') continue;
    const url = item.content?.url ?? '';
    if (!url.includes(`/${REPO_PATH}/issues/`)) continue;

    const titleValue = item.memexProjectColumnValues?.find(
      (v) => v.memexProjectColumnId === 'Title',
    )?.value as { title?: { raw?: string }; number?: number } | undefined;
    const statusValue = item.memexProjectColumnValues?.find(
      (v) => v.memexProjectColumnId === 'Status',
    )?.value as { id?: string } | undefined;

    const statusName = statusValue?.id ? statusOptions.get(statusValue.id) : null;
    if (statusName !== 'Useful' && statusName !== 'Not useful') continue;

    const number = titleValue?.number ?? issueNumberFromUrl(url);
    const title = titleValue?.title?.raw;
    const createdAt = item.issueCreatedAt;
    if (!number || !title || !createdAt) continue;

    byNumber.set(number, {
      number,
      title,
      body: '',
      useful: statusName === 'Useful',
      statusName: statusName as StatusName,
      createdAt,
      updatedAt: item.updatedAt ?? createdAt,
      url,
    });
  }

  return Promise.all(
    Array.from(byNumber.values()).map(async (issue) => {
      try {
        const r = await fetch(`https://api.github.com/repos/${REPO_PATH}/issues/${issue.number}`, {
          cache: 'no-store',
          headers: githubHeaders(),
        });
        if (!r.ok) return issue;
        const data = (await r.json()) as {
          title?: string;
          body?: string | null;
          created_at?: string;
          updated_at?: string;
          html_url?: string;
        };
        return {
          ...issue,
          title: data.title ?? issue.title,
          body: data.body ?? issue.body,
          createdAt: data.created_at ?? issue.createdAt,
          updatedAt: data.updated_at ?? issue.updatedAt,
          url: data.html_url ?? issue.url,
        };
      } catch (err) {
        console.warn(`[import] hydrate failed for #${issue.number}:`, err);
        return issue;
      }
    }),
  );
}

function resultDoneAt(issue: KanbanIssue): string {
  if (!issue.useful) return issue.updatedAt;
  return withDayPreservingUtcTime(issue.createdAt, CURRENT_USEFUL_DONE_DAY);
}

function withDayPreservingUtcTime(value: string, day: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return `${day}T12:00:00.000Z`;
  const time = [
    String(date.getUTCHours()).padStart(2, '0'),
    String(date.getUTCMinutes()).padStart(2, '0'),
    String(date.getUTCSeconds()).padStart(2, '0'),
  ].join(':');
  return `${day}T${time}.${String(date.getUTCMilliseconds()).padStart(3, '0')}Z`;
}

function readScriptJson<T>(html: string, id: string): T | null {
  const pattern = new RegExp(
    `<script type="application/json" id="${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">([\\s\\S]*?)</script>`,
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
  const match = url.match(/\/issues\/(\d+)(?:$|[/?#])/);
  return match?.[1] ? Number(match[1]) : null;
}

function confidenceFromTitle(title: string): 'HIGH' | 'MODERATE' | 'LOW' | null {
  const match = title.match(/\b(HIGH|MODERATE|LOW)\s+confidence\b/i);
  return (match?.[1]?.toUpperCase() as 'HIGH' | 'MODERATE' | 'LOW' | undefined) ?? null;
}

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'eps-research-dashboard/import',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function main() {
  const issues = await fetchIssues();
  if (issues.length === 0) {
    console.log('[import] no Useful / Not useful issues found on the legacy board');
    return;
  }
  console.log(`[import] found ${issues.length} mentor-classified issues`);

  let created = 0;
  let skipped = 0;

  for (const issue of issues) {
    const existing = await db()
      .select({ id: schema.experiments.id })
      .from(schema.experiments)
      .where(sql`${schema.experiments.planJson}->>'legacyGithubIssueNumber' = ${String(issue.number)}`)
      .limit(1);

    if (existing.length > 0) {
      skipped += 1;
      console.log(`[import] #${issue.number} already imported as experiment ${existing[0].id}`);
      continue;
    }

    const confidence = confidenceFromTitle(issue.title);
    const doneAt = new Date(resultDoneAt(issue));
    const createdAt = new Date(issue.createdAt);

    const [experiment] = await db()
      .insert(schema.experiments)
      .values({
        title: issue.title,
        hypothesis: issue.title,
        status: 'completed',
        runpodAccount: 'team',
        planJson: {
          legacyGithubIssueNumber: issue.number,
          legacyGithubUrl: issue.url,
          legacyStatusName: issue.statusName,
          legacyConfidence: confidence,
          importedFrom: 'legacy_dashboard_kanban',
          importedAt: new Date().toISOString(),
        },
        createdAt,
        updatedAt: doneAt,
      })
      .returning({ id: schema.experiments.id });

    if (!experiment) {
      console.error(`[import] failed to insert experiment for #${issue.number}`);
      continue;
    }

    await db().insert(schema.runs).values({
      experimentId: experiment.id,
      classification: issue.useful ? 'useful' : 'not_useful',
      notesMd: issue.body?.trim() || `(no body — see ${issue.url})`,
      startedAt: createdAt,
      completedAt: doneAt,
      createdAt,
      updatedAt: doneAt,
    });

    if (issue.useful) {
      const day = doneAt.toISOString().slice(0, 10);
      const summary = issue.body?.trim()?.split(/\n+/).slice(0, 3).join(' ').slice(0, 280) || '';
      await db().insert(schema.dailyLogEntries).values({
        day,
        kind: 'clean_result',
        bodyMd: summary
          ? `**${issue.title}**\n\n${summary}\n\n[GitHub issue #${issue.number}](${issue.url})`
          : `**${issue.title}**\n\n[GitHub issue #${issue.number}](${issue.url})`,
        entityKind: 'experiment',
        entityId: experiment.id,
        position: 0,
        createdAt: doneAt,
        updatedAt: doneAt,
      });
    }

    created += 1;
    console.log(
      `[import] #${issue.number} ${issue.statusName} → experiment ${experiment.id} (${issue.title.slice(0, 80)})`,
    );
  }

  console.log(`[import] done — created=${created} skipped=${skipped} total=${issues.length}`);
}

main()
  .catch(async (err) => {
    console.error(err);
    await close();
    process.exit(1);
  })
  .then(async () => {
    await close();
  });
