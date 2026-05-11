import { getMentorWeeklyUpdate } from '@/lib/mentor-results-data';
import { getSession } from '@/lib/auth';
import { MentorResultsBoard } from './MentorResultsBoard';

function formatDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

export default async function MentorUpdatesPage() {
  const update = getMentorWeeklyUpdate();
  const session = await getSession();
  const generatedDate = formatDate(update.generatedAt);

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 md:py-10">
      <header className="border-b border-[--color-border] pb-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{update.title}</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[--color-muted]">
              {update.issueCount} Useful-column results from {update.sourceRepo}.
            </p>
          </div>
          <div className="text-left text-xs leading-5 text-[--color-muted] md:text-right">
            <p>Source column: {update.sourceColumn}</p>
            {generatedDate ? <p>Refreshed {generatedDate}</p> : null}
          </div>
        </div>
      </header>

      <MentorResultsBoard results={update.results} signedIn={Boolean(session)} />

      <footer className="border-t border-[--color-border] pt-4 text-xs text-[--color-muted]">
        Sagan mentor update
      </footer>
    </main>
  );
}

export const metadata = {
  robots: { index: false, follow: false },
};
