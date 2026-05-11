import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export function Panel({
  className,
  variant = 'default',
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  variant?: 'default' | 'subtle' | 'elevated' | 'urgent';
}) {
  return (
    <div
      className={cn(
        'rounded-[--radius-panel] border',
        variant === 'default' && 'border-[--color-border] bg-[--color-panel] shadow-[var(--shadow-inset)]',
        variant === 'subtle' && 'border-[--color-border] bg-[--color-surface-subtle] shadow-[var(--shadow-inset)]',
        variant === 'elevated' && 'border-[--color-border] bg-[--color-panel] shadow-[var(--shadow-lift)]',
        variant === 'urgent' && 'border-[--color-approval-border] bg-[--color-approval-bg] shadow-[var(--shadow-inset)]',
        className,
      )}
      {...props}
    />
  );
}
