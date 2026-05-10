import { getMentorCleanResults } from '@/lib/github-mentor-results';
import { Markdown } from '@/components/Markdown';

export const dynamic = 'force-dynamic';
export const revalidate = 300;

const STATUS_STYLES: Record<string, { bg: string; label: string }> = {
  Useful: { bg: 'oklch(0.86 0.13 150)', label: 'useful' },
  'Not useful': { bg: 'oklch(0.86 0.13 25)', label: 'not useful' },
};

export default async function MentorUpdatesPage() {
  const results = await getMentorCleanResults().catch(() => []);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-[--color-muted]">Mentor view</p>
        <h1 className="text-2xl font-semibold tracking-tight">Recent results</h1>
        <p className="text-sm text-[--color-muted]">
          Sourced from the project board. Updated every 5 minutes.
        </p>
      </header>

      {results.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[--color-border] p-6 text-sm text-[--color-muted]">
          No results yet — the GitHub project board may be empty or unreachable.
        </p>
      ) : (
        <ol className="space-y-4">
          {results.map((r) => {
            const style = STATUS_STYLES[r.statusName] ?? STATUS_STYLES.Useful!;
            return (
              <li
                key={r.id}
                className="rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-5 space-y-3"
              >
                <div className="flex flex-wrap items-baseline gap-2 text-xs">
                  <span
                    className="rounded-full px-2 py-0.5 font-medium uppercase tracking-wide"
                    style={{ background: style.bg, color: 'oklch(0.20 0.04 270)' }}
                  >
                    {style.label}
                  </span>
                  {r.confidence ? (
                    <span className="text-[--color-muted]">{r.confidence} confidence</span>
                  ) : null}
                  <time className="ml-auto text-[--color-muted]">
                    {new Date(r.doneAt).toLocaleDateString()}
                  </time>
                </div>
                <h2 className="text-lg font-medium">{r.title}</h2>
                <Markdown>{r.body}</Markdown>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-xs text-[--color-accent] hover:underline"
                >
                  GitHub issue #{r.number} ↗
                </a>
              </li>
            );
          })}
        </ol>
      )}

      <footer className="border-t border-[--color-border] pt-4 text-[10px] uppercase tracking-wide text-[--color-muted]">
        EPS Research Dashboard
      </footer>
    </main>
  );
}

export const metadata = {
  robots: { index: false, follow: false },
};
