import type { ComponentProps } from 'react'

import { cn } from '@/shared/lib/utils.ts'

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-md border bg-background px-3 text-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
