
import type { ButtonHTMLAttributes } from 'react';
import { Slot } from "@radix-ui/react-slot";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'link' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
};

export function Button({
  asChild = false,
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  const baseClasses =
    'inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-paper';

  const variantClasses = {
    primary:
      'border border-transparent bg-main-accent text-button-text shadow-sm hover:bg-main-accent/90',
    secondary:
      'border border-subtle-border bg-subtle-bg text-main-text shadow-sm hover:bg-highlight-bg',
    ghost: 'hover:bg-highlight-bg hover:text-main-text',
    outline:
      'border border-main-border bg-transparent shadow-sm hover:bg-highlight-bg',
    link: 'text-main-accent underline-offset-4 hover:underline',
    destructive:
      'bg-error-bg text-error-text shadow-sm hover:bg-error-bg/90',
  };

  const sizeClasses = {
    sm: 'h-9 rounded-md px-3',
    md: 'h-10 px-4 py-2',
    lg: 'h-11 rounded-md px-8',
  };

  return (
    <Comp
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    />
  );
}
