import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger' | 'quiet';
export type ButtonSize = 'sm' | 'md' | 'icon';

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'border-[--color-accent] bg-[--color-accent] text-[--color-accent-fg] shadow-[var(--shadow-inset)] hover:bg-[--color-accent-strong]',
  secondary:
    'border-[--color-border] bg-[--color-panel] text-[--color-fg] shadow-[var(--shadow-inset)] hover:bg-[--color-hover]',
  tertiary:
    'border-transparent bg-transparent text-[--color-muted] hover:bg-[--color-hover] hover:text-[--color-fg]',
  danger:
    'border-[--color-danger] bg-[--color-danger-bg] text-[--color-danger] hover:bg-[--color-danger-soft]',
  quiet:
    'border-transparent bg-transparent text-[--color-fg] hover:bg-[--color-hover]',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 py-1.5 text-xs',
  md: 'min-h-11 px-4 py-2 text-sm',
  icon: 'h-10 w-10 p-0',
};

export function buttonClassName({
  variant = 'secondary',
  size = 'md',
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-[--radius-control] border font-semibold leading-none transition-colors disabled:pointer-events-none disabled:opacity-50',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--color-focus]',
    variantClasses[variant],
    sizeClasses[size],
    className,
  );
}

export function Button({
  className,
  variant = 'secondary',
  size = 'md',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return <button type={type} className={buttonClassName({ variant, size, className })} {...props} />;
}
