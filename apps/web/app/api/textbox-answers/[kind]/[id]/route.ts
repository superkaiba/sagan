import { NextResponse } from 'next/server';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { workflowEvents } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireOwner } from '@/lib/access';

/**
 * Persistent storage for inline `[TEXTBOX]` answers the owner fills in on
 * plan and clarification panels. Stored as `epm:textbox-answers` rows in
 * workflow_events — no schema migration, and the run-by-run audit trail is
 * preserved. The latest event wins on read.
 *
 * Path: `/api/textbox-answers/<entityKind>/<entityId>`
 *   GET   → { answers: Record<string, string> }
 *   PATCH → { source: 'plan' | 'clarification', answers: Record<string, string> }
 */

const KNOWN_ENTITY_KINDS = new Set(['experiment', 'todo']);

const patchSchema = z.object({
  source: z.enum(['plan', 'clarification']).default('plan'),
  answers: z.record(z.string().min(1).max(120), z.string().max(20_000)),
});

export async function GET(_req: Request, ctx: { params: Promise<{ kind: string; id: string }> }) {
  try {
    await requireOwner();
  } catch {
    return NextResponse.json({ error: 'owner_required' }, { status: 403 });
  }
  const { kind, id } = await ctx.params;
  if (!KNOWN_ENTITY_KINDS.has(kind)) {
    return NextResponse.json({ error: 'unsupported_entity_kind' }, { status: 400 });
  }
  const rows = await db()
    .select({ metadata: workflowEvents.metadata })
    .from(workflowEvents)
    .where(
      and(
        eq(workflowEvents.entityKind, kind as 'experiment' | 'todo'),
        eq(workflowEvents.entityId, id),
        sql`${workflowEvents.metadata}->>'marker_type' = 'epm:textbox-answers'`,
      ),
    )
    .orderBy(desc(workflowEvents.createdAt))
    .limit(1);
  const meta = rows[0]?.metadata as { answers?: Record<string, string> } | undefined;
  return NextResponse.json({ answers: meta?.answers ?? {} });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ kind: string; id: string }> }) {
  let session;
  try {
    session = await requireOwner();
  } catch {
    return NextResponse.json({ error: 'owner_required' }, { status: 403 });
  }
  const { kind, id } = await ctx.params;
  if (!KNOWN_ENTITY_KINDS.has(kind)) {
    return NextResponse.json({ error: 'unsupported_entity_kind' }, { status: 400 });
  }
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', detail: z.treeifyError(parsed.error) }, { status: 400 });
  }
  await db().insert(workflowEvents).values({
    entityKind: kind as 'experiment' | 'todo',
    entityId: id,
    eventType: 'note',
    actorKind: 'user',
    actorUserId: session.user.id,
    note: `Updated textbox answers (${parsed.data.source}).`,
    metadata: {
      marker_type: 'epm:textbox-answers',
      source: parsed.data.source,
      answers: parsed.data.answers,
    },
  });
  return NextResponse.json({ ok: true, answers: parsed.data.answers });
}
