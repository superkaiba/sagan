import { and, desc, eq } from 'drizzle-orm';
import { workflowEvents } from '@sagan/db/schema';
import { Markdown } from '@/components/Markdown';
import { db } from '@/lib/db';
import { cn } from '@/lib/cn';

type WorkflowEventRow = typeof workflowEvents.$inferSelect;

interface WorkflowHistoryProps {
  experimentId: string;
}

interface WorkflowCard {
  key: string;
  title: string;
  subtitle: string;
  tone: 'neutral' | 'success' | 'warn' | 'danger' | 'info';
  events: WorkflowEventRow[];
}

const WORKFLOW_EVENTS_LIMIT = 100;

export async function WorkflowHistory({ experimentId }: WorkflowHistoryProps) {
  // Workflow event volume per experiment is unbounded — cap at the most
  // recent 100 (descending) then flip to chronological order so the rest
  // of the renderer can keep its existing assumptions.
  const newest = await db()
    .select()
    .from(workflowEvents)
    .where(and(eq(workflowEvents.entityKind, 'experiment'), eq(workflowEvents.entityId, experimentId)))
    .orderBy(desc(workflowEvents.createdAt))
    .limit(WORKFLOW_EVENTS_LIMIT);
  const events = [...newest].reverse();

  if (events.length === 0) return null;
  const cards = groupWorkflowEvents(events);

  return (
    <section className="rounded-lg border border-[--color-border] bg-[--color-panel]">
      <header className="border-b border-[--color-border] px-4 py-2">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-[--color-muted]">
            Issue history
          </h2>
          <span className="text-xs text-[--color-muted]">
            {events.length} event{events.length === 1 ? '' : 's'}
          </span>
        </div>
      </header>
      <div className="divide-y divide-[--color-border]">
        {cards.map((card, index) => {
          const open = index === cards.length - 1 || card.tone === 'danger' || card.tone === 'warn';
          return (
            <details key={card.key} open={open} className="group">
              <summary className="cursor-pointer list-none px-4 py-2 hover:bg-[--color-hover]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn('h-2 w-2 rounded-full', toneDot(card.tone))} aria-hidden="true" />
                  <span className="font-medium">{card.title}</span>
                  <span className="text-xs text-[--color-muted]">{card.subtitle}</span>
                  <span className="ml-auto text-xs text-[--color-muted]">
                    {card.events.length} item{card.events.length === 1 ? '' : 's'}
                  </span>
                </div>
              </summary>
              <ol className="space-y-2 px-4 pb-4 text-sm">
                {card.events.map((event) => (
                  <li key={event.id} className={cn('rounded-md border px-3 py-2', eventBoxTone(event))}>
                    <div className="flex flex-wrap items-baseline gap-2">
                      <time className="font-mono text-xs text-[--color-muted]" dateTime={event.createdAt.toISOString()}>
                        {formatDate(event.createdAt)}
                      </time>
                      <span className="text-xs font-medium uppercase tracking-wide text-[--color-muted]">
                        {eventLabel(event)}
                      </span>
                      {event.fromStatus || event.toStatus ? (
                        <span className="font-mono text-xs text-[--color-muted]">
                          {event.fromStatus ?? '?'} {'->'} {event.toStatus ?? '?'}
                        </span>
                      ) : null}
                    </div>
                    {event.note ? (
                      <div className="mt-1 text-sm">
                        <Markdown>{event.note}</Markdown>
                      </div>
                    ) : null}
                    {event.metadata ? (
                      <details className="mt-2 rounded border border-[--color-border] bg-[--color-bg]">
                        <summary className="cursor-pointer px-2 py-1 text-xs font-medium text-[--color-muted]">
                          Metadata
                        </summary>
                        <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-words border-t border-[--color-border] p-2 text-xs text-[--color-muted]">
                          {JSON.stringify(event.metadata, null, 2)}
                        </pre>
                      </details>
                    ) : null}
                  </li>
                ))}
              </ol>
            </details>
          );
        })}
      </div>
    </section>
  );
}

