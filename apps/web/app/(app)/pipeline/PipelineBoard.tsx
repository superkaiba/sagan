'use client';

import Link from 'next/link';
import { Fragment, useEffect, useMemo, useRef, useState, useTransition, type DragEvent, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Archive, ExternalLink, GripVertical, Loader2, RotateCcw, Sparkles } from 'lucide-react';
import { Panel } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatRelativeTime } from '@/lib/status';
import type { DashboardPipelineCard, PipelineCardRun, PipelineRunStatus, PipelineStageKey } from '@/lib/dashboard';

type PipelineStage = { key: PipelineStageKey; title: string };
type PipelineCardKind = DashboardPipelineCard['kind'];
type DropTarget = { stage: PipelineStageKey; beforeKey: string | null };
const PIPELINE_ORDER_STORAGE_KEY = 'sagan:pipeline-card-order';

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
  experiment: ['later', 'idea', 'planning', 'approval', 'queued', 'running', 'interpreting', 'blocked', 'review', 'done', 'archived'],
  clean_result: ['interpreting', 'clean_results', 'blocked', 'review', 'done', 'archived'],
  todo: ['later', 'idea', 'planning', 'running', 'interpreting', 'blocked', 'review', 'done', 'archived'],
  idea: ['planning', 'archived'],
  automation: ['approval', 'queued', 'running', 'done', 'blocked', 'archived'],
};

function canDropCard(card: DashboardPipelineCard | null, stage: PipelineStageKey) {
  if (!card) return false;
  if (card.stage === stage) return true;
  return dropTargets[card.kind].includes(stage);
}

function stageMessage(kind: PipelineCardKind) {
  if (kind === 'idea') return 'Drop on Planning to promote this idea and queue a plan.';
  if (kind === 'todo') return 'Drop to move the task. Later parks it as low priority.';
  return 'Drop to move and trigger the next agent step when this stage has one.';
}

const KIND_LABELS: Record<PipelineCardKind, string> = {
  experiment: 'Experiment',
  clean_result: 'Clean result',
  todo: 'To-do',
  idea: 'Idea',
  automation: 'Automation',
};

function dropFeedback(card: DashboardPipelineCard, stage: PipelineStage, validDrop: boolean) {
  if (validDrop && card.stage === stage.key) return `Drop to place in ${stage.title}`;
  if (validDrop && stage.key === 'archived') return 'Drop to archive without deleting';
  if (validDrop) return `Drop to move to ${stage.title}`;
  if (card.stage === stage.key) return `Already in ${stage.title}`;
  if (stage.key === 'later') return `${KIND_LABELS[card.kind]} cards cannot be parked in Later`;
  return `${KIND_LABELS[card.kind]} cards cannot move to ${stage.title}`;
}

function DropMarker() {
  return (
    <div className="py-1" aria-hidden="true">
      <div className="h-1 border border-[--color-accent] bg-[color-mix(in_srgb,var(--color-accent)_42%,var(--color-panel))] shadow-[var(--shadow-inset)]" />
    </div>
  );
}

function insertCardAtTarget(
  current: DashboardPipelineCard[],
  card: DashboardPipelineCard,
  target: DropTarget,
  removeKeys: string[] = [card.key],
) {
  const moved = { ...card, stage: target.stage };
  const remove = new Set([...removeKeys, moved.key]);
  const next = current.filter((item) => !remove.has(item.key));
  const beforeIndex = target.beforeKey ? next.findIndex((item) => item.key === target.beforeKey) : -1;

  if (beforeIndex >= 0) {
    next.splice(beforeIndex, 0, moved);
    return next;
  }

  let lastInStage = -1;
  for (let index = 0; index < next.length; index += 1) {
    if (next[index]?.stage === target.stage) lastInStage = index;
  }
  next.splice(lastInStage + 1, 0, moved);
  return next;
}

