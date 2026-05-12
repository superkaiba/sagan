'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, useTransition, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import { GripVertical, Loader2 } from 'lucide-react';
import { Panel, StatusBadge } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatRelativeTime } from '@/lib/status';
import type { DashboardPipelineCard, PipelineStageKey } from '@/lib/dashboard';

type PipelineStage = { key: PipelineStageKey; title: string };
type PipelineCardKind = DashboardPipelineCard['kind'];

type AdvanceCard = DashboardPipelineCard & {
  key: string;
};

type AdvanceResponse =
  | {
      ok: true;
      agentRunId?: string;
      message?: string;
      removeKey?: string;
      card?: AdvanceCard;
    }
  | {
      error: string;
      message?: string;
    };

const dropTargets: Record<PipelineCardKind, PipelineStageKey[]> = {
  experiment: ['idea', 'planning', 'approval', 'queued', 'running', 'interpreting', 'review', 'done', 'blocked'],
  clean_result: ['interpreting', 'review', 'done', 'blocked'],
  todo: ['idea', 'planning', 'running', 'interpreting', 'review', 'done', 'blocked'],
  idea: ['planning'],
  automation: ['approval', 'queued', 'running', 'done', 'blocked'],
};

function canDropCard(card: DashboardPipelineCard | null, stage: PipelineStageKey) {
  if (!card || card.stage === stage) return false;
  return dropTargets[card.kind].includes(stage);
}

function stageMessage(kind: PipelineCardKind) {
  if (kind === 'idea') return 'Drop on Planning to promote this idea and queue a plan.';
  return 'Drop to move and trigger the next agent step when this stage has one.';
}

