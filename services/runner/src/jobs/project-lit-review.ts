/**
 * Per-project deep literature review.
 *
 * Triggered when a new project is created (NOTIFY('project_lit_review_run',
 * <jobRunId>) from POST /api/projects). The job:
 *   1. Reads the project_lit_review job_runs row's request_payload to get
 *      { projectId, title, summaryMd }.
 *   2. Runs Claude Code SDK with WebSearch + WebFetch + Bash to produce a
 *      deep-research markdown report covering related work, gap analysis,
 *      and concrete next-step experiments.
 *   3. Writes the report into a new project_narratives row (status='draft').
 *   4. Appends a daily_log_entries note pointing at the draft so the Today
 *      view surfaces it for review.
 */
import { eq } from 'drizzle-orm';
import { type Options } from '@anthropic-ai/claude-agent-sdk';
import { dailyLogEntries, jobRuns, projectNarratives, projects } from '@sagan/db/schema';
import { db } from '../db.js';
import { env, requireEnv } from '../env.js';
import { log } from '../log.js';
import { recordTrail } from '../trail.js';
import { lastAssistantTextFromMessage, runAgentWithContinuation } from '../lib/run-agent.js';
import type { JobContext, JobOutcome } from './job-runs.js';

const CLAUDE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes — deep research can take a while.

interface RequestPayload {
  projectId?: string;
  title?: string;
  summaryMd?: string | null;
  correlationId?: string;
}

export async function runProjectLitReview(context: JobContext = {}): Promise<JobOutcome> {
  requireEnv('ANTHROPIC_API_KEY');

  const jobRunId = context.jobRunId;
  if (!jobRunId) {
    return { status: 'skipped', resultPayload: { reason: 'no_job_run_id' } };
  }

  const jobRow = await db()
    .select({ requestPayload: jobRuns.requestPayload })
    .from(jobRuns)
    .where(eq(jobRuns.id, jobRunId))
    .limit(1);
  const payload = (jobRow[0]?.requestPayload ?? null) as RequestPayload | null;
  const projectId = payload?.projectId;
  if (!projectId) {
    return { status: 'failed', lastError: 'missing projectId in request_payload' };
  }

  const projectRow = await db()
    .select({ id: projects.id, title: projects.title, summaryMd: projects.summaryMd })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  const project = projectRow[0];
  if (!project) {
    return { status: 'failed', lastError: `project ${projectId} not found` };
  }

  const prompt = buildPrompt(project.title, project.summaryMd);
  const reportMd = await runDeepResearch(prompt);
  if (!reportMd) {
    return { status: 'failed', lastError: 'empty report from Claude SDK' };
  }

  const narrativeInsert = await db()
    .insert(projectNarratives)
    .values({
      projectId,
      title: 'Literature review (auto)',
      bodyMd: reportMd,
      status: 'draft',
    })
    .returning({ id: projectNarratives.id });
  const narrativeId = narrativeInsert[0]!.id;

  const today = new Date().toISOString().slice(0, 10);
  await db()
    .insert(dailyLogEntries)
    .values({
      day: today,
      kind: 'note',
      bodyMd: `Literature review draft ready for **${project.title}** — [open the draft](/e/project_narrative/${narrativeId}) to review.`,
      entityKind: 'project_narrative',
      entityId: narrativeId,
    });

  await recordTrail({
    action: `Generated literature review for project ${project.title}`,
    why: 'A new project was created and the auto lit-review job produced a draft narrative for the user to review.',
    jobRunId,
    entityKind: 'project_narrative',
    entityId: narrativeId,
    detail: `project=${projectId}; chars=${reportMd.length}`,
  });

  return {
    status: 'completed',
    resultPayload: { projectId, narrativeId, chars: reportMd.length },
  };
}

function buildPrompt(title: string, summaryMd: string | null): string {
  const summaryBlock = summaryMd?.trim()
    ? `\n\nProject summary:\n${summaryMd.trim()}\n`
    : '';
  return `You are running Sagan's per-project deep literature review.

A new research project was just created in the dashboard:

Project title: ${title}${summaryBlock}

Do a deep-research literature review for this project. Use WebSearch and WebFetch
(and Bash with curl if needed) aggressively; prefer arXiv, NeurIPS / ICML / ICLR /
COLM / ACL, and well-known interpretability/safety lab pages and blogs from 2023
onward. Do not invent citations.

Structure the output as Markdown with the following sections:

1. **TL;DR** — 3–5 lines, where this idea stands and what (if anything) already exists.
2. **Clusters of related work** — 3–6 clusters relevant to the project topic. For
   each cluster: 3–8 papers/posts (title, authors, year, venue, 1–2 sentence
   summary, one sentence on how it relates to the project), followed by a 2–3
   sentence synthesis of where the cluster stands.
3. **Closest prior art** — the 3 papers/posts most directly attempting the same
   thing. Be honest if something already exists that largely solves it.
4. **Gap analysis** — what is *not* covered by existing work, with specific framings.
5. **Concrete next-step experiments** — 4–6 experiments the user could actually
   run, each with: hypothesis, setup in 2–3 lines, what success looks like, and
   the cheapest informative version.

Inline-link to arXiv / paper pages where possible. Aim for ~1500–2500 words of
substantive content. Do not start with sycophantic preamble. Do not write any
files to disk. Output only the Markdown report — nothing else, no preamble,
no postscript. The final assistant message must be the report itself.`;
}

async function runDeepResearch(prompt: string): Promise<string> {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), CLAUDE_TIMEOUT_MS);
  const options: Options = {
    cwd: '/tmp',
    env: process.env as Record<string, string>,
    pathToClaudeCodeExecutable: env.CLAUDE_CLI_PATH,
    abortController,
    permissionMode: 'dontAsk',
    tools: ['Bash', 'WebSearch', 'WebFetch'],
    allowedTools: ['Bash', 'WebSearch', 'WebFetch'],
    disallowedTools: ['Read', 'Grep', 'Glob', 'Edit', 'Write'],
    mcpServers: {},
    strictMcpConfig: true,
    settingSources: [],
    model: 'claude-sonnet-4-6',
    persistSession: false,
  };

  try {
    let lastAssistantText = '';
    for await (const message of runAgentWithContinuation({
      initialPrompt: prompt,
      options,
      jobTag: 'project-lit-review',
    })) {
      const t = lastAssistantTextFromMessage(message);
      if (t) lastAssistantText = t;
      if (message.type === 'result' && message.subtype !== 'success') {
        throw new Error(`Claude project lit-review failed: ${message.subtype}`);
      }
    }
    if (!lastAssistantText) {
      throw new Error('Claude project lit-review ended without any assistant text');
    }
    return lastAssistantText;
  } catch (err) {
    if (abortController.signal.aborted) {
      throw new Error(`Claude project lit-review timed out after ${CLAUDE_TIMEOUT_MS / 1000}s`);
    }
    log.error('project-lit-review: SDK error', { err: String(err) });
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
