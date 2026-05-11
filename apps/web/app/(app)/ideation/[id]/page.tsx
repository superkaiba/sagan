import Link from 'next/link';
import { notFound } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { ideaCards, ideaSessions } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { isIdeationSourceKind, loadIdeationSource } from '@/lib/ideation';
import { IdeationWorkspace } from './IdeationWorkspace';

export const dynamic = 'force-dynamic';

export default async function IdeationSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await db().select().from(ideaSessions).where(eq(ideaSessions.id, id)).limit(1);
  const session = rows[0];
  if (!session || !isIdeationSourceKind(session.sourceKind)) return notFound();
  const [cards, source] = await Promise.all([
    db()
      .select()
      .from(ideaCards)
      .where(eq(ideaCards.sessionId, id))
      .orderBy(desc(ideaCards.createdAt)),
    loadIdeationSource(session.sourceKind, session.sourceId),
  ]);
  if (!source) return notFound();
  const promptDeck = Array.isArray(session.promptDeck)
    ? session.promptDeck.filter((prompt): prompt is string => typeof prompt === 'string')
    : [];

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link href="/ideation" className="text-xs text-[--color-muted] hover:text-[--color-fg]">
          ← ideation
        </Link>
        <div className="flex flex-wrap items-baseline gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{session.title}</h1>
          <span className="rounded-full bg-[--color-muted-bg] px-2 py-0.5 text-xs">{session.status}</span>
        </div>
        <p className="text-sm text-[--color-muted]">
          Source: <Link href={`/e/${source.kind}/${source.id}`} className="hover:underline">{source.title}</Link>
        </p>
      </header>

      <IdeationWorkspace
        sessionId={session.id}
        initialNotes={session.notesMd ?? ''}
        promptDeck={promptDeck}
        cards={cards.map((card) => ({
          id: card.id,
          title: card.title,
          bodyMd: card.bodyMd,
          state: card.state,
          promotionKind: card.promotionKind,
          promotedKind: card.promotedKind,
          promotedId: card.promotedId,
        }))}
      />
    </div>
  );
}
