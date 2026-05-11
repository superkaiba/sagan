import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Button, type ButtonVariant } from './button';

export function IconButton({
  label,
  children,
  variant = 'tertiary',
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  label: string;
  children: ReactNode;
  variant?: ButtonVariant;
}) {
  return (
    <Button aria-label={label} title={label} variant={variant} size="icon" {...props}>
      {children}
    </Button>
  );
}
