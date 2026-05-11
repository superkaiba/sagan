'use client';

import { useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ExternalLink, MessageSquare, X } from 'lucide-react';
import { Comments } from '@/components/Comments';
import { Markdown, normalizeGitHubMarkdown } from '@/components/Markdown';
import type { CleanResult } from '@/lib/mentor-results-data';

const STATUS_STYLES: Record<string, { bg: string; label: string }> = {
  Useful: { bg: 'oklch(0.86 0.13 150)', label: 'useful' },
  'Not useful': { bg: 'oklch(0.86 0.13 25)', label: 'not useful' },
};

const PRESENTATION_ISSUE_NUMBERS = [186, 281, 295, 276, 224, 284, 237, 337];
const PRESENTATION_ISSUE_SET = new Set(PRESENTATION_ISSUE_NUMBERS);

function excerptText(value: string) {
  return normalizeGitHubMarkdown(value)
    .replace(/!\[[^\]]*]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/[`*_>#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function MentorResultsBoard({
  results,
  signedIn,
}: {
  results: CleanResult[];
  signedIn: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeId = searchParams.get('result');
  const active = useMemo(
    () => results.find((result) => result.id === activeId) ?? null,
    [activeId, results],
  );

  useEffect(() => {
    if (!active) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeOverlay();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
    // closeOverlay only depends on router.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  function openOverlay(id: string) {
    router.push(`/mentor/updates?result=${encodeURIComponent(id)}`, { scroll: false });
  }

  function closeOverlay() {
    router.push('/mentor/updates', { scroll: false });
  }

  const presentationResults = PRESENTATION_ISSUE_NUMBERS.map((number) =>
    results.find((result) => result.number === number),
  ).filter((result): result is CleanResult => Boolean(result));
  const otherResults = results.filter((result) => !PRESENTATION_ISSUE_SET.has(result.number));

  if (results.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-[--color-border] p-6 text-sm text-[--color-muted]">
        No results yet.
      </p>
    );
  }

  function renderCards(sectionResults: CleanResult[]) {
    return (
      <ol className="grid gap-3 md:grid-cols-2">
        {sectionResults.map((result) => {
          const style = STATUS_STYLES[result.statusName] ?? STATUS_STYLES.Useful!;
          return (
            <li key={result.id}>
              <button
                type="button"
                data-clickable="true"
                aria-label={`Open details for GitHub issue #${result.number}`}
                onClick={() => openOverlay(result.id)}
                className="group flex min-h-[14rem] w-full cursor-pointer flex-col border-2 border-[--color-border] bg-[--color-panel] p-4 text-left hover:border-[--color-accent] hover:bg-[--color-hover] focus:outline-none focus:ring-2 focus:ring-[--color-focus]"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className="px-2 py-0.5 font-medium"
                    style={{ background: style.bg, color: 'oklch(0.20 0.04 270)' }}
                  >
                    {style.label}
                  </span>
                  {result.confidence ? (
                    <span className="text-[--color-muted]">{result.confidence} confidence</span>
                  ) : null}
                  <time className="ml-auto text-[--color-muted]">
                    {new Date(result.doneAt).toLocaleDateString()}
                  </time>
                </div>
                <h2 className="mt-3 line-clamp-3 text-base font-medium leading-snug">{result.title}</h2>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-[--color-muted]">
                  {excerptText(result.excerpt)}
                </p>
                <div className="mt-auto flex items-center justify-between gap-3 border-t border-[--color-border] pt-3 text-xs text-[--color-muted] group-hover:border-[--color-accent]">
                  <span>Issue #{result.number}</span>
                  <span className="inline-flex min-h-8 items-center gap-1 border border-[--color-accent] bg-[--color-accent] px-2.5 py-1 font-semibold text-[--color-accent-fg]">
                    Open details
                    <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <>
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3 border-b border-[--color-border] pb-2">
          <h2 className="text-base font-semibold">Present</h2>
          <p className="text-xs text-[--color-muted]">{presentationResults.length} cards</p>
        </div>
        {renderCards(presentationResults)}
      </section>

      {otherResults.length > 0 ? (
        <section className="space-y-3 pt-5">
          <div className="flex items-baseline justify-between gap-3 border-b border-[--color-border] pb-2">
            <h2 className="text-base font-semibold">Other useful results</h2>
            <p className="text-xs text-[--color-muted]">{otherResults.length} cards</p>
          </div>
          {renderCards(otherResults)}
        </section>
      ) : null}

      {active ? (
        <div
          className="fixed inset-0 z-50 p-3 md:p-6"
          role="presentation"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.62)' }}
          onMouseDown={closeOverlay}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={active.title}
            className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-lg border border-[--color-border] text-[--color-fg] shadow-lg"
            style={{ backgroundColor: 'var(--color-bg)', opacity: 1 }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header
              className="flex items-start justify-between gap-4 border-b border-[--color-border] px-4 py-4 md:px-6"
              style={{ backgroundColor: 'var(--color-muted-bg)' }}
            >
              <div className="min-w-0">
                <h2 className="max-w-4xl text-base font-semibold leading-snug md:text-lg">
                  {active.title}
                </h2>
                <p className="mt-1 text-xs text-[--color-muted]">Useful issue #{active.number}</p>
              </div>
              <button
                type="button"
                onClick={closeOverlay}
                aria-label="Close overlay"
                className="rounded-md border border-[--color-border] p-1.5 text-[--color-muted] hover:bg-[--color-hover] hover:text-[--color-fg]"
                style={{ backgroundColor: 'var(--color-bg)' }}
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </header>

            <div className="grid min-h-0 flex-1 gap-0 overflow-hidden lg:grid-cols-[minmax(0,1fr)_22rem]">
              <main className="min-h-0 overflow-y-auto p-4 md:p-6">
                <div className="mb-4 flex flex-wrap gap-2 text-xs">
                  <a
                    href={active.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-8 items-center gap-1 border border-[--color-border] px-2 py-1 font-medium hover:bg-[--color-hover]"
                  >
                    GitHub issue
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                </div>
                <Markdown>{active.body}</Markdown>
              </main>

              <aside className="min-h-0 overflow-y-auto border-t border-[--color-border] p-4 lg:border-l lg:border-t-0">
                {signedIn ? (
                  <Comments entityKind="clean_result" entityId={active.id} />
                ) : (
                  <div className="rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-4 text-sm">
                    <p className="text-[--color-muted]">Sign in to comment or ask Claude/Codex about this result.</p>
                    <a
                      href={`/api/auth/google/start?signup=1&next=${encodeURIComponent(`/mentor/updates?result=${active.id}`)}`}
                      className="mt-3 inline-block rounded-md bg-[--color-accent] px-3 py-1.5 text-xs font-medium text-[--color-accent-fg]"
                    >
                      Sign in with Google
                    </a>
                  </div>
                )}
              </aside>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
