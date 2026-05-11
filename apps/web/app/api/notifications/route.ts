import { NextResponse } from 'next/server';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { notifications, notificationPreferences } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  unread: z.coerce.boolean().optional(),
});

const patchSchema = z.object({
  notificationId: z.string().uuid().optional(),
  markAllRead: z.boolean().optional(),
});

export async function GET(req: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const parsed = listQuerySchema.safeParse({
    limit: url.searchParams.get('limit') ?? undefined,
    unread: url.searchParams.get('unread') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_query', detail: z.treeifyError(parsed.error) }, { status: 400 });
  }
  await ensurePreferences(session.user.id);
  const filters = [
    eq(notifications.userId, session.user.id),
    parsed.data.unread ? isNull(notifications.readAt) : undefined,
  ].filter((filter): filter is NonNullable<typeof filter> => Boolean(filter));
  const rows = await db()
    .select()
    .from(notifications)
    .where(and(...filters))
    .orderBy(desc(notifications.createdAt))
    .limit(parsed.data.limit);
  return NextResponse.json({ notifications: rows });
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
  if (!parsed.success || (!parsed.data.notificationId && !parsed.data.markAllRead)) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  const now = new Date();
  if (parsed.data.markAllRead) {
    await db()
      .update(notifications)
      .set({ readAt: now })
      .where(eq(notifications.userId, session.user.id));
    return NextResponse.json({ ok: true });
  }
  await db()
    .update(notifications)
    .set({ readAt: now })
    .where(
      and(
        eq(notifications.id, parsed.data.notificationId!),
        eq(notifications.userId, session.user.id),
      ),
    );
  return NextResponse.json({ ok: true });
}

async function ensurePreferences(userId: string) {
  await db()
    .insert(notificationPreferences)
    .values({ userId })
    .onConflictDoNothing({ target: notificationPreferences.userId });
}
