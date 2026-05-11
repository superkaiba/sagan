'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

const NAV: Array<{ label: string; href: string }> = [
  { label: 'Today', href: '/today' },
  { label: 'Tasks', href: '/tasks' },
  { label: 'Experiments', href: '/experiments' },
  { label: 'Clean Results', href: '/clean-results' },
  { label: 'Ideation', href: '/ideation' },
  { label: 'Projects', href: '/projects' },
  { label: 'Beliefs', href: '/beliefs' },
  { label: 'Knowledge', href: '/knowledge' },
  { label: 'Library', href: '/library' },
  { label: 'Agent', href: '/agent' },
  { label: 'Health', href: '/admin/health' },
  { label: 'Digests', href: '/digests' },
];

export function AppNav({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  return (
    <nav className={compact ? 'flex flex-1 gap-1 overflow-x-auto' : 'space-y-1'}>
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
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
