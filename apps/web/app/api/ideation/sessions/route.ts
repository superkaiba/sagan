import { NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { z } from 'zod';
import { ideaSessions } from '@sagan/db/schema';
import { requireOwner } from '@/lib/access';
import { db } from '@/lib/db';
import { buildPromptDeck, IDEATION_SOURCE_KINDS, loadIdeationSource } from '@/lib/ideation';

const createSchema = z.object({
  sourceKind: z.enum(IDEATION_SOURCE_KINDS),
  sourceId: z.string().uuid(),
  title: z.string().max(300).optional(),
});

export async function GET() {
  try {
    await requireOwner();
  } catch {
    return NextResponse.json({ error: 'owner_required' }, { status: 403 });
  }
  const rows = await db()
    .select()
    .from(ideaSessions)
    .orderBy(desc(ideaSessions.updatedAt))
    .limit(100);
  return NextResponse.json({ sessions: rows });
}

export async function POST(req: Request) {
  let session;
  try {
    session = await requireOwner();
  } catch {
    return NextResponse.json({ error: 'owner_required' }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', detail: z.treeifyError(parsed.error) }, { status: 400 });
  }
  const source = await loadIdeationSource(parsed.data.sourceKind, parsed.data.sourceId);
  if (!source) return NextResponse.json({ error: 'source_not_found' }, { status: 404 });
  const promptDeck = await buildPromptDeck(source);
  const inserted = await db()
    .insert(ideaSessions)
    .values({
      title: parsed.data.title?.trim() || `Ideate from ${source.title}`,
      sourceKind: source.kind,
      sourceId: source.id,
      promptDeck,
      createdBy: session.user.id,
    })
    .returning();
  return NextResponse.json({ session: inserted[0] });
}
