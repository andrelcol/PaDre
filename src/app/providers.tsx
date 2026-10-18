import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { AuthProvider } from '@/domains/identity/components/session.tsx'
import { queryClient } from './query-client.ts'

type AppProvidersProps = {
  children: ReactNode
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  )
}
