import { NextResponse } from 'next/server';
import { z } from 'zod';
import { projectNarratives } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { appendDailyLogTrailBestEffort } from '@/lib/daily-log-trail';

const createSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(200),
  bodyMd: z.string().max(200_000).optional(),
});

export async function POST(req: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  const inserted = await db()
    .insert(projectNarratives)
    .values({
      projectId: parsed.data.projectId,
      title: parsed.data.title,
      bodyMd: parsed.data.bodyMd ?? '',
      status: 'draft',
    })
    .returning();
  const narrative = inserted[0]!;
  await appendDailyLogTrailBestEffort({
    action: `Created project narrative ${narrative.title}`,
    why: 'A user started a running project summary for mentor/project review.',
    entityKind: 'project',
    entityId: narrative.projectId,
    detail: `narrative=${narrative.id}`,
    actorKind: 'user',
    actorUserId: session.user.id,
    correlationId: narrative.id,
  });
  return NextResponse.json({ narrative: inserted[0] });
}