function readStoredCardOrder() {
  if (typeof window === 'undefined') return new Map<string, number>();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PIPELINE_ORDER_STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return new Map<string, number>();
    return new Map(parsed.filter((key): key is string => typeof key === 'string').map((key, index) => [key, index]));
  } catch {
    return new Map<string, number>();
  }
}

function writeStoredCardOrder(cards: DashboardPipelineCard[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PIPELINE_ORDER_STORAGE_KEY, JSON.stringify(cards.map((card) => card.key)));
  } catch {
    // Storage is best effort; the server-backed status move still succeeds.
  }
}

const RUN_LABEL: Record<PipelineRunStatus, string> = {
  queued: 'queued',
  running: 'running',
  awaiting_approval: 'awaiting approval',
  approved: 'approved',
  deploying: 'deploying',
  blocked: 'blocked',
  failed: 'failed',
  cancelled: 'cancelled',
  rejected: 'rejected',
  completed: 'completed',
};

const RUN_FAILED_STATUSES: PipelineRunStatus[] = ['failed', 'blocked', 'cancelled', 'rejected'];
const RUN_ACTIVE_STATUSES: PipelineRunStatus[] = ['queued', 'running', 'approved', 'deploying'];

function SessionStrip({
  run,
  onRetry,
  retrying,
}: {
  run: PipelineCardRun;
  onRetry: () => void;
  retrying: boolean;
}) {
  const failed = RUN_FAILED_STATUSES.includes(run.status);
  const active = RUN_ACTIVE_STATUSES.includes(run.status);
  return (
    <div
      className={cn(
        'mt-2 flex items-center gap-2 rounded-md border px-2 py-1 text-[11px]',
        failed
          ? 'border-[--color-danger-border] bg-[--color-danger-bg] text-[--color-danger]'
          : active
            ? 'border-[--color-info-border] bg-[--color-info-bg] text-[--color-info]'
            : 'border-[--color-border] bg-[--color-muted-bg] text-[--color-muted]',
      )}
      data-clickable="true"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {failed ? (
        <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
      ) : active ? (
        <Sparkles className={cn('h-3 w-3 shrink-0', run.status === 'running' && 'animate-pulse')} aria-hidden="true" />
      ) : (
        <Sparkles className="h-3 w-3 shrink-0" aria-hidden="true" />
      )}
      <span className="font-medium">claude · {RUN_LABEL[run.status]}</span>
      <Link
        href={run.href}
        className="ml-1 inline-flex items-center gap-0.5 underline-offset-2 hover:underline"
        title="View Claude Code session"
        draggable={false}
      >
        <span className="font-mono">{run.id.slice(0, 8)}</span>
        <ExternalLink className="h-3 w-3" aria-hidden="true" />
      </Link>
      {run.canRetry ? (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="ml-auto inline-flex items-center gap-0.5 rounded border border-current/40 px-1.5 py-0.5 text-[11px] hover:bg-[--color-panel] disabled:opacity-50"
          title="Spawn a fresh Claude Code session that picks up where this one left off"
        >
          {retrying ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <RotateCcw className="h-3 w-3" aria-hidden="true" />}
          <span>Retry</span>
        </button>
      ) : null}
    </div>
  );
}

