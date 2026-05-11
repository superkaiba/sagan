import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function ListRow({
  href,
  leading,
  title,
  detail,
  meta,
  trailing,
  className,
}: {
  href?: string;
  leading?: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  const content = (
    <>
      {leading ? <div className="mt-0.5 shrink-0 text-[--color-muted]">{leading}</div> : null}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="min-w-0 truncate text-sm font-medium">{title}</h3>
          {meta ? <div className="shrink-0 text-xs text-[--color-muted]">{meta}</div> : null}
        </div>
        {detail ? <div className="mt-1 line-clamp-2 text-sm leading-5 text-[--color-muted]">{detail}</div> : null}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </>
  );

  const classes = cn(
    'flex min-h-14 items-start gap-3 border-l-2 border-transparent px-4 py-3 transition-colors',
    href && 'hover:bg-[--color-hover]',
    className,
  );

  if (!href) return <div className={classes}>{content}</div>;
  return (
    <Link href={href} data-clickable="true" className={classes}>
      {content}
    </Link>
  );
}
