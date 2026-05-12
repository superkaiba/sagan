import { NextResponse } from 'next/server';
import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { projects } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { appendDailyLogTrailBestEffort } from '@/lib/daily-log-trail';
import { createCorrelationId, createJobRun } from '@/lib/job-runs';

export async function GET() {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const rows = await db().select().from(projects).orderBy(desc(projects.updatedAt));
  return NextResponse.json({ projects: rows });
}

const createSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/).optional(),
  summaryMd: z.string().max(20_000).optional(),
});

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || `project-${Date.now()}`;
}

export async function POST(req: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  let slug = parsed.data.slug ?? slugify(parsed.data.title);
  // Ensure slug uniqueness with a numeric suffix.
  for (let i = 1; i < 50; i++) {
    const dup = await db().select({ id: projects.id }).from(projects).where(eq(projects.slug, slug)).limit(1);
    if (dup.length === 0) break;
    slug = `${slug}-${i}`;
  }
  const inserted = await db()
    .insert(projects)
    .values({
      slug,
      title: parsed.data.title,
      summaryMd: parsed.data.summaryMd,
      status: 'active',
    })
    .returning();
  const project = inserted[0]!;
  await appendDailyLogTrailBestEffort({
    action: `Created project ${project.title}`,
    why: 'A user created a new research project to organize related work.',
    entityKind: 'project',
    entityId: project.id,
    detail: `slug=${project.slug}`,
    actorKind: 'user',
    actorUserId: session.user.id,
    correlationId: project.id,
  });
  // Auto-enqueue a deep-research lit review for the new project. The runner
  // subscribes to NOTIFY('project_lit_review_run') and writes the result back
  // as a draft project_narratives row plus a daily_log_entries note.
  try {
    const correlationId = createCorrelationId('project_lit_review');
    const job = await createJobRun({
      kind: 'project_lit_review',
      requestedBy: session.user.id,
      requestPayload: {
        projectId: project.id,
        title: project.title,
        summaryMd: project.summaryMd ?? null,
        correlationId,
      },
    });
    await db().execute(sql`SELECT pg_notify('project_lit_review_run', ${job.id})`);
  } catch (err) {
    // Don't block project creation if enqueueing fails.
    console.error('[projects] failed to enqueue project_lit_review', err);
  }
  return NextResponse.json({ project: inserted[0] });
}
