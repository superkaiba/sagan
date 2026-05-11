import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { jobRuns } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const rows = await db().select().from(jobRuns).where(eq(jobRuns.id, id)).limit(1);
  const job = rows[0];
  if (!job) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ job });
}
