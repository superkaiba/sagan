import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { experiments, ideaCards, todos } from '@sagan/db/schema';
import { requireOwner } from '@/lib/access';
import { appendDailyLogTrailBestEffort } from '@/lib/daily-log-trail';
import { db } from '@/lib/db';
import { PROMOTION_KINDS, promotionTargetKind, promotionTodoText } from '@/lib/ideation';
import { appendWorkflowEvent, experimentTurn } from '@/lib/workflow';

const promoteSchema = z.object({
  target: z.enum(PROMOTION_KINDS),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireOwner();
  } catch {
    return NextResponse.json({ error: 'owner_required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = promoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', detail: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const rows = await db().select().from(ideaCards).where(eq(ideaCards.id, id)).limit(1);
  const card = rows[0];
  if (!card) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (card.state === 'promoted' && card.promotedKind && card.promotedId) {
    return NextResponse.json(
      { error: 'already_promoted', promotedKind: card.promotedKind, promotedId: card.promotedId },
      { status: 409 },
    );
  }

  let promotedKind = promotionTargetKind(parsed.data.target);
  let promotedId: string;
  if (parsed.data.target === 'experiment') {
    const inserted = await db()
      .insert(experiments)
      .values({
        title: card.title.slice(0, 300),
        hypothesis: card.bodyMd,
        status: 'proposed',
        planJson: {
          createdFrom: 'idea_card',
          ideaCardId: card.id,
          ideationSessionId: card.sessionId,
        },
      })
      .returning();
    const experiment = inserted[0]!;
    promotedId = experiment.id;
    await appendWorkflowEvent({
      entityKind: 'experiment',
      entityId: experiment.id,
      eventType: 'created',
      toStatus: experiment.status,
      actorKind: 'user',
      actorUserId: session.user.id,
      note: 'Experiment proposal promoted from an ideation card.',
      metadata: { ideaCardId: card.id, ideationSessionId: card.sessionId, turn: experimentTurn(experiment.status) },
    });
  } else {
    const target = parsed.data.target;
    const inserted = await db()
      .insert(todos)
      .values({
        text: promotionTodoText(target, card.title).slice(0, 500),
        bodyMd: card.bodyMd,
        status: 'inbox',
        intentMode: target === 'literature_task' ? 'exploratory' : target === 'belief_update' ? 'hypothesis' : 'measurement',
        priority: 'normal',
        linkedKind: card.sourceKind,
        linkedId: card.sourceId,
        ownerNote: `Promoted from ideation card ${card.id}`,
      })
      .returning();
    promotedId = inserted[0]!.id;
    promotedKind = 'todo';
  }

  await db()
    .update(ideaCards)
    .set({
      state: 'promoted',
      promotionKind: parsed.data.target,
      promotedKind,
      promotedId,
      updatedAt: new Date(),
    })
    .where(eq(ideaCards.id, card.id));

  await appendDailyLogTrailBestEffort({
    action: `Promoted idea ${card.title.slice(0, 80)}`,
    why: `A user promoted an ideation card to ${parsed.data.target}.`,
    entityKind: promotedKind,
    entityId: promotedId,
    detail: card.bodyMd.slice(0, 500),
    actorKind: 'user',
    actorUserId: session.user.id,
    correlationId: card.id,
  });

  return NextResponse.json({ ok: true, promotedKind, promotedId });
}
