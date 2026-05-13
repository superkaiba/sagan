import { ExternalLink, AlertTriangle, Sparkles } from 'lucide-react';
import { Markdown } from './Markdown';

const TOPIC_LABELS: Record<string, { label: string; tone: 'accent' | 'muted' }> = {
  current_project: { label: 'Related to current project', tone: 'accent' },
  general_safety: { label: 'General AI safety', tone: 'muted' },
  general_ai: { label: 'General AI / ML', tone: 'muted' },
  cognitive_science: { label: 'Cognitive science', tone: 'muted' },
  neuroscience: { label: 'Neuroscience', tone: 'muted' },
  other: { label: 'Other', tone: 'muted' },
};

function authorsToList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((a) => {
        if (typeof a === 'string') return a.trim();
        if (a && typeof a === 'object' && 'name' in a) return String((a as { name?: unknown }).name ?? '').trim();
        return '';
      })
      .filter(Boolean);
  }
  if (typeof value === 'string') return [value.trim()];
  return [];
}

function cleanAbstract(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // arXiv RSS prefixes abstracts with "arXiv:2605.xxx Announce Type: ... Abstract: ".
  // Strip that boilerplate so the dropdown shows readable text.
  const stripped = raw
    .replace(/^arXiv:\S+\s*Announce Type:[^\n]*\n?/i, '')
    .replace(/^Abstract:\s*/i, '')
    .trim();
  return stripped || null;
}

function recencyLabel(value: string | Date | null): string {
  if (!value) return 'Unknown date';
  const dateStr = typeof value === 'string' ? value : value.toISOString().slice(0, 10);
  const t = new Date(`${dateStr}T00:00:00Z`).getTime();
  if (Number.isNaN(t)) return dateStr;
  const days = Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000));
  if (days <= 0) return `${dateStr} (today)`;
  if (days === 1) return `${dateStr} (yesterday)`;
  if (days < 30) return `${dateStr} (${days}d ago)`;
  if (days < 365) return `${dateStr} (${Math.round(days / 30)}mo ago)`;
  return `${dateStr} (${(days / 365).toFixed(1)}y ago)`;
}

export interface LitPaperFields {
  id: string;
  title: string;
  authors: unknown;
  releasedOn: string | Date | null;
  abstract: string | null;
  summaryMd: string | null;
  relevanceReasonMd: string | null;
  threatReasonMd: string | null;
  topic: string | null;
  url: string | null;
  pdfUrl: string | null;
  arxivId: string | null;
  doi: string | null;
}

export function LiteraturePaperMain({ paper }: { paper: LitPaperFields }) {
  const summary = paper.summaryMd?.trim();
  const abstract = cleanAbstract(paper.abstract);
  return (
    <section className="space-y-4">
      {summary ? (
        <article className="rounded-lg border border-[--color-border] bg-[--color-panel] p-5 shadow-[var(--shadow-inset)]">
          <header className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[--color-accent]">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            AI summary
          </header>
          <div className="prose prose-sm max-w-none text-[--color-fg]">
            <Markdown>{summary}</Markdown>
          </div>
        </article>
      ) : (
        <article className="rounded-lg border border-dashed border-[--color-border] bg-[--color-muted-bg] p-5 text-sm text-[--color-muted]">
          No AI summary yet. The daily literature job will write one on its next run, or use “Ask Claude about this paper” below to request one.
        </article>
      )}

      {paper.threatReasonMd ? (
        <aside className="flex gap-2 rounded-lg border border-[--color-warning-border] bg-[--color-warning-bg] p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[--color-warning]" aria-hidden="true" />
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[--color-warning]">Caveat</div>
            <div className="mt-1 text-[--color-fg]">
              <Markdown>{paper.threatReasonMd}</Markdown>
            </div>
          </div>
        </aside>
      ) : null}

      {abstract ? (
        <details className="rounded-lg border border-[--color-border] bg-[--color-muted-bg]">
          <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-[--color-muted] hover:text-[--color-fg]">
            Abstract
          </summary>
          <div className="border-t border-[--color-border] px-4 py-3 text-sm leading-relaxed text-[--color-fg]/90 whitespace-pre-wrap">
            {abstract}
          </div>
        </details>
      ) : null}
    </section>
  );
}

