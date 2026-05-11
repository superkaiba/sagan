import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function PageHeader({
  title,
  description,
  meta,
  actions,
  className,
}: {
  title: string;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-4 border-b border-[--color-border] pb-5', className)}>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-3xl font-bold tracking-[-0.035em] text-balance">{title}</h1>
          {meta ? <div className="text-sm text-[--color-muted]">{meta}</div> : null}
        </div>
        {description ? <div className="mt-1 max-w-[56rem] text-sm leading-6 text-[--color-muted]">{description}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
