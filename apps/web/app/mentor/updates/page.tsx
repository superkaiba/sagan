import { getMentorCleanResults } from '@/lib/mentor-results-data';
import { getSession } from '@/lib/auth';
import { MentorResultsBoard } from './MentorResultsBoard';

export default async function MentorUpdatesPage() {
  const results = getMentorCleanResults();
  const session = await getSession();

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <header className="space-y-1">
        <p className="text-xs font-medium text-[--color-muted]">Mentor view</p>
        <h1 className="text-2xl font-semibold tracking-tight">Recent results</h1>
        <p className="text-sm text-[--color-muted]">
          Recent useful results. Open a card to comment or ask Claude/Codex.
        </p>
      </header>

      <MentorResultsBoard results={results} signedIn={Boolean(session)} />

      <footer className="border-t border-[--color-border] pt-4 text-[10px] uppercase tracking-wide text-[--color-muted]">
        Sagan
      </footer>
    </main>
  );
}

export const metadata = {
  robots: { index: false, follow: false },
};
