import { NextResponse } from 'next/server';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { dailyLogEntries } from '@eps/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';

const todayIso = () => new Date().toISOString().slice(0, 10);

export async function GET(req: Request) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const day = url.searchParams.get('day') ?? todayIso();
  const rows = await db()
    .select()
    .from(dailyLogEntries)
    .where(and(eq(dailyLogEntries.day, day), isNull(dailyLogEntries.archivedAt)))
    .orderBy(asc(dailyLogEntries.position), asc(dailyLogEntries.createdAt));
  return NextResponse.json({ day, entries: rows });
}

const createSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  kind: z.enum(['clean_result', 'blocker', 'decision', 'note']),
  bodyMd: z.string().min(1).max(20_000),
  entityKind: z.enum(['project', 'belief', 'experiment', 'run', 'todo', 'lit_item', 'project_narrative']).optional(),
  entityId: z.string().uuid().optional(),
});

export async function POST(req: Request) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  const inserted = await db()
    .insert(dailyLogEntries)
    .values({
      day: parsed.data.day ?? todayIso(),
      kind: parsed.data.kind,
      bodyMd: parsed.data.bodyMd,
      entityKind: parsed.data.entityKind,
      entityId: parsed.data.entityId,
    })
    .returning();
  return NextResponse.json({ entry: inserted[0] });
}
