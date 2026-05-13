import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { and, desc, eq, inArray, isNull, ne } from 'drizzle-orm';
import { cleanResults, dailyLogEntries, experiments, projectNarratives, projects, todos } from '@sagan/db/schema';
import { requireSession } from '@/lib/auth';
import { appendDailyLogTrailBestEffort } from '@/lib/daily-log-trail';
import { db } from '@/lib/db';

export const maxDuration = 60;

const MODEL = 'claude-haiku-4-5-20251001';

function compact(value: string | null | undefined, limit = 900) {
  if (!value) return '';
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function bulletLines<T>(rows: T[], render: (row: T) => string, empty: string) {
  if (rows.length === 0) return `- ${empty}`;
  return rows.map((row) => `- ${render(row)}`).join('\n');
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'anthropic_not_configured' }, { status: 503 });
  }

  const { id } = await ctx.params;
  const projectRows = await db().select().from(projects).where(eq(projects.id, id)).limit(1);
  const project = projectRows[0];
  if (!project) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const experimentRows = await db()
    .select({
      id: experiments.id,
      number: experiments.number,
      title: experiments.title,
      status: experiments.status,
      hypothesis: experiments.hypothesis,
      updatedAt: experiments.updatedAt,
    })
    .from(experiments)
    .where(eq(experiments.projectId, project.id))
    .orderBy(desc(experiments.updatedAt))
    .limit(80);
  const experimentIds = experimentRows.map((experiment) => experiment.id);

  const [resultRows, directEntries, narrativeRows, projectTodoRows, experimentTodoRows] = await Promise.all([
    experimentIds.length > 0
      ? db()
          .select()
          .from(cleanResults)
          .where(and(inArray(cleanResults.experimentId, experimentIds), ne(cleanResults.status, 'archived')))
          .orderBy(desc(cleanResults.updatedAt))
          .limit(80)
      : [],
    db()
      .select()
      .from(dailyLogEntries)
      .where(and(isNull(dailyLogEntries.archivedAt), eq(dailyLogEntries.entityKind, 'project'), eq(dailyLogEntries.entityId, project.id)))
      .orderBy(desc(dailyLogEntries.createdAt))
      .limit(30),
    db()
      .select({
        id: projectNarratives.id,
        title: projectNarratives.title,
        status: projectNarratives.status,
        bodyMd: projectNarratives.bodyMd,
        updatedAt: projectNarratives.updatedAt,
      })
      .from(projectNarratives)
      .where(and(eq(projectNarratives.projectId, project.id), ne(projectNarratives.status, 'archived')))
      .orderBy(desc(projectNarratives.updatedAt))
      .limit(8),
    db()
      .select({
        text: todos.text,
        status: todos.status,
        priority: todos.priority,
        bodyMd: todos.bodyMd,
        updatedAt: todos.updatedAt,
      })
      .from(todos)
      .where(and(eq(todos.linkedKind, 'project'), eq(todos.linkedId, project.id)))
      .orderBy(desc(todos.updatedAt))
      .limit(50),
    experimentIds.length > 0
      ? db()
          .select({
            text: todos.text,
            status: todos.status,
            priority: todos.priority,
            bodyMd: todos.bodyMd,
            updatedAt: todos.updatedAt,
          })
          .from(todos)
          .where(and(eq(todos.linkedKind, 'experiment'), inArray(todos.linkedId, experimentIds)))
          .orderBy(desc(todos.updatedAt))
          .limit(50)
      : [],
  ]);
  const todoRows = [...projectTodoRows, ...experimentTodoRows]
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 50);

  const cleanResultIds = resultRows.map((result) => result.id);
  const [experimentEntries, resultEntries] = await Promise.all([
    experimentIds.length > 0
      ? db()
          .select()
          .from(dailyLogEntries)
          .where(and(isNull(dailyLogEntries.archivedAt), eq(dailyLogEntries.entityKind, 'experiment'), inArray(dailyLogEntries.entityId, experimentIds)))
          .orderBy(desc(dailyLogEntries.createdAt))
          .limit(50)
      : [],
    cleanResultIds.length > 0
      ? db()
          .select()
          .from(dailyLogEntries)
          .where(and(isNull(dailyLogEntries.archivedAt), eq(dailyLogEntries.entityKind, 'clean_result'), inArray(dailyLogEntries.entityId, cleanResultIds)))
          .orderBy(desc(dailyLogEntries.createdAt))
          .limit(50)
      : [],
  ]);
  const entryRows = [...directEntries, ...experimentEntries, ...resultEntries]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 60);

  const prompt = `You are writing an AI-generated project summary log for Sagan.

Summarize the current project state for a busy research lead. Use only the provided project data. Do not invent evidence.

Project: ${project.title}
Current project summary:
${project.summaryMd?.trim() || '(none)'}

Open / recent experiments:
${bulletLines(
  experimentRows,
  (experiment) => `#${experiment.number} [${experiment.status}] ${experiment.title}: ${compact(experiment.hypothesis, 260)}`,
  'No linked experiments.',
)}

Clean results:
${bulletLines(
  resultRows,
  (result) => `[${result.status}] ${result.title}: ${compact(result.claim, 320)}`,
  'No clean results.',
)}

Daily updates:
${bulletLines(
  entryRows,
  (entry) => `${entry.day} ${entry.kind}: ${compact(entry.bodyMd, 360)}`,
  'No linked daily updates.',
)}

Existing project summaries:
${bulletLines(
  narrativeRows,
  (narrative) => `[${narrative.status}] ${narrative.title}: ${compact(narrative.bodyMd, 360)}`,
  'No summary docs.',
)}

Open tasks / required work:
${bulletLines(
  todoRows,
  (todo) => `[${todo.priority}/${todo.status}] ${todo.text}: ${compact(todo.bodyMd, 220)}`,
  'No linked tasks.',
)}

Write Markdown only, with these sections:
## Current Space
Summarize the active state of the project, what has been learned, and what is still unresolved.

## Required Drive
List the next required decisions/work, grouped by urgency. Keep this practical and action-oriented.

## Recent Changes
Briefly summarize the important changes from daily updates, clean results, and summary docs.

## Watch Items
Call out blockers, fragile assumptions, or stale areas.

Keep it concise: 500-900 words.`;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1600,
    temperature: 0.2,
    messages: [{ role: 'user', content: prompt }],
  });
  const bodyMd = message.content
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n\n')
    .trim();
  if (!bodyMd) return NextResponse.json({ error: 'empty_summary' }, { status: 502 });

  const inserted = await db()
    .insert(projectNarratives)
    .values({
      projectId: project.id,
      title: `AI summary log — ${new Date().toISOString().slice(0, 10)}`,
      bodyMd,
      status: 'draft',
    })
    .returning({ id: projectNarratives.id });
  const narrativeId = inserted[0]!.id;

  await db().insert(dailyLogEntries).values({
    day: new Date().toISOString().slice(0, 10),
    kind: 'note',
    bodyMd: `AI project summary log ready for **${project.title}** — [open the draft](/e/project_narrative/${narrativeId}).`,
    entityKind: 'project_narrative',
    entityId: narrativeId,
  });

  await appendDailyLogTrailBestEffort({
    action: `Generated AI summary log for project ${project.title}`,
    why: 'A user requested a concise AI summary of the current project space and required next work.',
    entityKind: 'project_narrative',
    entityId: narrativeId,
    actorKind: 'user',
    actorUserId: session.user.id,
    correlationId: narrativeId,
    detail: `project=${project.id}; model=${MODEL}`,
  });

  return NextResponse.json({ ok: true, narrativeId, model: MODEL });
}
