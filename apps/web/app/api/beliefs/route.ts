import { NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { z } from 'zod';
import { beliefs } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';

export async function GET() {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const rows = await db().select().from(beliefs).orderBy(desc(beliefs.updatedAt));
  return NextResponse.json({ beliefs: rows });
}

const createSchema = z.object({
  title: z.string().min(1).max(200),
  projectId: z.string().uuid().optional(),
  currentBelief: z.string().max(20_000).optional(),
  topic: z.string().max(120).optional(),
  confidence: z.enum(['LOW', 'MODERATE', 'HIGH']).default('MODERATE'),
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
    .insert(beliefs)
    .values({
      title: parsed.data.title,
      projectId: parsed.data.projectId,
      currentBelief: parsed.data.currentBelief,
      topic: parsed.data.topic,
      confidence: parsed.data.confidence,
      status: 'draft',
    })
    .returning();
  return NextResponse.json({ belief: inserted[0] });
}
