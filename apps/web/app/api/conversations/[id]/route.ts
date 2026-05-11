import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { chatSessions } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';

const updateSchema = z.object({
  archived: z.boolean(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', detail: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const { id } = await ctx.params;
  const rows = await db()
    .update(chatSessions)
    .set({ archivedAt: parsed.data.archived ? new Date() : null })
    .where(eq(chatSessions.id, id))
    .returning({
      id: chatSessions.id,
      archivedAt: chatSessions.archivedAt,
    });

  if (!rows[0]) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ session: rows[0] });
}
