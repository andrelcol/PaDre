import type { ComponentProps } from 'react'

import { cn } from '@/shared/lib/utils.ts'

const variants = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  secondary:
    'border bg-background hover:bg-accent hover:text-accent-foreground',
  ghost: 'hover:bg-accent hover:text-accent-foreground',
} as const

type ButtonProps = ComponentProps<'button'> & {
  variant?: keyof typeof variants
}

// Shared with links that should look like buttons.
// eslint-disable-next-line react-refresh/only-export-components
export function buttonClassName(
  variant: keyof typeof variants = 'primary',
  className?: string,
) {
  return cn(
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
    variants[variant],
    className,
  )
}

export function Button({
  className,
  variant = 'primary',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClassName(variant, className)}
      {...props}
    />
  )
}
