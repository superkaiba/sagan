'use client';

import { useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { X } from 'lucide-react';
import { Comments } from '@/components/Comments';
import { Markdown } from '@/components/Markdown';
import { StatusBadge } from '@/components/ui';

export interface MentorDailyLogEntry {
  id: string;
  day: string;
  kind: string;
  bodyMd: string;
  entityKind: string | null;
  entityId: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export function MentorDailyLogBoard({
  date,
  entries,
  signedIn,
}: {
  date: string;
  entries: MentorDailyLogEntry[];
  signedIn: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeId = searchParams.get('entry');
  const active = useMemo(
    () => entries.find((entry) => entry.id === activeId) ?? null,
    [activeId, entries],
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
    // closeOverlay only depends on router/date.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  function openOverlay(id: string) {
    router.push(`/mentor/daily/${date}?entry=${encodeURIComponent(id)}`, { scroll: false });
  }

  function closeOverlay() {
    router.push(`/mentor/daily/${date}`, { scroll: false });
  }

  if (entries.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-[--color-border] p-6 text-sm text-[--color-muted]">
        No clean results were marked for this day.
      </p>
    );
  }

  return (
    <>
      <ol
        className="mentor-clean-log-list divide-y divide-[--color-border] rounded-lg border border-[--color-border] bg-[--color-panel]"
        style={{ backgroundColor: 'var(--color-panel)' }}
      >
        {entries.map((entry, index) => (
          <li key={entry.id}>
            <button
              type="button"
              data-clickable="true"
              onClick={() => openOverlay(entry.id)}
              className="mentor-clean-log-row group grid w-full gap-2 p-3 text-left text-sm hover:bg-[--color-muted-bg] focus:outline-none focus:ring-2 focus:ring-[--color-focus] md:grid-cols-[7rem_minmax(0,1fr)_auto] md:items-start"
            >
              <div className="flex items-center gap-2 md:block">
                <StatusBadge status="clean_result" label={`result ${index + 1}`} />
                <time className="text-xs text-[--color-muted] md:mt-2 md:block">
                  {new Date(entry.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </div>
              <div className="min-w-0 rounded-md px-1 -mx-1">
                <Markdown className="line-clamp-4 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0">
                  {entry.bodyMd}
                </Markdown>
              </div>
              <span className="justify-self-start rounded-md border border-[--color-border] bg-[--color-bg] px-2 py-1 text-xs text-[--color-muted] md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:group-focus-visible:opacity-100">
                open
              </span>
            </button>
          </li>
        ))}
      </ol>

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
            aria-label={titleFromMarkdown(active.bodyMd)}
            className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-lg border border-[--color-border] bg-[--color-bg] text-[--color-fg] shadow-lg"
            style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-fg)' }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header
              className="flex items-center justify-between gap-3 border-b border-[--color-border] bg-[--color-muted-bg] px-4 py-3"
              style={{ backgroundColor: 'var(--color-muted-bg)' }}
            >
              <div className="min-w-0">
                <p className="text-xs text-[--color-muted]">Clean log · {active.day}</p>
                <h2 className="truncate text-sm font-medium">{titleFromMarkdown(active.bodyMd)}</h2>
              </div>
              <button
                type="button"
                onClick={closeOverlay}
                aria-label="Close overlay"
                className="rounded-md border border-[--color-border] bg-[--color-bg] p-1.5 text-[--color-muted] hover:bg-[--color-hover] hover:text-[--color-fg]"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </header>

            <div className="grid min-h-0 flex-1 gap-0 overflow-hidden lg:grid-cols-[minmax(0,1fr)_22rem]">
              <main className="min-h-0 overflow-y-auto p-4 md:p-6">
                <div className="mb-4 flex flex-wrap gap-2 text-xs">
                  <a
                    href={`/e/daily_log_entry/${active.id}`}
                    className="rounded-md border border-[--color-border] px-2 py-1 hover:bg-[--color-hover]"
                  >
                    Dashboard version
                  </a>
                  <a
                    href={`/mentor/daily/${date}?entry=${active.id}`}
                    className="rounded-md border border-[--color-border] px-2 py-1 hover:bg-[--color-hover]"
                  >
                    Shared link
                  </a>
                  {active.entityKind === 'clean_result' && active.entityId ? (
                    <a
                      href={`/clean-results/${active.entityId}`}
                      className="rounded-md border border-[--color-border] px-2 py-1 hover:bg-[--color-hover]"
                    >
                      Clean result record
                    </a>
                  ) : null}
                </div>
                <Markdown>{active.bodyMd}</Markdown>
              </main>

              <aside className="min-h-0 overflow-y-auto border-t border-[--color-border] p-4 lg:border-l lg:border-t-0">
                {signedIn ? (
                  <Comments entityKind="daily_log_entry" entityId={active.id} />
                ) : (
                  <div className="rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-4 text-sm">
                    <p className="text-[--color-muted]">Sign in to comment or ask Claude/Codex about this log.</p>
                    <a
                      href={`/api/auth/google/start?signup=1&next=${encodeURIComponent(`/mentor/daily/${date}?entry=${active.id}`)}`}
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

function titleFromMarkdown(markdown: string) {
  const firstLine = markdown
    .split('\n')
    .map((line) => cleanMarkdownText(line))
    .find(Boolean);
  if (!firstLine) return 'Clean result';
  return truncate(firstLine, 96);
}

function summaryFromMarkdown(markdown: string) {
  const text = cleanMarkdownText(markdown);
  if (!text) return 'Open to read, comment, or ask Claude/Codex.';
  return truncate(text, 190);
}

function cleanMarkdownText(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/[*_~>#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text: string, maxLength: number) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}...`;
}