function PipelineCard({
  card,
  pending,
  dragging,
  retrying,
  onDragStart,
  onDragEnd,
  onRetry,
  onArchive,
}: {
  card: DashboardPipelineCard;
  pending: boolean;
  dragging: boolean;
  retrying: boolean;
  onDragStart: (card: DashboardPipelineCard, event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onRetry: (card: DashboardPipelineCard) => void;
  onArchive: (card: DashboardPipelineCard) => void;
}) {
  const suppressClick = useRef(false);
  const attentionColumn = card.stage === 'approval' || card.stage === 'review';
  const needsOwner = Boolean(card.ownerAction) && attentionColumn;

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (pending || suppressClick.current) {
      event.preventDefault();
    }
  }

  return (
    <article
      draggable={!pending}
      aria-busy={pending}
      data-clickable="true"
      data-owner-attention={needsOwner ? 'true' : 'false'}
      data-pipeline-card-key={card.key}
      onDragStart={(event) => {
        suppressClick.current = true;
        onDragStart(card, event);
      }}
      onDragEnd={() => {
        onDragEnd();
        window.setTimeout(() => {
          suppressClick.current = false;
        }, 150);
      }}
      className={cn(
        'group relative border bg-[--color-panel] p-3 text-[--color-fg] shadow-[var(--shadow-panel)] transition-colors',
        'cursor-grab active:cursor-grabbing hover:bg-[--color-hover]',
        needsOwner
          ? 'border-[3px] border-[--color-attention] bg-[--color-attention-soft] animate-sagan-approval-pulse'
          : 'border border-[--color-border]',
        card.stage === 'blocked' && !needsOwner && 'border-[--color-danger-border] bg-[--color-danger-bg]',
        dragging && 'opacity-45',
        pending && 'cursor-wait opacity-70',
      )}
    >
      <Link
        href={card.href}
        data-clickable="true"
        draggable={false}
        onClick={handleClick}
        className="absolute inset-0 z-0"
        aria-label={`Open ${card.title}`}
      />
      <div className="relative z-10 pointer-events-none">
        <div className="flex items-start gap-2">
          <GripVertical className="mt-0.5 h-4 w-4 text-[--color-muted]" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <span className="block text-sm font-semibold leading-5 group-hover:text-[--color-accent]">
              <span className="line-clamp-2">{card.title}</span>
            </span>
            {card.detail ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-[--color-muted]">{card.detail}</p> : null}
          </div>
          {pending ? <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-[--color-muted]" aria-hidden="true" /> : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 pr-8 text-xs text-[--color-muted]">
          <span>{KIND_LABELS[card.kind]}</span>
          <span>{formatRelativeTime(card.updatedAt)}</span>
        </div>
        {needsOwner && card.ownerAction ? (
          <p className="mt-2 text-xs font-semibold leading-4 text-[--color-attention]">{card.ownerAction}</p>
        ) : null}
        {card.project ? <p className="mt-2 truncate text-xs text-[--color-muted]">{card.project}</p> : null}
      </div>
      {card.run ? (
        <div className="relative z-20">
          <SessionStrip run={card.run} retrying={retrying} onRetry={() => onRetry(card)} />
        </div>
      ) : null}
      {card.stage !== 'archived' ? (
        <button
          type="button"
          draggable={false}
          disabled={pending}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onArchive(card);
          }}
          className="absolute bottom-2 right-2 z-30 inline-flex h-7 w-7 items-center justify-center border border-[--color-border] bg-[--color-panel] text-[--color-muted] shadow-[var(--shadow-inset)] hover:border-[--color-danger-border] hover:bg-[--color-danger-bg] hover:text-[--color-danger] focus:outline-none focus:ring-2 focus:ring-[--color-focus] disabled:cursor-wait disabled:opacity-60"
          title="Archive"
          aria-label={`Archive ${card.title}`}
        >
          <Archive className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ) : null}
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
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [retryingRunId, setRetryingRunId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const skipNextOrderPersist = useRef(true);

  function handleArchive(card: DashboardPipelineCard) {
    void moveCard(card, { stage: 'archived', beforeKey: null });
  }

  async function handleRetry(card: DashboardPipelineCard) {
    if (!card.run || !card.run.canRetry) return;
    const runId = card.run.id;
    setRetryingRunId(runId);
    setNotice(`Retrying Claude Code session ${runId.slice(0, 8)}…`);
    try {
      const res = await fetch(`/api/agent-runs/${runId}/retry`, { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as { error?: string; runId?: string; message?: string };
      if (!res.ok) {
        setNotice(data.error ?? 'retry_failed');
        return;
      }
      setNotice(data.message ?? `Queued a fresh session for ${card.title.slice(0, 60)}.`);
      startTransition(() => router.refresh());
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'retry_failed');
    } finally {
      setRetryingRunId(null);
    }
  }

  useEffect(() => {
    skipNextOrderPersist.current = true;
    setCards((current) => {
      if (current.length === 0) return initialCards;
      const currentOrder = new Map(current.map((card, index) => [card.key, index]));
      const storedOrder = readStoredCardOrder();
      const initialOrder = new Map(initialCards.map((card, index) => [card.key, index]));
      return [...initialCards].sort((a, b) => {
        const aOrder = storedOrder.get(a.key) ?? currentOrder.get(a.key) ?? Number.MAX_SAFE_INTEGER + (initialOrder.get(a.key) ?? 0);
        const bOrder = storedOrder.get(b.key) ?? currentOrder.get(b.key) ?? Number.MAX_SAFE_INTEGER + (initialOrder.get(b.key) ?? 0);
        return aOrder - bOrder;
      });
    });
  }, [initialCards]);

  useEffect(() => {
    if (skipNextOrderPersist.current) {
      skipNextOrderPersist.current = false;
      return;
    }
    writeStoredCardOrder(cards);
  }, [cards]);

  // Live updates: subscribe to /api/pipeline/events and refresh the route
  // whenever the server reports that any pipeline-relevant entity moved.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
    const es = new EventSource('/api/pipeline/events');
    let refreshScheduled = false;
    const scheduleRefresh = () => {
      if (refreshScheduled) return;
      refreshScheduled = true;
      window.setTimeout(() => {
        refreshScheduled = false;
        startTransition(() => router.refresh());
      }, 200);
    };
    es.addEventListener('changed', scheduleRefresh);
    es.addEventListener('error', () => {
      // EventSource auto-reconnects; nothing to do here.
    });
    return () => es.close();
  }, [router, startTransition]);

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

  function dropTargetFromEvent(stage: PipelineStageKey, event: DragEvent<HTMLElement>): DropTarget {
    const cardElements = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[data-pipeline-card-key]')).filter(
      (element) => element.dataset.pipelineCardKey !== draggingKey,
    );
    let beforeKey: string | null = null;
    for (const element of cardElements) {
      const rect = element.getBoundingClientRect();
      if (event.clientY < rect.top + rect.height / 2) {
        beforeKey = element.dataset.pipelineCardKey ?? null;
        break;
      }
    }
    return { stage, beforeKey };
  }

  function handleDragOver(stage: PipelineStageKey, event: DragEvent<HTMLElement>) {
    if (!draggingCard) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = canDropCard(draggingCard, stage) ? 'move' : 'none';
    setDropTarget(dropTargetFromEvent(stage, event));
  }

  function handleDragLeave(stage: PipelineStageKey, event: DragEvent<HTMLElement>) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setDropTarget((current) => (current?.stage === stage ? null : current));
  }

  async function moveCard(card: DashboardPipelineCard, target: DropTarget) {
    if (!canDropCard(card, target.stage)) {
      setNotice(`${card.kind.replace('_', ' ')} cards cannot move to ${target.stage}.`);
      return;
    }

    const previousCards = cards;
    const optimistic: DashboardPipelineCard = {
      ...card,
      stage: target.stage,
      updatedAt: card.stage === target.stage ? card.updatedAt : new Date().toISOString(),
      ownerAction: target.stage === 'blocked' ? card.ownerAction : card.ownerAction,
    };
    setCards((current) => insertCardAtTarget(current, optimistic, target));

    if (card.stage === target.stage) {
      setNotice(`Moved "${card.title}" within ${target.stage}.`);
      return;
    }

    setPendingKey(card.key);
    setNotice(target.stage === 'archived' ? `Archiving "${card.title}"...` : `Moving "${card.title}" to ${target.stage}...`);

    try {
      const res = await fetch('/api/pipeline/advance', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: card.id,
          kind: card.kind,
          fromStage: card.stage,
          toStage: target.stage,
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
        return insertCardAtTarget(current, merged, target, [removeKey, data.card.key]);
      });
      setNotice(
        data.message ??
          (target.stage === 'archived' ? 'Moved to archived.' : data.agentRunId ? 'Queued the next agent step.' : 'Pipeline stage updated.'),
      );
    } catch (err) {
      setCards(previousCards);
      setNotice(err instanceof Error ? err.message : 'Pipeline move failed.');
    } finally {
      setPendingKey(null);
    }
  }

  async function handleDrop(stage: PipelineStageKey, event: DragEvent<HTMLElement>) {
    event.preventDefault();
    const cardKey = draggingKey ?? event.dataTransfer.getData('text/plain');
    const card = cards.find((item) => item.key === cardKey);
    const target = dropTarget?.stage === stage ? dropTarget : dropTargetFromEvent(stage, event);
    setDropTarget(null);
    setDraggingKey(null);
    if (!card) return;
    await moveCard(card, target);
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
            const dropActive = dropTarget?.stage === stage.key;
            return (
              <Panel
                key={stage.key}
                variant="subtle"
                onDragOver={(event) => handleDragOver(stage.key, event)}
                onDragLeave={(event) => handleDragLeave(stage.key, event)}
                onDrop={(event) => handleDrop(stage.key, event)}
                className={cn(
                  'flex w-[18rem] shrink-0 flex-col overflow-hidden transition-[background-color,border-color,box-shadow]',
                  dropActive &&
                    validDrop &&
                    'border-[--color-accent] bg-[color-mix(in_srgb,var(--color-accent)_6%,var(--color-panel))] shadow-[var(--shadow-lift)] ring-2 ring-[--color-accent] ring-offset-2 ring-offset-[--color-bg]',
                  dropActive &&
                    !validDrop &&
                    draggingCard &&
                    'border-[--color-danger-border] bg-[--color-danger-bg] shadow-[var(--shadow-lift)] ring-2 ring-[--color-danger-border] ring-offset-2 ring-offset-[--color-bg]',
                )}
              >
                <div className="flex min-h-12 items-center justify-between gap-2 border-b border-[--color-border] px-3 py-3">
                  <h2 className="text-sm font-semibold tracking-tight">{stage.title}</h2>
                  <span className="font-mono text-xs text-[--color-muted]">{stageCards.length}</span>
                </div>
                <div className="flex min-h-[12rem] flex-1 flex-col gap-2 p-2">
                  {dropActive && draggingCard ? (
                    <div
                      className={cn(
                        'border px-3 py-2 text-xs font-medium shadow-[var(--shadow-inset)]',
                        validDrop
                          ? 'border-[--color-accent] bg-[color-mix(in_srgb,var(--color-accent)_8%,var(--color-panel))] text-[--color-fg]'
                          : 'border-[--color-danger-border] bg-[--color-danger-bg] text-[--color-danger]',
                      )}
                    >
                      {dropFeedback(draggingCard, stage, validDrop)}
                    </div>
                  ) : null}
                  {stageCards.length === 0 ? (
                    <>
                      {dropActive && validDrop ? <DropMarker /> : null}
                      <div className="border border-dashed border-[--color-border] px-3 py-5 text-center text-xs leading-5 text-[--color-muted]">
                        No cards
                      </div>
                    </>
                  ) : (
                    <>
                      {stageCards.map((card) => (
                        <Fragment key={card.key}>
                          {dropActive && validDrop && dropTarget?.beforeKey === card.key ? <DropMarker /> : null}
                          <PipelineCard
                            card={card}
                            pending={pendingKey === card.key}
                            dragging={draggingKey === card.key}
                            retrying={card.run ? retryingRunId === card.run.id : false}
                            onDragStart={handleDragStart}
                            onDragEnd={() => {
                              setDraggingKey(null);
                              setDropTarget(null);
                            }}
                            onRetry={handleRetry}
                            onArchive={handleArchive}
                          />
                        </Fragment>
                      ))}
                      {dropActive && validDrop && dropTarget?.beforeKey === null ? <DropMarker /> : null}
                    </>
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
