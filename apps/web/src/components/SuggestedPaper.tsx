import Link from 'next/link';
import { ExternalLink, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { DashboardSuggestedLitItem } from '@/lib/dashboard';
import { PriorityPill, type LitPriority } from './LitPriorityControl';

const TOPIC_LABELS: Record<string, string> = {
  current_project: 'Current project',
  general_safety: 'AI safety',
  general_ai: 'AI / ML',
  cognitive_science: 'Cognitive sci',
  neuroscience: 'Neuroscience',
  other: 'Other',
};

function authorLabel(authors: string[]): string {
  if (authors.length === 0) return 'Unknown';
  if (authors.length <= 2) return authors.join(', ');
  return `${authors[0]} et al.`;
}

export function SuggestedPaper({ suggestion }: { suggestion: DashboardSuggestedLitItem | null }) {
  if (!suggestion) return null;
  const topicLabel = TOPIC_LABELS[suggestion.topic] ?? suggestion.topic;
  const dateLabel = suggestion.releasedOn ?? '—';
  const externalUrl =
    suggestion.url ?? (suggestion.arxivId ? `https://arxiv.org/abs/${suggestion.arxivId}` : null);
  return (
    <section
      aria-labelledby="suggested-paper-heading"
      className={cn('sagan-suggested-paper rounded-[--radius-control] p-3 text-sm shadow-[var(--shadow-inset)]')}
    >
      <div className="relative flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[--color-accent]">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        <span id="suggested-paper-heading" className="font-semibold">
          Read next
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5">
          <PriorityPill priority={(suggestion.priority ?? 'normal') as LitPriority} />
          <span className="font-mono text-[10px] text-[--color-muted]">{topicLabel}</span>
        </span>
      </div>
      <Link
        href={`/e/lit_item/${suggestion.id}`}
        className="relative mt-2 block font-semibold leading-snug tracking-tight text-[--color-fg] hover:underline"
      >
        {suggestion.title}
      </Link>
      <p className="relative mt-1 text-xs text-[--color-muted]">
        {authorLabel(suggestion.authors)} · {dateLabel}
      </p>
      {suggestion.summaryMd ? (
        // Strip the optional "**Main takeaways:**" bullet section from the
        // markdown — the sidebar shows a one-glance teaser, not the full
        // structure. The clean prose paragraph is everything before the
        // takeaways list.
        <p className="relative mt-2 line-clamp-3 text-xs text-[--color-fg]/85">
          {suggestion.summaryMd.split(/\n\n\*\*Main takeaways/i)[0]?.trim() || suggestion.summaryMd}
        </p>
      ) : null}
      {suggestion.relevanceReasonMd ? (
        <p className="relative mt-2 line-clamp-2 text-xs italic text-[--color-muted]">
          Why now: {suggestion.relevanceReasonMd}
        </p>
      ) : null}
      <div className="relative mt-2 flex items-center justify-between gap-2 text-xs">
        <Link href={`/e/lit_item/${suggestion.id}`} className="text-[--color-accent] hover:underline">
          Open paper page
        </Link>
        {externalUrl ? (
          <a
            href={externalUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-[--color-muted] hover:text-[--color-fg]"
          >
            <ExternalLink className="h-3 w-3" aria-hidden="true" /> source
          </a>
        ) : null}
      </div>
    </section>
  );
}
