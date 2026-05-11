import { desc } from 'drizzle-orm';
import { Bot, MessageSquare, ScrollText } from 'lucide-react';
import { agentRunEvents, approvalRequests, auditEvents, comments, dailyLogEntries, workflowEvents } from '@sagan/db/schema';
import { EmptyState, ListRow, MetricTile, PageHeader, Panel, SegmentedControl, StatusBadge, buttonClassName } from '@/components/ui';
import { db } from '@/lib/db';
import { entityHref } from '@/lib/dashboard';
import { formatRelativeTime, statusTone, type StatusTone } from '@/lib/status';

export const dynamic = 'force-dynamic';

const EVENT_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'approval', label: 'Approvals' },
  { key: 'workflow', label: 'Workflow' },
  { key: 'daily', label: 'Daily' },
  { key: 'automation', label: 'Automation' },
  { key: 'comment', label: 'Comments' },
  { key: 'system', label: 'System' },
] as const;

const DATE_FILTERS = [
  { key: 'week', label: '7 days' },
  { key: 'today', label: 'Today' },
  { key: 'all', label: 'All time' },
] as const;

type EventFilter = (typeof EVENT_FILTERS)[number]['key'];
type DateFilter = (typeof DATE_FILTERS)[number]['key'];

interface LogEvent {
  key: string;
  event: EventFilter;
  title: string;
  detail: string | null;
  entityKind: string | null;
  entityId: string | null;
  actor: 'human' | 'system' | 'automation';
  createdAt: string;
  href: string | null;
  status: string;
  tone: StatusTone;
}

function normalize<T extends string>(value: string | string[] | undefined, allowed: readonly T[], fallback: T): T {
  const raw = Array.isArray(value) ? value[0] : value;
  return allowed.includes(raw as T) ? (raw as T) : fallback;
}

function eventHref(kind: string | null, id: string | null) {
  if (!kind || !id) return null;
  return entityHref(kind, id);
}

function truncate(value: string | null | undefined, length = 260) {
  if (!value) return null;
  return value.length > length ? `${value.slice(0, length)}...` : value;
}

function actorKind(value: string | null | undefined): LogEvent['actor'] {
  if (value === 'human' || value === 'user') return 'human';
  if (value === 'claude' || value === 'agent' || value === 'automation') return 'automation';
  return 'system';
}

function withinDate(event: LogEvent, filter: DateFilter) {
  if (filter === 'all') return true;
  const created = new Date(event.createdAt).getTime();
  const now = Date.now();
  if (filter === 'today') return new Date(event.createdAt).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
  return now - created <= 7 * 24 * 60 * 60 * 1000;
}

