/**
 * Import selected GitHub Project items from explore-persona-space into native
 * Sagan entities so the dashboard can preview the migrated workflow.
 *
 * Run from the repo root with:
 *
 *   GH_TOKEN="$(gh auth token)" pnpm --filter @sagan/runner import-github-project
 */
import '../src/env.js';
import { createHash } from 'node:crypto';
import postgres from 'postgres';

const OWNER = process.env.GITHUB_PROJECT_OWNER ?? 'superkaiba';
const REPO = process.env.GITHUB_PROJECT_REPO ?? 'superkaiba/explore-persona-space';
const PROJECT_NUMBER = Number(process.env.GITHUB_PROJECT_NUMBER ?? '1');
const PROJECT_SLUG = 'explore-persona-space';
const PROJECT_TITLE = 'Explore Persona Space';
const SELECTED_STATUSES = new Set(['To do', 'In flight', 'Awaiting promotion', 'Useful', 'Not useful']);
const IMPORT_SOURCE = 'github-project-import';
const BODY_LIMIT = 12_000;
const NAMESPACE = '9ceffb49-9f7c-4f9a-96f7-ecc6f8f7b7d2';

type IssueItem = {
  number: number;
  title: string;
  url: string;
  state: string;
  createdAt: string;
  updatedAt: string;
  body: string;
  labels: string[];
  assignees: string[];
  statusName: string;
};

type ProjectPage = {
  data?: {
    user?: {
      projectV2?: {
        title: string;
        url: string;
        items: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: Array<{
            content?: {
              __typename?: string;
              number?: number;
              title?: string;
              url?: string;
              state?: string;
              createdAt?: string;
              updatedAt?: string;
              body?: string;
              labels?: { nodes?: Array<{ name?: string }> };
              assignees?: { nodes?: Array<{ login?: string }> };
            } | null;
            fieldValues?: {
              nodes?: Array<
                | {
                    __typename?: 'ProjectV2ItemFieldSingleSelectValue';
                    name?: string;
                    field?: { name?: string };
                  }
                | { __typename?: string; field?: { name?: string } }
              >;
            };
          }>;
        };
      } | null;
    } | null;
  };
  errors?: Array<{ message: string }>;
};
type ProjectItemNode = NonNullable<
  NonNullable<NonNullable<ProjectPage['data']>['user']>['projectV2']
>['items']['nodes'][number];

function token() {
  const value = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (!value) throw new Error('Set GITHUB_TOKEN or GH_TOKEN before running the import.');
  return value;
}

async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token()}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'user-agent': 'sagan-github-project-import',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GitHub GraphQL ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as T;
  const errors = (json as ProjectPage).errors;
  if (errors?.length) throw new Error(errors.map((e) => e.message).join('; '));
  return json;
}

function fieldStatus(node: ProjectItemNode) {
  for (const value of node.fieldValues?.nodes ?? []) {
    if (value.__typename === 'ProjectV2ItemFieldSingleSelectValue' && value.field?.name === 'Status') {
      return value.name ?? null;
    }
  }
  return null;
}

