import { NextResponse } from 'next/server';
import { desc, ne } from 'drizzle-orm';
import { z } from 'zod';
import { todos } from '@eps/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';

export async function GET() {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const rows = await db()
    .select()
    .from(todos)
    .where(ne(todos.status, 'archived'))
    .orderBy(desc(todos.updatedAt))
    .limit(500);
  return NextResponse.json({ todos: rows });
}

const createSchema = z.object({
  text: z.string().min(1).max(500),
  status: z
    .enum([
      'inbox',
      'scoped',
      'planning',
      'open',
      'in_progress',
      'running',
      'interpreting',
      'awaiting_promotion',
      'blocked',
      'done',
      'cancelled',
      'archived',
    ])
    .default('inbox'),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
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
    .insert(todos)
    .values(parsed.data)
    .returning();
  return NextResponse.json({ todo: inserted[0] });
}