export default async function LogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const eventFilter = normalize(params.event, EVENT_FILTERS.map((item) => item.key), 'all');
  const dateFilter = normalize(params.date, DATE_FILTERS.map((item) => item.key), 'week');
  const entityFilter = normalize(params.entity, ['all', 'experiment', 'clean_result', 'lit_item', 'project', 'todo', 'run'] as const, 'all');
  const actorFilter = normalize(params.actor, ['all', 'human', 'system', 'automation'] as const, 'all');
  const q = (Array.isArray(params.q) ? params.q[0] : params.q)?.trim().toLowerCase() ?? '';

  const [dailyRows, workflowRows, approvalRows, agentEventRows, commentRows, auditRows] = await Promise.all([
    db().select().from(dailyLogEntries).orderBy(desc(dailyLogEntries.createdAt)).limit(120),
    db().select().from(workflowEvents).orderBy(desc(workflowEvents.createdAt)).limit(160),
    db().select().from(approvalRequests).orderBy(desc(approvalRequests.createdAt)).limit(120),
    db().select().from(agentRunEvents).orderBy(desc(agentRunEvents.createdAt)).limit(160),
    db().select().from(comments).orderBy(desc(comments.createdAt)).limit(120),
    db().select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(120),
  ]);

  const events: LogEvent[] = [
    ...dailyRows.map((entry) => ({
      key: `daily-${entry.id}`,
      event: 'daily' as const,
      title: `${entry.kind.replaceAll('_', ' ')} entry`,
      detail: truncate(entry.bodyMd),
      entityKind: entry.entityKind ?? 'daily_log_entry',
      entityId: entry.entityId ?? entry.id,
      actor: 'human' as const,
      createdAt: entry.createdAt.toISOString(),
      href: `/e/daily_log_entry/${entry.id}`,
      status: entry.kind,
      tone: statusTone(entry.kind),
    })),
    ...workflowRows.map((event) => ({
      key: `workflow-${event.id}`,
      event: event.eventType === 'approval_requested' || event.eventType === 'approved' ? ('approval' as const) : ('workflow' as const),
      title: event.eventType.replaceAll('_', ' '),
      detail: truncate(event.note ?? `${event.fromStatus ?? 'start'} -> ${event.toStatus ?? 'n/a'}`),
      entityKind: event.entityKind,
      entityId: event.entityId,
      actor: actorKind(event.actorKind),
      createdAt: event.createdAt.toISOString(),
      href: eventHref(event.entityKind, event.entityId),
      status: event.toStatus ?? event.eventType,
      tone: statusTone(event.toStatus ?? event.eventType),
    })),
    ...approvalRows.map((request) => ({
      key: `approval-${request.id}`,
      event: 'approval' as const,
      title: request.title,
      detail: truncate(request.bodyMd ?? request.resolvedNote ?? request.requestedState),
      entityKind: request.entityKind,
      entityId: request.entityId,
      actor: request.requestedBy ? ('human' as const) : ('system' as const),
      createdAt: request.createdAt.toISOString(),
      href: request.agentRunId ? `/agent/${request.agentRunId}` : entityHref(request.entityKind, request.entityId),
      status: request.status,
      tone: statusTone(request.status),
    })),
    ...agentEventRows.map((event) => ({
      key: `agent-event-${event.id}`,
      event: 'automation' as const,
      title: event.eventType.replaceAll('_', ' '),
      detail: truncate(event.body),
      entityKind: 'run',
      entityId: event.runId,
      actor: 'automation' as const,
      createdAt: event.createdAt.toISOString(),
      href: `/agent/${event.runId}`,
      status: event.eventType,
      tone: statusTone(event.eventType),
    })),
    ...commentRows.map((comment) => ({
      key: `comment-${comment.id}`,
      event: 'comment' as const,
      title: `${comment.kind} comment`,
      detail: truncate(comment.body),
      entityKind: comment.entityKind,
      entityId: comment.entityId,
      actor: actorKind(comment.authorKind),
      createdAt: comment.createdAt.toISOString(),
      href: entityHref(comment.entityKind, comment.entityId),
      status: comment.resolvedAt ? 'resolved' : comment.kind,
      tone: comment.resolvedAt ? 'success' : statusTone(comment.kind),
    })),
    ...auditRows.map((event) => ({
      key: `audit-${event.id}`,
      event: 'system' as const,
      title: event.action,
      detail: truncate(event.detail ?? event.why),
      entityKind: event.entityKind,
      entityId: event.entityId,
      actor: actorKind(event.actorKind),
      createdAt: event.createdAt.toISOString(),
      href: eventHref(event.entityKind, event.entityId),
      status: event.source,
      tone: 'neutral' as const,
    })),
  ];

  const filtered = events
    .filter((event) => eventFilter === 'all' || event.event === eventFilter)
    .filter((event) => withinDate(event, dateFilter))
    .filter((event) => entityFilter === 'all' || event.entityKind === entityFilter)
    .filter((event) => actorFilter === 'all' || event.actor === actorFilter)
    .filter((event) => {
      if (!q) return true;
      return [event.title, event.detail, event.entityKind, event.entityId].filter(Boolean).join(' ').toLowerCase().includes(q);
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 200);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Log"
        description="Chronological research, approval, automation, comment, and audit activity."
        meta={`${filtered.length} shown`}
      />

      <section className="grid gap-3 md:grid-cols-3">
        <MetricTile label="Approvals" value={events.filter((event) => event.event === 'approval' && withinDate(event, dateFilter)).length} tone="approval" />
        <MetricTile label="Automation events" value={events.filter((event) => event.event === 'automation' && withinDate(event, dateFilter)).length} icon={<Bot className="h-4 w-4" aria-hidden="true" />} />
        <MetricTile label="Comments" value={events.filter((event) => event.event === 'comment' && withinDate(event, dateFilter)).length} icon={<MessageSquare className="h-4 w-4" aria-hidden="true" />} />
      </section>

      <div className="space-y-3">
        <SegmentedControl
          items={EVENT_FILTERS.map((item) => ({
            label: item.label,
            href: item.key === 'all' ? `/log?date=${dateFilter}` : `/log?event=${item.key}&date=${dateFilter}`,
            active: item.key === eventFilter,
            count: events.filter((event) => item.key === 'all' || event.event === item.key).filter((event) => withinDate(event, dateFilter)).length,
          }))}
        />
        <SegmentedControl
          items={DATE_FILTERS.map((item) => ({
            label: item.label,
            href: `/log?event=${eventFilter}&date=${item.key}`,
            active: item.key === dateFilter,
          }))}
        />
        <form className="grid gap-2 rounded-lg border border-[--color-border] bg-[--color-surface-subtle] p-3 md:grid-cols-[1fr_1fr_minmax(10rem,1.5fr)_auto]">
          <input type="hidden" name="event" value={eventFilter} />
          <input type="hidden" name="date" value={dateFilter} />
          <select name="entity" defaultValue={entityFilter} className="min-h-10 rounded-md border border-[--color-border] bg-[--color-panel] px-3 text-sm">
            <option value="all">All entities</option>
            <option value="experiment">Experiments</option>
            <option value="clean_result">Clean results</option>
            <option value="lit_item">Literature</option>
            <option value="project">Projects</option>
            <option value="todo">Tasks</option>
            <option value="run">Automation runs</option>
          </select>
          <select name="actor" defaultValue={actorFilter} className="min-h-10 rounded-md border border-[--color-border] bg-[--color-panel] px-3 text-sm">
            <option value="all">All actors</option>
            <option value="human">Human</option>
            <option value="automation">Automation</option>
            <option value="system">System</option>
          </select>
          <input
            name="q"
            defaultValue={q}
            placeholder="Project, topic, or entity"
            className="min-h-10 rounded-md border border-[--color-border] bg-[--color-panel] px-3 text-sm"
          />
          <button type="submit" className={buttonClassName({ variant: 'secondary', size: 'md' })}>
            Apply
          </button>
        </form>
      </div>

      <Panel className="overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<ScrollText className="h-5 w-5" aria-hidden="true" />}
            title="No log events match these filters"
            message="Try a wider date range, entity type, actor, or event type."
          />
        ) : (
          <div className="divide-y divide-[--color-border]">
            {filtered.map((event) => (
              <ListRow
                key={event.key}
                href={event.href ?? undefined}
                leading={<ScrollText className="h-4 w-4" aria-hidden="true" />}
                title={event.title}
                detail={event.detail}
                meta={
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <StatusBadge status={event.status} tone={event.tone} />
                    <span>{event.actor}</span>
                    <span>{formatRelativeTime(event.createdAt)}</span>
                  </span>
                }
              />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