async function loadIssues() {
  const query = `
    query ProjectIssues($owner: String!, $number: Int!, $after: String) {
      user(login: $owner) {
        projectV2(number: $number) {
          title
          url
          items(first: 100, after: $after) {
            pageInfo { hasNextPage endCursor }
            nodes {
              content {
                __typename
                ... on Issue {
                  number
                  title
                  url
                  state
                  createdAt
                  updatedAt
                  body
                  labels(first: 20) { nodes { name } }
                  assignees(first: 10) { nodes { login } }
                }
              }
              fieldValues(first: 20) {
                nodes {
                  __typename
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    name
                    field { ... on ProjectV2FieldCommon { name } }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const issues: IssueItem[] = [];
  let after: string | null = null;
  for (;;) {
    const page = await graphql<ProjectPage>(query, { owner: OWNER, number: PROJECT_NUMBER, after });
    const project = page.data?.user?.projectV2;
    if (!project) throw new Error(`Project ${OWNER}/${PROJECT_NUMBER} not found.`);
    for (const node of project.items.nodes) {
      const content = node.content;
      if (content?.__typename !== 'Issue') continue;
      const statusName = fieldStatus(node);
      if (!statusName || !SELECTED_STATUSES.has(statusName)) continue;
      if (!content.number || !content.title || !content.url) continue;
      if (!content.url.includes(`/${REPO}/issues/`)) continue;
      issues.push({
        number: content.number,
        title: content.title,
        url: content.url,
        state: content.state ?? 'OPEN',
        createdAt: content.createdAt ?? new Date().toISOString(),
        updatedAt: content.updatedAt ?? new Date().toISOString(),
        body: content.body ?? '',
        labels: (content.labels?.nodes ?? []).map((label) => label.name).filter((name): name is string => Boolean(name)),
        assignees: (content.assignees?.nodes ?? [])
          .map((assignee) => assignee.login)
          .filter((login): login is string => Boolean(login)),
        statusName,
      });
    }
    if (!project.items.pageInfo.hasNextPage) break;
    after = project.items.pageInfo.endCursor;
  }
  return issues.sort((a, b) => a.number - b.number);
}

function uuidFor(name: string) {
  const ns = NAMESPACE.replace(/-/g, '');
  const bytes = Buffer.concat([Buffer.from(ns, 'hex'), Buffer.from(name)]);
  const hash = createHash('sha1').update(bytes).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function confidenceFromTitle(title: string): 'HIGH' | 'MODERATE' | 'LOW' | null {
  const match = title.match(/\b(HIGH|MODERATE|LOW)\s+confidence\b/i);
  return match ? (match[1].toUpperCase() as 'HIGH' | 'MODERATE' | 'LOW') : null;
}

function experimentStatus(statusName: string) {
  if (statusName === 'To do') return 'proposed';
  if (statusName === 'In flight') return 'running';
  if (statusName === 'Awaiting promotion') return 'awaiting_promotion';
  if (statusName === 'Useful') return 'completed';
  if (statusName === 'Not useful') return 'failed';
  return 'planning';
}

function resultStatus(statusName: string) {
  return statusName === 'Useful' ? 'approved' : 'archived';
}

function issueMarkdown(issue: IssueItem) {
  const trimmed = issue.body.trim();
  const limited =
    trimmed.length > BODY_LIMIT
      ? `${trimmed.slice(0, BODY_LIMIT)}\n\n_Imported body truncated at ${BODY_LIMIT.toLocaleString()} characters. Open the GitHub issue for the full source._`
      : trimmed || '_No GitHub issue body._';
  const labels = issue.labels.length ? issue.labels.join(', ') : 'none';
  const assignees = issue.assignees.length ? issue.assignees.join(', ') : 'none';
  return [
    `Imported from GitHub issue [#${issue.number}](${issue.url}) in \`${REPO}\`.`,
    '',
    `- GitHub Project status: **${issue.statusName}**`,
    `- GitHub issue state: ${issue.state}`,
    `- Labels: ${labels}`,
    `- Assignees: ${assignees}`,
    `- Last updated on GitHub: ${issue.updatedAt}`,
    '',
    '## GitHub issue body',
    '',
    limited,
  ].join('\n');
}

function claimFor(issue: IssueItem) {
  return issue.title.replace(/\s*\((HIGH|MODERATE|LOW)\s+confidence\)\s*$/i, '').trim();
}