export function LiteraturePaperSide({ paper }: { paper: LitPaperFields }) {
  const authors = authorsToList(paper.authors);
  const externalUrl = paper.url ?? (paper.arxivId ? `https://arxiv.org/abs/${paper.arxivId}` : null);
  const pdfUrl =
    paper.pdfUrl ?? (paper.arxivId ? `https://arxiv.org/pdf/${paper.arxivId}` : null);
  const topicInfo = TOPIC_LABELS[paper.topic ?? 'other'] ?? TOPIC_LABELS.other!;
  return (
    <section className="rounded-lg border border-[--color-border] bg-[--color-panel] text-sm shadow-[var(--shadow-inset)]">
      <header className="border-b border-[--color-border] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[--color-muted]">
        About this paper
      </header>
      <dl className="divide-y divide-[--color-border]">
        <div className="px-4 py-3">
          <dt className="text-[10px] uppercase tracking-[0.18em] text-[--color-muted]">Authors</dt>
          <dd className="mt-1 text-[--color-fg]">
            {authors.length > 0 ? authors.join(', ') : <span className="text-[--color-muted]">Unknown</span>}
          </dd>
        </div>
        <div className="px-4 py-3">
          <dt className="text-[10px] uppercase tracking-[0.18em] text-[--color-muted]">Released</dt>
          <dd className="mt-1 text-[--color-fg]">{recencyLabel(paper.releasedOn)}</dd>
        </div>
        <div className="px-4 py-3">
          <dt className="text-[10px] uppercase tracking-[0.18em] text-[--color-muted]">Topic</dt>
          <dd className="mt-1">
            <span
              className={
                topicInfo.tone === 'accent'
                  ? 'inline-flex items-center gap-1 rounded-full border border-[--color-accent]/40 bg-[--color-accent]/10 px-2 py-0.5 text-xs font-medium text-[--color-accent]'
                  : 'inline-flex items-center gap-1 rounded-full border border-[--color-border] bg-[--color-bg] px-2 py-0.5 text-xs font-medium text-[--color-fg]/85'
              }
            >
              {topicInfo.tone === 'accent' ? <Sparkles className="h-3 w-3" aria-hidden="true" /> : null}
              {topicInfo.label}
            </span>
          </dd>
        </div>
        {paper.relevanceReasonMd ? (
          <div className="px-4 py-3">
            <dt className="text-[10px] uppercase tracking-[0.18em] text-[--color-muted]">Relation to my work</dt>
            <dd className="prose prose-sm mt-1 max-w-none text-[--color-fg]/90">
              <Markdown>{paper.relevanceReasonMd}</Markdown>
            </dd>
          </div>
        ) : null}
        {paper.arxivId ? (
          <div className="px-4 py-3">
            <dt className="text-[10px] uppercase tracking-[0.18em] text-[--color-muted]">arXiv</dt>
            <dd className="mt-1 font-mono text-xs text-[--color-fg]">{paper.arxivId}</dd>
          </div>
        ) : null}
        {paper.doi ? (
          <div className="px-4 py-3">
            <dt className="text-[10px] uppercase tracking-[0.18em] text-[--color-muted]">DOI</dt>
            <dd className="mt-1 font-mono text-xs text-[--color-fg] break-all">{paper.doi}</dd>
          </div>
        ) : null}
      </dl>
      {(externalUrl || pdfUrl) ? (
        <footer className="flex flex-wrap items-center gap-3 border-t border-[--color-border] px-4 py-3 text-xs">
          {externalUrl ? (
            <a
              href={externalUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 font-semibold text-[--color-accent] hover:underline"
            >
              <ExternalLink className="h-3 w-3" aria-hidden="true" /> Open paper
            </a>
          ) : null}
          {pdfUrl ? (
            <a
              href={pdfUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-[--color-muted] hover:text-[--color-fg]"
            >
              <ExternalLink className="h-3 w-3" aria-hidden="true" /> PDF
            </a>
          ) : null}
        </footer>
      ) : null}
    </section>
  );
}
