import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { jobRunKindSchema, jobRunStatusSchema } from '@sagan/api';
import { jobRuns } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  kind: jobRunKindSchema.optional(),
  status: jobRunStatusSchema.optional(),
});

export async function GET(req: Request) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const parsed = listQuerySchema.safeParse({
    limit: url.searchParams.get('limit') ?? undefined,
    kind: url.searchParams.get('kind') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_query', detail: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const filters = [
    parsed.data.kind ? eq(jobRuns.kind, parsed.data.kind) : undefined,
    parsed.data.status ? eq(jobRuns.status, parsed.data.status) : undefined,
  ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));

  let query = db().select().from(jobRuns).$dynamic();
  if (filters.length) query = query.where(and(...filters));
  const rows = await query.orderBy(desc(jobRuns.createdAt)).limit(parsed.data.limit);
  return NextResponse.json({ jobs: rows });
}