function groupWorkflowEvents(events: WorkflowEventRow[]): WorkflowCard[] {
  const cards: WorkflowCard[] = [];
  let current: WorkflowCard | null = null;
  for (const event of events) {
    const metadata = metadataObject(event.metadata);
    const marker = typeof metadata.marker_type === 'string' ? metadata.marker_type : null;
    const stepId =
      typeof metadata.step_id === 'string'
        ? metadata.step_id
        : typeof metadata.workflow_step === 'string'
          ? metadata.workflow_step
          : null;
    const key = stepId ?? marker ?? event.toStatus ?? event.eventType;
    const shouldStart =
      !current ||
      marker === 'epm:step-completed' ||
      current.key !== key ||
      event.eventType === 'state_changed' ||
      event.eventType === 'blocked';
    if (shouldStart) {
      current = {
        key: `${key}-${event.id}`,
        title: cardTitle(event, marker, stepId),
        subtitle: formatDate(event.createdAt),
        tone: cardTone(event, marker),
        events: [],
      };
      cards.push(current);
    }
    if (!current) continue;
    current.events.push(event);
    current.tone = maxTone(current.tone, cardTone(event, marker));
  }
  return cards;
}

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function cardTitle(event: WorkflowEventRow, marker: string | null, stepId: string | null) {
  const metadata = metadataObject(event.metadata);
  if (typeof metadata.step_title === 'string') return metadata.step_title;
  if (stepId) return titleize(stepId);
  if (marker) return marker.replace(/^epm:/, '').replaceAll('-', ' ');
  if (event.toStatus) return titleize(event.toStatus);
  return event.eventType.replaceAll('_', ' ');
}

function eventLabel(event: WorkflowEventRow) {
  const metadata = metadataObject(event.metadata);
  const marker = typeof metadata.marker_type === 'string' ? metadata.marker_type : null;
  if (marker) return marker;
  return event.eventType.replaceAll('_', ' ');
}

function cardTone(event: WorkflowEventRow, marker: string | null): WorkflowCard['tone'] {
  const metadata = metadataObject(event.metadata);
  if (event.eventType === 'blocked' || marker === 'epm:failure' || metadata.exit_kind === 'blocked' || metadata.exit_kind === 'failed') {
    return 'danger';
  }
  if (metadata.exit_kind === 'parked' || event.toStatus === 'awaiting_approval') return 'warn';
  if (metadata.exit_kind === 'clean' || metadata.exit_kind === 'recovered' || event.toStatus === 'completed') return 'success';
  if (event.eventType === 'state_changed') return 'info';
  return 'neutral';
}

function maxTone(a: WorkflowCard['tone'], b: WorkflowCard['tone']): WorkflowCard['tone'] {
  const rank = { neutral: 0, info: 1, success: 2, warn: 3, danger: 4 };
  return rank[b] > rank[a] ? b : a;
}

function toneDot(tone: WorkflowCard['tone']) {
  switch (tone) {
    case 'danger':
      return 'bg-[--color-danger]';
    case 'warn':
      return 'bg-[--color-warning]';
    case 'success':
      return 'bg-[--color-success]';
    case 'info':
      return 'bg-[--color-info]';
    default:
      return 'bg-[--color-muted]';
  }
}

function eventBoxTone(event: WorkflowEventRow) {
  const tone = cardTone(event, eventLabel(event).startsWith('epm:') ? eventLabel(event) : null);
  switch (tone) {
    case 'danger':
      return 'border-[--color-danger-border] bg-[--color-danger-bg]';
    case 'warn':
      return 'border-[--color-warning-border] bg-[--color-warning-bg]';
    case 'success':
      return 'border-[--color-success-border] bg-[--color-success-bg]';
    case 'info':
      return 'border-[--color-info-border] bg-[--color-info-bg]';
    default:
      return 'border-[--color-border] bg-[--color-bg]';
  }
}

function titleize(value: string) {
  return value
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatDate(value: Date | string | null) {
  if (!value) return 'not recorded';
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toISOString().replace('T', ' ').slice(0, 16);
}
