import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { CommandPalette } from '@/components/CommandPalette';
import { AppNav } from '@/components/AppNav';
import { ThemeControl } from '@/components/ThemeControl';

export default async function AppLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal?: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <div className="min-h-screen md:grid md:grid-cols-[15rem_1fr]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-[--color-accent] focus:px-3 focus:py-2 focus:text-sm focus:text-[--color-accent-fg]"
      >
        Skip to content
      </a>
      {/* Mobile top-bar */}
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-[--color-border] bg-[--color-muted-bg] px-4 py-2 md:hidden">
        <p className="text-xs font-semibold text-[--color-muted]">Sagan</p>
        <AppNav compact />
        <ThemeControl compact />
        <form action="/api/auth/logout" method="post">
          <button
            type="submit"
            className="rounded-md border border-[--color-border] px-2 py-1 text-[10px] text-[--color-muted] hover:bg-[--color-hover] hover:text-[--color-fg]"
          >
            sign out
          </button>
        </form>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden border-r border-[--color-border] bg-[--color-muted-bg] p-4 md:flex md:flex-col gap-5">
        <div>
          <p className="text-xs font-semibold text-[--color-muted]">Sagan</p>
          <p className="text-sm font-medium truncate">{session.user.email}</p>
        </div>
        <AppNav />
        <div className="mt-auto space-y-2">
          <ThemeControl />
          <p className="text-[10px] uppercase tracking-wide text-[--color-muted]">
            Cmd-K to search
          </p>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="w-full rounded-md border border-[--color-border] bg-[--color-bg] px-3 py-2 text-xs text-[--color-muted] hover:bg-[--color-hover] hover:text-[--color-fg]"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main id="main-content" className="mx-auto w-full max-w-[88rem] p-4 md:p-6">
        {children}
      </main>
      {modal}
      <CommandPalette />
    </div>
  );
}