async function main() {
  const dbUrl = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL_DIRECT or DATABASE_URL is required.');
  const sql = postgres(dbUrl, { max: 5, prepare: false });
  try {
    const issues = await loadIssues();
    const counts = new Map<string, number>();
    for (const issue of issues) counts.set(issue.statusName, (counts.get(issue.statusName) ?? 0) + 1);
    const ownerRows = await sql<{ id: string }[]>`
      select id from users where role = 'owner' order by created_at asc limit 1
    `;
    const ownerId = ownerRows[0]?.id ?? null;

    const projectRows = await sql<{ id: string }[]>`
      insert into projects (id, slug, title, summary_md, status, public, created_at, updated_at)
      values (
        ${uuidFor(`project:${PROJECT_SLUG}`)},
        ${PROJECT_SLUG},
        ${PROJECT_TITLE},
        ${projectSummary(issues, counts)},
        'active',
        false,
        now(),
        now()
      )
      on conflict (slug) do update set
        title = excluded.title,
        summary_md = excluded.summary_md,
        status = 'active',
        updated_at = now()
      returning id
    `;
    const projectId = projectRows[0]!.id;

    let experimentsUpserted = 0;
    let resultsUpserted = 0;
    let approvalsUpserted = 0;
    for (const issue of issues) {
      const experimentId = uuidFor(`experiment:${REPO}#${issue.number}`);
      const title = `#${issue.number} ${issue.title}`;
      const bodyMd = issueMarkdown(issue);
      const metadata = {
        source: IMPORT_SOURCE,
        repo: REPO,
        issueNumber: issue.number,
        issueUrl: issue.url,
        githubProjectStatus: issue.statusName,
        labels: issue.labels,
        assignees: issue.assignees,
      };

      await sql`
        insert into experiments (
          id, project_id, title, hypothesis, plan_json, status, runpod_account, created_at, updated_at
        )
        values (
          ${experimentId},
          ${projectId},
          ${title},
          ${bodyMd},
          ${sql.json(metadata)},
          ${experimentStatus(issue.statusName)},
          'team',
          ${issue.createdAt},
          ${issue.updatedAt}
        )
        on conflict (id) do update set
          project_id = excluded.project_id,
          title = excluded.title,
          hypothesis = excluded.hypothesis,
          plan_json = excluded.plan_json,
          status = excluded.status,
          updated_at = excluded.updated_at
      `;
      experimentsUpserted += 1;

      await upsertEdge({
        sql,
        fromKind: 'project',
        fromId: projectId,
        toKind: 'experiment',
        toId: experimentId,
        type: 'child',
        note: `Imported GitHub issue #${issue.number}.`,
      });

      if (issue.statusName === 'Awaiting promotion') {
        const approvalId = uuidFor(`approval:${REPO}#${issue.number}`);
        await sql`
          insert into approval_requests (
            id, kind, status, entity_kind, entity_id, experiment_id, requested_by,
            title, body_md, requested_state, metadata, created_at, updated_at
          )
          values (
            ${approvalId},
            'clean_result_promotion',
            'pending',
            'experiment',
            ${experimentId},
            ${experimentId},
            ${ownerId},
            ${`Promote GitHub issue #${issue.number}`},
            ${bodyMd},
            'promote_to_clean_result',
            ${sql.json(metadata)},
            ${issue.updatedAt},
            now()
          )
          on conflict (id) do update set
            status = 'pending',
            entity_id = excluded.entity_id,
            experiment_id = excluded.experiment_id,
            title = excluded.title,
            body_md = excluded.body_md,
            requested_state = excluded.requested_state,
            metadata = excluded.metadata,
            updated_at = now()
        `;
        approvalsUpserted += 1;
      }

      if (issue.statusName === 'Useful' || issue.statusName === 'Not useful') {
        const resultId = uuidFor(`clean-result:${REPO}#${issue.number}`);
        const status = resultStatus(issue.statusName);
        await sql`
          insert into clean_results (
            id, experiment_id, title, claim, body_md, confidence, status, artifact_status,
            approved_by, approved_at, archived_at, created_at, updated_at
          )
          values (
            ${resultId},
            ${experimentId},
            ${title},
            ${claimFor(issue)},
            ${bodyMd},
            ${confidenceFromTitle(issue.title)},
            ${status},
            ${issue.statusName === 'Useful' ? 'imported_github_useful' : 'imported_github_not_useful'},
            ${status === 'approved' ? ownerId : null},
            ${status === 'approved' ? issue.updatedAt : null},
            ${status === 'archived' ? issue.updatedAt : null},
            ${issue.createdAt},
            ${issue.updatedAt}
          )
          on conflict (id) do update set
            experiment_id = excluded.experiment_id,
            title = excluded.title,
            claim = excluded.claim,
            body_md = excluded.body_md,
            confidence = excluded.confidence,
            status = excluded.status,
            artifact_status = excluded.artifact_status,
            approved_by = excluded.approved_by,
            approved_at = excluded.approved_at,
            archived_at = excluded.archived_at,
            updated_at = excluded.updated_at
        `;
        await upsertEdge({
          sql,
          fromKind: 'experiment',
          fromId: experimentId,
          toKind: 'clean_result',
          toId: resultId,
          type: 'produces_evidence_for',
          note: `Imported ${issue.statusName} outcome.`,
        });
        resultsUpserted += 1;
      }
    }

    await sql`
      insert into project_narratives (
        id, project_id, title, body_md, status, generated_from_kind, generated_from_id,
        published_at, created_at, updated_at
      )
      values (
        ${uuidFor(`project-narrative:${PROJECT_SLUG}:github-import`)},
        ${projectId},
        'GitHub Project import preview',
        ${projectSummary(issues, counts)},
        'published',
        'project',
        ${projectId},
        now(),
        now(),
        now()
      )
      on conflict (id) do update set
        project_id = excluded.project_id,
        body_md = excluded.body_md,
        status = 'published',
        published_at = now(),
        updated_at = now()
    `;

    console.log(
      JSON.stringify(
        {
          projectId,
          selectedIssues: issues.length,
          counts: Object.fromEntries(counts),
          experimentsUpserted,
          approvalsUpserted,
          resultsUpserted,
        },
        null,
        2,
      ),
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function projectSummary(issues: IssueItem[], counts: Map<string, number>) {
  const lines = [
    `Imported preview of selected GitHub Project columns from [${REPO}](https://github.com/${REPO}) / [project #${PROJECT_NUMBER}](https://github.com/users/${OWNER}/projects/${PROJECT_NUMBER}).`,
    '',
    'This import uses native Sagan entities:',
    '',
    '- `To do` -> proposed experiments',
    '- `In flight` -> running experiments',
    '- `Awaiting promotion` -> experiments with pending clean-result promotion requests',
    '- `Useful` -> approved clean results linked to completed experiments',
    '- `Not useful` -> archived clean results linked to failed experiments',
    '',
    '## Imported counts',
    '',
    ...Array.from(SELECTED_STATUSES).map((status) => `- ${status}: ${counts.get(status) ?? 0}`),
    '',
    `Total imported issues: ${issues.length}`,
  ];
  return lines.join('\n');
}

async function upsertEdge(input: {
  sql: postgres.Sql;
  fromKind: string;
  fromId: string;
  toKind: string;
  toId: string;
  type: string;
  note: string;
}) {
  const { sql, fromKind, fromId, toKind, toId, type, note } = input;
  await sql`
    insert into edges (from_kind, from_id, to_kind, to_id, type, note)
    values (${fromKind}, ${fromId}, ${toKind}, ${toId}, ${type}, ${note})
    on conflict (from_kind, from_id, to_kind, to_id, type) do update set
      note = excluded.note
  `;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
