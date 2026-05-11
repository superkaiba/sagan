import Link from 'next/link';
import { cn } from '@/lib/cn';

export function SegmentedControl({
  items,
  className,
}: {
  items: Array<{ label: string; href: string; active?: boolean; count?: number }>;
  className?: string;
}) {
  return (
    <div className={cn('inline-flex max-w-full overflow-x-auto border-b border-[--color-border]', className)}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? 'page' : undefined}
          className={cn(
            'inline-flex min-h-10 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-1.5 text-sm font-semibold transition-colors',
            item.active
              ? 'border-[--color-accent] text-[--color-fg]'
              : 'border-transparent text-[--color-muted] hover:bg-[--color-hover] hover:text-[--color-fg]',
          )}
        >
          <span>{item.label}</span>
          {typeof item.count === 'number' ? <span className="font-mono text-xs text-[--color-muted]">{item.count}</span> : null}
        </Link>
      ))}
    </div>
  );
}
