import { desc } from 'drizzle-orm';
import { Lightbulb, Route, Send } from 'lucide-react';
import { ideaCards, ideaSessions } from '@sagan/db/schema';
import { EmptyState, ListRow, MetricTile, PageHeader, Panel, StatusBadge } from '@/components/ui';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function IdeationPage() {
  const [sessions, cards] = await Promise.all([
    db().select().from(ideaSessions).orderBy(desc(ideaSessions.updatedAt)).limit(100),
    db()
      .select({
        id: ideaCards.id,
        sessionId: ideaCards.sessionId,
        title: ideaCards.title,
        state: ideaCards.state,
        promotedKind: ideaCards.promotedKind,
        promotedId: ideaCards.promotedId,
        updatedAt: ideaCards.updatedAt,
      })
      .from(ideaCards)
      .orderBy(desc(ideaCards.updatedAt))
      .limit(300),
  ]);

  const cardCountBySession = new Map<string, number>();
  const promotedCountBySession = new Map<string, number>();
  for (const card of cards) {
    cardCountBySession.set(card.sessionId, (cardCountBySession.get(card.sessionId) ?? 0) + 1);
    if (card.promotedKind && card.promotedId) {
      promotedCountBySession.set(card.sessionId, (promotedCountBySession.get(card.sessionId) ?? 0) + 1);
    }
  }

  const promotedCount = cards.filter((card) => card.promotedKind && card.promotedId).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ideation"
        description="Idea sessions, prompt decks, generated cards, and promoted follow-up work."
        meta={`${sessions.length} sessions`}
      />

      <section className="grid gap-3 md:grid-cols-3">
        <MetricTile label="Idea cards" value={cards.length} icon={<Lightbulb className="h-4 w-4" aria-hidden="true" />} />
        <MetricTile label="Promoted" value={promotedCount} tone={promotedCount > 0 ? 'success' : 'neutral'} icon={<Send className="h-4 w-4" aria-hidden="true" />} />
        <MetricTile label="Active sessions" value={sessions.filter((session) => session.status === 'active').length} />
      </section>

      {sessions.length === 0 ? (
        <EmptyState
          icon={<Lightbulb className="h-5 w-5" aria-hidden="true" />}
          title="No ideation sessions"
          message="Start ideation from a project, belief, literature item, or clean result."
        />
      ) : (
        <Panel className="overflow-hidden">
          <div className="divide-y divide-[--color-border]">
            {sessions.map((session) => {
              const cardCount = cardCountBySession.get(session.id) ?? 0;
              const sessionPromotedCount = promotedCountBySession.get(session.id) ?? 0;
              return (
                <ListRow
                  key={session.id}
                  href={`/ideation/${session.id}`}
                  leading={<Route className="h-4 w-4" aria-hidden="true" />}
                  title={session.title}
                  detail={`${session.sourceKind} ${session.sourceId.slice(0, 8)} · ${cardCount} cards · ${sessionPromotedCount} promoted`}
                  meta={
                    <span className="inline-flex items-center gap-2">
                      <StatusBadge status={session.status} />
                      <span>{session.updatedAt.toISOString().slice(0, 10)}</span>
                    </span>
                  }
                />
              );
            })}
          </div>
        </Panel>
      )}
    </div>
  );
}
