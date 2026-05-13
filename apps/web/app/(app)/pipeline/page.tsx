import { Kanban, Search } from 'lucide-react';
import { EmptyState, MetricTile, PageHeader, SegmentedControl } from '@/components/ui';
import { loadPipelineCards, PIPELINE_STAGES, type DashboardPipelineCard } from '@/lib/dashboard';
import { PipelineBoard } from './PipelineBoard';

export const dynamic = 'force-dynamic';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'owner', label: 'Owner action' },
  { key: 'running', label: 'Running' },
  { key: 'blocked', label: 'Blocked' },
] as const;

type PipelineFilter = (typeof FILTERS)[number]['key'];

function normalizeFilter(value: string | string[] | undefined): PipelineFilter {
  const filter = Array.isArray(value) ? value[0] : value;
  return FILTERS.some((item) => item.key === filter) ? (filter as PipelineFilter) : 'all';
}

function filterCards(cards: DashboardPipelineCard[], filter: PipelineFilter) {
  if (filter === 'owner') return cards.filter((card) => card.ownerAction);
  if (filter === 'running') return cards.filter((card) => card.stage === 'running' || card.tone === 'running');
  if (filter === 'blocked') return cards.filter((card) => card.stage === 'blocked' || card.tone === 'danger');
  return cards;
}

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filter = normalizeFilter(params.filter);
  const cards = await loadPipelineCards();
  const visibleCards = filterCards(cards, filter);
  const ownerActionCount = cards.filter((card) => card.ownerAction).length;
  const runningCount = cards.filter((card) => card.stage === 'running' || card.tone === 'running').length;
  const blockedCount = cards.filter((card) => card.stage === 'blocked' || card.tone === 'danger').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pipeline"
        description="Stage-based board for active research work, automation runs, ideas, tasks, and results."
        meta={`${visibleCards.length} cards`}
      />

      <section className="grid gap-3 md:grid-cols-3">
        <MetricTile label="Owner action" value={ownerActionCount} tone={ownerActionCount > 0 ? 'approval' : 'neutral'} />
        <MetricTile label="Running" value={runningCount} tone={runningCount > 0 ? 'success' : 'neutral'} />
        <MetricTile label="Blocked" value={blockedCount} tone={blockedCount > 0 ? 'danger' : 'neutral'} />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          items={FILTERS.map((item) => ({
            label: item.label,
            href: item.key === 'all' ? '/pipeline' : `/pipeline?filter=${item.key}`,
            active: item.key === filter,
            count: filterCards(cards, item.key).length,
          }))}
        />
        <div className="flex items-center gap-2 text-sm text-[--color-muted]">
          <Search className="h-4 w-4" aria-hidden="true" />
          <span>Filter by stage or owner action</span>
        </div>
      </div>

      {visibleCards.length === 0 ? (
        <EmptyState
          icon={<Kanban className="h-5 w-5" aria-hidden="true" />}
          title="No pipeline cards match this filter"
          message="Active experiments, promoted ideas, automation runs, tasks, and clean results appear here by stage."
        />
      ) : (
        <PipelineBoard stages={PIPELINE_STAGES} cards={visibleCards} />
      )}
    </div>
  );
}
