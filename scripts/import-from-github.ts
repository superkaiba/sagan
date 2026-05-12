#!/usr/bin/env -S npx tsx
/**
 * One-shot importer: GitHub Project issues → Sagan.
 *
 * Usage:
 *   tsx scripts/import-from-github.ts --dry-run    # no writes, prints report + /tmp dump
 *   tsx scripts/import-from-github.ts --apply      # writes to DATABASE_URL_DIRECT
 *
 * Required env: GITHUB_REPO (owner/name), GITHUB_PROJECT_NUMBER,
 * GITHUB_PROJECT_OWNER. Also requires `gh` CLI authenticated and
 * `DATABASE_URL_DIRECT` in env.
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import postgres from 'postgres';

// ─── CLI ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const apply = args.includes('--apply');
if (dryRun === apply) {
  console.error('Specify exactly one of --dry-run or --apply');
  process.exit(2);
}

const REPO = process.env.GITHUB_REPO;
const PROJECT_NUMBER = process.env.GITHUB_PROJECT_NUMBER;
const PROJECT_OWNER = process.env.GITHUB_PROJECT_OWNER;
if (!REPO || !PROJECT_NUMBER || !PROJECT_OWNER) {
  console.error(
    'Set GITHUB_REPO (owner/name), GITHUB_PROJECT_NUMBER, and GITHUB_PROJECT_OWNER before running.',
  );
  process.exit(2);
}

// ─── Mappings ─────────────────────────────────────────────────────────────────

const COLUMN_TO_STATUS: Record<string, string> = {
  'To do': 'proposed',
  'Todo by human': 'proposed',
  Planning: 'planning',
  'Plan awaiting review': 'plan_pending',
  'In flight': 'running',
  Blocked: 'blocked',
  'Awaiting promotion': 'awaiting_promotion',
  'Followups running': 'running',
  Useful: 'completed',
  'Not useful': 'completed',
  Done: 'completed',
  Archived: 'archived',
};

const LABEL_TO_STATUS_FALLBACK: Record<string, string> = {
  'status:proposed': 'proposed',
  'status:planning': 'planning',
  'status:plan-pending': 'plan_pending',
  'status:approved': 'approved',
  'status:running': 'running',
  'status:interpreting': 'interpreting',
  'status:reviewing': 'reviewing',
  'status:under-review': 'reviewing',
  'status:gate-pending': 'awaiting_approval',
  'status:awaiting-promotion': 'awaiting_promotion',
  'status:done-experiment': 'completed',
  'status:done-impl': 'completed',
  'status:blocked': 'blocked',
  'status:archived': 'archived',
};

const KIND_LABEL: Record<string, string> = {
  'type:experiment': 'experiment',
  'type:infra': 'infra',
  // Historical: type:analysis + type:batch were collapsed into infra at the kind level.
  'type:analysis': 'infra',
  'type:survey': 'survey',
  'type:batch': 'infra',
};

const COMPUTE_LABEL: Record<string, string> = {
  'compute:none': 'none',
  'compute:small': 'small',
  'compute:medium': 'medium',
  'compute:large': 'large',
};

const PRIORITY_LABEL: Record<string, string> = {
  'prio:low': 'low',
  'prio:medium': 'normal',
  'prio:high': 'high',
  'prio:critical': 'urgent',
};

// Labels that survive as free-text tags
const TAG_LABELS = new Set(['todo', 'superseded']);

// Marker matcher: catches both HTML-comment-wrapped and bare `epm:foo` mentions in comment bodies.
const MARKER_RE = /epm:([a-z][a-z-]*)/i;

// Cross-reference matcher
const REF_RE = /(?:^|[^a-zA-Z0-9_])#(\d{1,4})\b/g;

// Followup parent matcher
const PARENT_PATTERNS = [
  /follow[- ]?up\s+to\s+#(\d{1,4})/i,
  /follow[- ]?ups?\s+of\s+#(\d{1,4})/i,
  /extends?\s+#(\d{1,4})/i,
  /child\s+of\s+#(\d{1,4})/i,
  /parent[: ]+\s*#(\d{1,4})/i,
];

// ─── gh helpers ───────────────────────────────────────────────────────────────

function gh<T = unknown>(extraArgs: string[]): T {
  const out = execFileSync('gh', extraArgs, {
    encoding: 'utf-8',
    maxBuffer: 256 * 1024 * 1024,
  });
  return JSON.parse(out) as T;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface GhLabel {
  name: string;
}
interface GhComment {
  body: string;
  createdAt: string;
  author?: { login?: string } | null;
}
interface GhProjectItem {
  status?: { name?: string; optionId?: string } | null;
  title?: string;
}
interface GhIssue {
  number: number;
  title: string;
  body: string;
  state: 'OPEN' | 'CLOSED';
  createdAt: string;
  updatedAt: string;
  labels: GhLabel[];
  projectItems: GhProjectItem[];
  comments: GhComment[];
  author?: { login?: string } | null;
}

interface ExperimentRow {
  number: number;
  legacyGhNumber: number;
  title: string;
  body: string;
  status: string;
  kind: string;
  computeSize: string | null;
  priority: string;
  assigneeKind: string;
  tags: string[];
  hasCleanResult: boolean;
  createdAt: string;
  updatedAt: string;
  // Derived (for the importer's bookkeeping; not direct DB columns)
  _sourceColumn: string | null;
  _statusSource: 'column' | 'label-fallback' | 'default-proposed';
  _runClassification: 'useful' | 'not_useful' | 'pending' | null;
  _references: number[];
  _parentRef: number | null;
  _markers: Array<{ marker: string; body: string; at: string; author: string | null }>;
  _comments: GhComment[];
  _multipleTypeLabels: string[] | null;
  _multipleComputeLabels: string[] | null;
}

// ─── Core mapping ─────────────────────────────────────────────────────────────

function buildRow(iss: GhIssue): ExperimentRow {
  const labelNames = new Set(iss.labels.map((l) => l.name));
  // Treat empty string ("") the same as null — boarded but no column assigned.
  const rawColumn = iss.projectItems[0]?.status?.name ?? null;
  const column = rawColumn && rawColumn !== '' ? rawColumn : null;

  // Status
  let status: string;
  let statusSource: ExperimentRow['_statusSource'];
  if (column && COLUMN_TO_STATUS[column]) {
    status = COLUMN_TO_STATUS[column];
    statusSource = 'column';
  } else {
    const fromLabel = iss.labels.map((l) => LABEL_TO_STATUS_FALLBACK[l.name]).find(Boolean);
    if (fromLabel) {
      status = fromLabel;
      statusSource = 'label-fallback';
    } else {
      status = 'proposed';
      statusSource = 'default-proposed';
    }
  }

  // Assignee
  const assigneeKind = column === 'Todo by human' ? 'human' : 'agent';

  // Kind (preserve "first wins" for multi-typed issues, but track for the report)
  const typeLabels = iss.labels.map((l) => l.name).filter((n) => n in KIND_LABEL);
  const kind = typeLabels[0] ? KIND_LABEL[typeLabels[0]] : 'experiment';

  // Compute
  const computeLabels = iss.labels.map((l) => l.name).filter((n) => n in COMPUTE_LABEL);
  const computeSize = computeLabels[0] ? COMPUTE_LABEL[computeLabels[0]] : null;

  // Priority
  const prioLabel = iss.labels.map((l) => l.name).find((n) => n in PRIORITY_LABEL);
  const priority = prioLabel ? PRIORITY_LABEL[prioLabel] : 'normal';

  // Tags
  const tags: string[] = [];
  for (const l of labelNames) {
    if (TAG_LABELS.has(l)) tags.push(l);
  }
  if (column === null) tags.push('unboarded');
  if (labelNames.has('todo') && column === null) tags.push('mentor-followup');

  // Clean result
  const hasCleanResult =
    labelNames.has('clean-results') ||
    labelNames.has('clean-results:useful') ||
    labelNames.has('clean-results:not-useful') ||
    labelNames.has('clean-results:draft') ||
    column === 'Useful' ||
    column === 'Not useful';

  let runClassification: ExperimentRow['_runClassification'] = null;
  if (column === 'Useful' || labelNames.has('clean-results:useful')) runClassification = 'useful';
  else if (column === 'Not useful' || labelNames.has('clean-results:not-useful')) runClassification = 'not_useful';
  else if (hasCleanResult) runClassification = 'pending';

  // Cross-refs from body
  const refs = new Set<number>();
  for (const m of iss.body.matchAll(REF_RE)) {
    const n = Number(m[1]);
    if (n !== iss.number && n >= 1 && n <= 9999) refs.add(n);
  }

  // Parent ref: search title + body for any explicit follow-up / extends / child-of language.
  let parentRef: number | null = null;
  const haystack = `${iss.title}\n${iss.body}`;
  for (const pat of PARENT_PATTERNS) {
    const m = haystack.match(pat);
    if (m) {
      const n = Number(m[1]);
      if (n !== iss.number) {
        parentRef = n;
        break;
      }
    }
  }

  // Markers
  const markers: ExperimentRow['_markers'] = [];
  for (const c of iss.comments) {
    const m = c.body.match(MARKER_RE);
    if (m) {
      markers.push({
        marker: `epm:${m[1]}`,
        body: c.body,
        at: c.createdAt,
        author: c.author?.login ?? null,
      });
    }
  }

  return {
    number: iss.number,
    legacyGhNumber: iss.number,
    title: iss.title,
    body: iss.body ?? '',
    status,
    kind,
    computeSize,
    priority,
    assigneeKind,
    tags,
    hasCleanResult,
    createdAt: iss.createdAt,
    updatedAt: iss.updatedAt,
    _sourceColumn: column,
    _statusSource: statusSource,
    _runClassification: runClassification,
    _references: [...refs].sort((a, b) => a - b),
    _parentRef: parentRef,
    _markers: markers,
    _comments: iss.comments,
    _multipleTypeLabels: typeLabels.length > 1 ? typeLabels : null,
    _multipleComputeLabels: computeLabels.length > 1 ? computeLabels : null,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Fetching issues from ${REPO}...`);
  const issues = gh<GhIssue[]>([
    'issue',
    'list',
    '--repo',
    REPO,
    '--state',
    'all',
    '--limit',
    '500',
    '--json',
    'number,title,body,state,labels,createdAt,updatedAt,projectItems,comments,author',
  ]);
  console.log(`  Got ${issues.length} issues`);

  // gh issue list returns each projectItem with the project's status field as `status`.
  // Some issues are on no project (projectItems = [] → column = null → unboarded fallback).

  const rows = issues.map(buildRow);

  // ─── Report ──────────────────────────────────────────────────────────────

  const byStatus = new Map<string, number>();
  const byColumn = new Map<string, number>();
  const byKind = new Map<string, number>();
  let unboarded = 0;
  let unboardedFallback = 0;
  let unboardedDefault = 0;
  let followupsTotal = 0;
  let followupsOrphan = 0;
  let multiTypeIssues: number[] = [];
  let multiComputeIssues: number[] = [];
  let cleanResultRuns = 0;
  let totalMarkers = 0;
  let totalRefs = 0;

  const numbers = new Set(rows.map((r) => r.number));
  let unknownRefs = 0;

  for (const r of rows) {
    byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
    byColumn.set(r._sourceColumn ?? '(none)', (byColumn.get(r._sourceColumn ?? '(none)') ?? 0) + 1);
    byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + 1);
    if (r._sourceColumn === null) {
      unboarded++;
      if (r._statusSource === 'label-fallback') unboardedFallback++;
      else if (r._statusSource === 'default-proposed') unboardedDefault++;
    }
    if (r._parentRef) {
      followupsTotal++;
      if (!numbers.has(r._parentRef)) followupsOrphan++;
    }
    if (r._multipleTypeLabels) multiTypeIssues.push(r.number);
    if (r._multipleComputeLabels) multiComputeIssues.push(r.number);
    if (r._runClassification) cleanResultRuns++;
    totalMarkers += r._markers.length;
    totalRefs += r._references.length;
    for (const ref of r._references) if (!numbers.has(ref)) unknownRefs++;
  }

  const fmt = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `    ${String(v).padStart(4)}  ${k}`).join('\n');

  console.log('');
  console.log('━━━ IMPORT DRY-RUN REPORT ━━━');
  console.log(`Total issues:       ${rows.length}`);
  console.log(`Total markers:      ${totalMarkers} (workflow_events rows to write)`);
  console.log(`Total cross-refs:   ${totalRefs} (edges to write; ${unknownRefs} reference unknown issues, dropped)`);
  console.log(`Clean-result runs:  ${cleanResultRuns}`);
  console.log('');
  console.log('By column:');
  console.log(fmt(byColumn));
  console.log('');
  console.log('By final status:');
  console.log(fmt(byStatus));
  console.log('');
  console.log('By kind:');
  console.log(fmt(byKind));
  console.log('');
  console.log(`Unboarded: ${unboarded}  (${unboardedFallback} via label fallback, ${unboardedDefault} defaulted to proposed)`);
  console.log(`Parent edges: ${followupsTotal}  (${followupsOrphan} reference unknown issues, dropped + tagged followup-orphan)`);
  console.log(`Multi-type-label issues: ${multiTypeIssues.length}  ${multiTypeIssues.slice(0, 10).join(', ')}${multiTypeIssues.length > 10 ? ', ...' : ''}`);
  console.log(`Multi-compute-label issues: ${multiComputeIssues.length}  ${multiComputeIssues.slice(0, 10).join(', ')}${multiComputeIssues.length > 10 ? ', ...' : ''}`);
  console.log('');

  // Sample rows (10 spread across status values)
  const sample: ExperimentRow[] = [];
  const seenStatus = new Set<string>();
  for (const r of rows) {
    if (sample.length >= 10) break;
    if (!seenStatus.has(r.status)) {
      sample.push(r);
      seenStatus.add(r.status);
    }
  }
  console.log('Sample rows (one per status, up to 10):');
  for (const r of sample) {
    const parent = r._parentRef ? ` parent=#${r._parentRef}` : '';
    const cleanr = r._runClassification ? ` cleanr=${r._runClassification}` : '';
    console.log(
      `  #${r.number}  status=${r.status}  kind=${r.kind}  col="${r._sourceColumn}"  source=${r._statusSource}` +
        `  markers=${r._markers.length}  refs=${r._references.length}${parent}${cleanr}`,
    );
    console.log(`        title: ${r.title.slice(0, 100)}`);
  }
  console.log('');

  const dumpPath = '/tmp/eps-import-preview.json';
  writeFileSync(
    dumpPath,
    JSON.stringify(
      rows.map((r) => ({
        number: r.number,
        title: r.title,
        status: r.status,
        kind: r.kind,
        computeSize: r.computeSize,
        priority: r.priority,
        assigneeKind: r.assigneeKind,
        tags: r.tags,
        hasCleanResult: r.hasCleanResult,
        sourceColumn: r._sourceColumn,
        statusSource: r._statusSource,
        runClassification: r._runClassification,
        references: r._references,
        parentRef: r._parentRef,
        markerCount: r._markers.length,
        commentCount: r._comments.length,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      null,
      2,
    ),
  );
  console.log(`Full per-issue dump: ${dumpPath}`);

  if (dryRun) {
    console.log('\nDRY RUN — no DB writes performed.');
    return;
  }

  // ─── Apply ────────────────────────────────────────────────────────────────

  const dbUrl = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL_DIRECT not set');
    process.exit(1);
  }
  const sql = postgres(dbUrl, { ssl: 'require', max: 1 });

  console.log('\nApplying to database...');

  // expects empty experiments / runs / workflow_events (after wipe-experiments.sql + migration)

  // Phase A: insert experiments, capture id ← number
  const idByNumber = new Map<number, string>();

  await sql.begin(async (tx) => {
    for (const r of rows) {
      const [{ id }] = await tx`
        INSERT INTO experiments (
          number, legacy_gh_number, title, body, status, kind,
          compute_size, priority, assignee_kind, tags, has_clean_result,
          created_at, updated_at
        ) VALUES (
          ${r.number}, ${r.legacyGhNumber}, ${r.title}, ${r.body}, ${r.status}::experiment_status, ${r.kind}::experiment_kind,
          ${r.computeSize ? sql`${r.computeSize}::compute_size` : null}, ${r.priority}::priority,
          ${r.assigneeKind}::assignee_kind, ${r.tags}, ${r.hasCleanResult},
          ${r.createdAt}, ${r.updatedAt}
        )
        RETURNING id
      `;
      idByNumber.set(r.number, id as string);
    }
    console.log(`  Inserted ${rows.length} experiments`);

    // Phase B: runs (one per experiment with a clean-result classification)
    let runCount = 0;
    for (const r of rows) {
      if (!r._runClassification) continue;
      const expId = idByNumber.get(r.number)!;
      await tx`
        INSERT INTO runs (experiment_id, classification, created_at, updated_at)
        VALUES (${expId}, ${r._runClassification}::run_classification, ${r.createdAt}, ${r.updatedAt})
      `;
      runCount++;
    }
    console.log(`  Inserted ${runCount} runs`);

    // Phase C: workflow_events from marker comments
    let eventCount = 0;
    for (const r of rows) {
      const expId = idByNumber.get(r.number)!;
      for (const m of r._markers) {
        await tx`
          INSERT INTO workflow_events (
            entity_kind, entity_id, event_type, note, metadata, created_at
          ) VALUES (
            'experiment', ${expId}, 'note'::workflow_event_type, ${m.body.slice(0, 4000)},
            ${tx.json({ marker_type: m.marker, author: m.author, legacy_gh_number: r.legacyGhNumber })},
            ${m.at}
          )
        `;
        eventCount++;
      }
    }
    console.log(`  Inserted ${eventCount} workflow_events`);

    // Phase D: comments (non-marker comment bodies preserved)
    let commentCount = 0;
    for (const r of rows) {
      const expId = idByNumber.get(r.number)!;
      for (const c of r._comments) {
        if (c.body.match(MARKER_RE)) continue; // skip markers (already in workflow_events)
        await tx`
          INSERT INTO comments (
            entity_kind, entity_id, author_kind, body, created_at, updated_at
          ) VALUES (
            'experiment', ${expId}, 'human'::comment_author_kind, ${c.body}, ${c.createdAt}, ${c.createdAt}
          )
        `;
        commentCount++;
      }
    }
    console.log(`  Inserted ${commentCount} comments`);

    // Phase E: edges
    let edgeCount = 0;
    let parentEdgeCount = 0;
    for (const r of rows) {
      const expId = idByNumber.get(r.number)!;

      // Cross-refs: derives_from
      for (const ref of r._references) {
        const toId = idByNumber.get(ref);
        if (!toId) continue;
        try {
          await tx`
            INSERT INTO edges (from_kind, from_id, to_kind, to_id, type)
            VALUES ('experiment', ${expId}, 'experiment', ${toId}, 'derives_from'::edge_type)
            ON CONFLICT DO NOTHING
          `;
          edgeCount++;
        } catch (e) {
          // unique constraint may collide if also a parent edge
        }
      }

      // Parent edge for followups
      if (r._parentRef) {
        const parentId = idByNumber.get(r._parentRef);
        if (parentId) {
          await tx`
            INSERT INTO edges (from_kind, from_id, to_kind, to_id, type)
            VALUES ('experiment', ${expId}, 'experiment', ${parentId}, 'parent'::edge_type)
            ON CONFLICT DO NOTHING
          `;
          parentEdgeCount++;
        } else {
          // Orphan: tag the experiment
          await tx`
            UPDATE experiments SET tags = array_append(tags, 'followup-orphan') WHERE id = ${expId}
          `;
        }
      }
    }
    console.log(`  Inserted ${edgeCount} derives_from edges + ${parentEdgeCount} parent edges`);
  });

  await sql.end();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
