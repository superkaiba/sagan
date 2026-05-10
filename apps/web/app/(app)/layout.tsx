import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { CommandPalette } from '@/components/CommandPalette';

const NAV: Array<{ label: string; href: string }> = [
  { label: 'Today', href: '/today' },
  { label: 'Tasks', href: '/tasks' },
  { label: 'Projects', href: '/projects' },
  { label: 'Beliefs', href: '/beliefs' },
  { label: 'Knowledge', href: '/knowledge' },
  { label: 'Library', href: '/library' },
  { label: 'Agent', href: '/agent' },
  { label: 'Digests', href: '/digests' },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <div className="min-h-screen md:grid md:grid-cols-[14rem_1fr]">
      {/* Mobile top-bar */}
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-[--color-border] bg-[--color-muted-bg] px-4 py-2 md:hidden">
        <p className="text-xs uppercase tracking-wide text-[--color-muted]">SAGAN</p>
        <nav className="flex flex-1 gap-1 overflow-x-auto">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-2 py-1 text-xs whitespace-nowrap hover:bg-[--color-bg]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <form action="/api/auth/logout" method="post">
          <button
            type="submit"
            className="text-[10px] uppercase tracking-wide text-[--color-muted] hover:text-[--color-fg]"
          >
            sign out
          </button>
        </form>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col border-r border-[--color-border] bg-[--color-muted-bg] p-4 gap-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-[--color-muted]">Sagan</p>
          <p className="text-sm font-medium truncate">{session.user.email}</p>
        </div>
        <nav className="space-y-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-md px-3 py-2 text-sm hover:bg-[--color-bg]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-[--color-muted]">
            Cmd-K to search
          </p>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="w-full rounded-md border border-[--color-border] px-3 py-2 text-xs text-[--color-muted] hover:text-[--color-fg]"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="p-4 md:p-6">{children}</main>
      <CommandPalette />
    </div>
  );
}