function PipelineCard({
  card,
  pending,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  card: DashboardPipelineCard;
  pending: boolean;
  dragging: boolean;
  onDragStart: (card: DashboardPipelineCard, event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}) {
  const needsOwner = Boolean(card.ownerAction);
  return (
    <article
      draggable={!pending}
      data-clickable="true"
      aria-busy={pending}
      data-owner-attention={needsOwner ? 'true' : 'false'}
      onDragStart={(event) => onDragStart(card, event)}
      onDragEnd={onDragEnd}
      className={cn(
        'group border bg-[--color-panel] p-3 shadow-[var(--shadow-panel)] transition-colors',
        'cursor-grab active:cursor-grabbing hover:bg-[--color-hover]',
        needsOwner
          ? 'border-[3px] border-[--color-attention] bg-[--color-attention-soft] animate-sagan-approval-pulse'
          : 'border border-[--color-border]',
        dragging && 'opacity-45',
        pending && 'cursor-wait opacity-70',
      )}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="mt-0.5 h-4 w-4 text-[--color-muted]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <Link href={card.href} className="block text-sm font-semibold leading-5 hover:text-[--color-accent]">
            <span className="line-clamp-2">{card.title}</span>
          </Link>
          {card.detail ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-[--color-muted]">{card.detail}</p> : null}
        </div>
        {pending ? <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-[--color-muted]" aria-hidden="true" /> : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusBadge status={card.status} tone={card.tone} />
        <span className="text-xs text-[--color-muted]">{formatRelativeTime(card.updatedAt)}</span>
      </div>
      {card.project ? <p className="mt-2 truncate text-xs text-[--color-muted]">{card.project}</p> : null}
    </article>
  );
}

export function PipelineBoard({
  stages,
  cards: initialCards,
}: {
  stages: readonly PipelineStage[];
  cards: DashboardPipelineCard[];
}) {
  const router = useRouter();
  const [cards, setCards] = useState(initialCards);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [dropStage, setDropStage] = useState<PipelineStageKey | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setCards(initialCards);
  }, [initialCards]);

  const draggingCard = useMemo(
    () => cards.find((card) => card.key === draggingKey) ?? null,
    [cards, draggingKey],
  );

  const cardsByStage = useMemo(() => {
    const next = new Map<PipelineStageKey, DashboardPipelineCard[]>();
    for (const stage of stages) next.set(stage.key, []);
    for (const card of cards) {
      const bucket = next.get(card.stage);
      if (bucket) bucket.push(card);
    }
    return next;
  }, [cards, stages]);

  function handleDragStart(card: DashboardPipelineCard, event: DragEvent<HTMLElement>) {
    setDraggingKey(card.key);
    setNotice(stageMessage(card.kind));
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', card.key);
  }

  function handleDragOver(stage: PipelineStageKey, event: DragEvent<HTMLElement>) {
    if (!draggingCard) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = canDropCard(draggingCard, stage) ? 'move' : 'none';
    setDropStage(stage);
  }

  async function handleDrop(stage: PipelineStageKey, event: DragEvent<HTMLElement>) {
    event.preventDefault();
    const cardKey = draggingKey ?? event.dataTransfer.getData('text/plain');
    const card = cards.find((item) => item.key === cardKey);
    setDropStage(null);
    setDraggingKey(null);
    if (!card) return;
    if (!canDropCard(card, stage)) {
      setNotice(`${card.kind.replace('_', ' ')} cards cannot move to ${stage}.`);
      return;
    }

    const previousCards = cards;
    const optimistic: DashboardPipelineCard = {
      ...card,
      stage,
      updatedAt: new Date().toISOString(),
      ownerAction: stage === 'blocked' ? card.ownerAction : card.ownerAction,
    };
    setPendingKey(card.key);
    setNotice(`Moving "${card.title}" to ${stage}...`);
    setCards((current) => current.map((item) => (item.key === card.key ? optimistic : item)));

    try {
      const res = await fetch('/api/pipeline/advance', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: card.id,
          kind: card.kind,
          fromStage: card.stage,
          toStage: stage,
        }),
      });
      const data = (await res.json().catch(() => ({ error: 'invalid_response' }))) as AdvanceResponse;
      if (!res.ok || !('ok' in data)) {
        throw new Error('message' in data && data.message ? data.message : 'Pipeline move failed.');
      }

      setCards((current) => {
        if (!data.card) return current;
        const removeKey = data.removeKey ?? card.key;
        const merged = data.card.key === card.key ? { ...card, ...data.card } : data.card;
        const withoutMoved = current.filter((item) => item.key !== removeKey && item.key !== data.card?.key);
        return [merged, ...withoutMoved];
      });
      setNotice(data.message ?? (data.agentRunId ? 'Queued the next agent step.' : 'Pipeline stage updated.'));
      startTransition(() => router.refresh());
    } catch (err) {
      setCards(previousCards);
      setNotice(err instanceof Error ? err.message : 'Pipeline move failed.');
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <section className="space-y-3" aria-label="Pipeline board">
      {notice ? (
        <div className="flex min-h-10 items-center gap-2 border border-[--color-border] bg-[--color-panel] px-3 py-2 text-sm text-[--color-muted]">
          {pendingKey ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          <span>{notice}</span>
        </div>
      ) : null}
      <div className="-mx-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
        <div className="flex min-w-max gap-3">
          {stages.map((stage) => {
            const stageCards = cardsByStage.get(stage.key) ?? [];
            const validDrop = canDropCard(draggingCard, stage.key);
            const dropActive = dropStage === stage.key;
            return (
              <Panel
                key={stage.key}
                variant="subtle"
                onDragOver={(event) => handleDragOver(stage.key, event)}
                onDrop={(event) => handleDrop(stage.key, event)}
                className={cn(
                  'flex w-[18rem] shrink-0 flex-col overflow-hidden transition-colors',
                  dropActive && validDrop && 'border-[--color-accent] bg-[--color-panel]',
                  dropActive && !validDrop && draggingCard && 'border-[--color-danger-border] bg-[--color-danger-bg]',
                )}
              >
                <div className="flex min-h-12 items-center justify-between gap-2 border-b border-[--color-border] px-3 py-3">
                  <h2 className="text-sm font-semibold tracking-tight">{stage.title}</h2>
                  <span className="font-mono text-xs text-[--color-muted]">{stageCards.length}</span>
                </div>
                <div className="flex min-h-[12rem] flex-1 flex-col gap-2 p-2">
                  {stageCards.length === 0 ? (
                    <div className="border border-dashed border-[--color-border] px-3 py-5 text-center text-xs leading-5 text-[--color-muted]">
                      {dropActive && draggingCard ? (validDrop ? 'Drop to move' : 'Unavailable') : 'No cards'}
                    </div>
                  ) : (
                    stageCards.map((card) => (
                      <PipelineCard
                        key={card.key}
                        card={card}
                        pending={pendingKey === card.key}
                        dragging={draggingKey === card.key}
                        onDragStart={handleDragStart}
                        onDragEnd={() => {
                          setDraggingKey(null);
                          setDropStage(null);
                        }}
                      />
                    ))
                  )}
                </div>
              </Panel>
            );
          })}
        </div>
      </div>
    </section>
  );
}
