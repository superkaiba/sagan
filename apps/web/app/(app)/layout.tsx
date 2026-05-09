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
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <div className="min-h-screen grid grid-cols-[14rem_1fr]">
      <aside className="border-r border-[--color-border] bg-[--color-muted-bg] p-4 space-y-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-[--color-muted]">EPS Research</p>
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
        <form action="/api/auth/logout" method="post" className="pt-4">
          <button
            formAction="/api/auth/logout"
            className="w-full rounded-md border border-[--color-border] px-3 py-2 text-xs text-[--color-muted] hover:text-[--color-fg]"
          >
            Sign out
          </button>
        </form>
      </aside>
      <main className="p-6">{children}</main>
      <CommandPalette />
    </div>
  );
}
