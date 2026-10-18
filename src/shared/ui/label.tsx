import type { ComponentProps } from 'react'

import { cn } from '@/shared/lib/utils.ts'

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return <label className={cn('text-sm font-medium', className)} {...props} />
}
