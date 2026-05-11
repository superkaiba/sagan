import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { notificationPreferences } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';

const patchSchema = z.object({
  emailComments: z.boolean().optional(),
  emailMentions: z.boolean().optional(),
  emailClaudeReplies: z.boolean().optional(),
});

export async function GET() {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const preference = await ensurePreferences(session.user.id);
  return NextResponse.json({ preferences: preference });
}

export async function PATCH(req: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', detail: z.treeifyError(parsed.error) }, { status: 400 });
  }
  await ensurePreferences(session.user.id);
  const rows = await db()
    .update(notificationPreferences)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(notificationPreferences.userId, session.user.id))
    .returning();
  return NextResponse.json({ preferences: rows[0] });
}

async function ensurePreferences(userId: string) {
  await db()
    .insert(notificationPreferences)
    .values({ userId })
    .onConflictDoNothing({ target: notificationPreferences.userId });
  const rows = await db()
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);
  return rows[0]!;
}
