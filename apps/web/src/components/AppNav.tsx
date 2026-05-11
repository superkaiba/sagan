'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

const NAV: Array<{ label: string; href: string; match: string[] }> = [
  { label: 'Today', href: '/today', match: ['/today', '/e/daily_log_entry'] },
  {
    label: 'Work',
    href: '/work',
    match: [
      '/work',
      '/tasks',
      '/projects',
      '/experiments',
      '/clean-results',
      '/ideation',
      '/e/project',
      '/e/experiment',
      '/e/clean_result',
      '/e/todo',
      '/e/project_narrative',
    ],
  },
  { label: 'Knowledge', href: '/knowledge', match: ['/knowledge', '/beliefs', '/library', '/e/belief', '/e/lit_item'] },
  { label: 'Agent', href: '/agent', match: ['/agent', '/e/run'] },
  { label: 'More', href: '/more', match: ['/more', '/admin/health', '/digests', '/mentor/updates', '/e/weekly_digest'] },
];

export function AppNav({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  return (
    <nav className={compact ? 'flex flex-1 gap-1 overflow-x-auto' : 'space-y-1'}>
      {NAV.map((item) => {
        const active = item.match.some((href) => pathname === href || pathname.startsWith(`${href}/`));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              compact
                ? 'rounded-md border border-transparent px-2 py-1 text-xs whitespace-nowrap'
                : 'block rounded-md border border-transparent px-3 py-2 text-sm',
              'text-[--color-muted] transition-colors hover:border-[--color-border] hover:bg-[--color-hover] hover:text-[--color-fg]',
              active && 'border-[--color-border] bg-[--color-bg] font-medium text-[--color-accent]',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
