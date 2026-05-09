/**
 * Weekly digest cron. Runs Sunday 22:00 server time.
 *
 *   - Aggregates the past 7 days of activity (daily_log_entries, runs marked
 *     'useful', completed agent_runs, new beliefs, new published narratives).
 *   - Calls Claude (anthropic-sdk-typescript) with a digest-drafting prompt.
 *   - Inserts the markdown into weekly_digests with a stable share token.
 */
import Anthropic from '@anthropic-ai/sdk';
import { and, asc, desc, eq, gte, lt, isNull } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import {
  agentRuns,
  beliefs,
  dailyLogEntries,
  experiments,
  projectNarratives,
  projects,
  runs,
  weeklyDigests,
} from '@eps/db/schema';
import { db } from '../db.js';
import { env, requireEnv } from '../env.js';
import { log } from '../log.js';

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Sunday → following Saturday's date in ISO 8601 (i.e. the week starts Sunday). */
function weekStartFor(reference: Date): Date {
  const d = new Date(reference);
  d.setUTCHours(0, 0, 0, 0);
  // weekday in {0..6}, Sunday=0
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - dow);
  return d;
}

interface AggregatedData {
  cleanResults: Array<{ project: string | null; body: string; day: string }>;
  blockers: Array<{ project: string | null; body: string; day: string }>;
  decisions: Array<{ project: string | null; body: string; day: string }>;
  newBeliefs: Array<{ project: string | null; title: string; confidence: string }>;
  publishedNarratives: Array<{ project: string | null; title: string }>;
  experimentsCompleted: Array<{ project: string | null; title: string }>;
  agentRunsCompleted: number;
  usefulRuns: number;
}

async function aggregate(start: Date, end: Date): Promise<AggregatedData> {
  const projectMap = new Map<string, string>();
  const projectsRows = await db().select({ id: projects.id, title: projects.title }).from(projects);
  for (const p of projectsRows) projectMap.set(p.id, p.title);

  const startDay = isoDate(start);
  const endDay = isoDate(end);

  const [logRows, beliefRows, narrativeRows, experimentRows, runRowsAll, agentRunRows] = await Promise.all([
    db()
      .select()
      .from(dailyLogEntries)
      .where(
        and(
          gte(dailyLogEntries.day, startDay),
          lt(dailyLogEntries.day, endDay),
          isNull(dailyLogEntries.archivedAt),
        ),
      )
      .orderBy(asc(dailyLogEntries.day), asc(dailyLogEntries.createdAt)),
    db()
      .select()
      .from(beliefs)
      .where(gte(beliefs.createdAt, start))
      .orderBy(desc(beliefs.createdAt)),
    db()
      .select()
      .from(projectNarratives)
      .where(and(eq(projectNarratives.status, 'published'), gte(projectNarratives.publishedAt, start))),
    db()
      .select()
      .from(experiments)
      .where(and(eq(experiments.status, 'completed'), gte(experiments.updatedAt, start))),
    db()
      .select({ classification: runs.classification, completedAt: runs.completedAt })
      .from(runs)
      .where(gte(runs.updatedAt, start)),
    db()
      .select({ status: agentRuns.status, completedAt: agentRuns.completedAt })
      .from(agentRuns)
      .where(gte(agentRuns.updatedAt, start)),
  ]);

  const cleanResults: AggregatedData['cleanResults'] = [];
  const blockers: AggregatedData['blockers'] = [];
  const decisions: AggregatedData['decisions'] = [];
  for (const e of logRows) {
    const projectTitle = e.entityKind === 'project' && e.entityId ? projectMap.get(e.entityId) ?? null : null;
    const item = { project: projectTitle, body: e.bodyMd, day: e.day };
    if (e.kind === 'clean_result') cleanResults.push(item);
    else if (e.kind === 'blocker') blockers.push(item);
    else if (e.kind === 'decision') decisions.push(item);
  }

  return {
    cleanResults,
    blockers,
    decisions,
    newBeliefs: beliefRows.map((b) => ({
      project: b.projectId ? projectMap.get(b.projectId) ?? null : null,
      title: b.title,
      confidence: b.confidence,
    })),
    publishedNarratives: narrativeRows.map((n) => ({
      project: projectMap.get(n.projectId) ?? null,
      title: n.title,
    })),
    experimentsCompleted: experimentRows.map((e) => ({
      project: e.projectId ? projectMap.get(e.projectId) ?? null : null,
      title: e.title,
    })),
    usefulRuns: runRowsAll.filter((r) => r.classification === 'useful').length,
    agentRunsCompleted: agentRunRows.filter((r) => r.status === 'completed').length,
  };
}

function buildPrompt(start: Date, end: Date, data: AggregatedData): string {
  return `You are drafting a weekly research digest for an academic advisor. The recipient sees only the markdown you produce — be specific, concrete, and concise.

Date range: ${isoDate(start)} → ${isoDate(end)} (week ending Saturday).

Activity summary:
- Clean results: ${data.cleanResults.length}
- Blockers: ${data.blockers.length}
- Decisions: ${data.decisions.length}
- New beliefs / hypotheses: ${data.newBeliefs.length}
- Published project narratives: ${data.publishedNarratives.length}
- Experiments completed: ${data.experimentsCompleted.length}
- Useful runs: ${data.usefulRuns}
- Agent runs completed: ${data.agentRunsCompleted}

Raw data (JSON):
${JSON.stringify(data, null, 2)}

Write a markdown digest with three top-level sections in this order:

## This week
Group by project. For each project, bullet the clean results and decisions. Quote the user's own log text where it adds clarity. If the user worked on something but produced no clean results, note it briefly.

## Next week
Inferred priorities, derived from blockers and pending experiments. If genuinely uncertain, list one or two open questions instead.

## Blockers and asks
Anything from the blockers list, plus any cross-project asks the user might want the advisor to weigh in on. If there are none, write "None."

Constraints:
- Output only markdown. No preamble, no apology, no "here is the digest."
- Be honest about a quiet week if the activity is genuinely sparse — do not invent results.
- Aim for 200–500 words total.`;
}

export async function runWeeklyDigest(refDate?: Date) {
  requireEnv('ANTHROPIC_API_KEY');
  const ref = refDate ?? new Date();
  const weekStart = weekStartFor(ref);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  const weekStartIso = isoDate(weekStart);

  // Idempotency: skip if a digest for this week-start already exists.
  const existing = await db()
    .select()
    .from(weeklyDigests)
    .where(eq(weeklyDigests.weekStart, weekStartIso))
    .limit(1);
  if (existing[0]) {
    log.info('weekly-digest: already exists', { weekStart: weekStartIso, id: existing[0].id });
    return existing[0];
  }

  const data = await aggregate(weekStart, weekEnd);
  const prompt = buildPrompt(weekStart, weekEnd, data);

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const completion = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });
  const bodyMd = completion.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('\n')
    .trim();

  const shareToken = randomBytes(16).toString('base64url');
  const inserted = await db()
    .insert(weeklyDigests)
    .values({
      weekStart: weekStartIso,
      bodyMd,
      shareToken,
    })
    .returning();
  log.info('weekly-digest: drafted', {
    weekStart: weekStartIso,
    id: inserted[0]!.id,
    bytes: bodyMd.length,
  });
  return inserted[0];
}
