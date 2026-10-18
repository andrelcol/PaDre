import type { ReactNode } from 'react'
import { Navigate } from 'react-router'

import { useSession } from '@/domains/identity/components/session.tsx'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useSession()

  if (loading) {
    return (
      <p
        className="px-6 py-16 text-sm text-muted-foreground"
        aria-live="polite"
      >
        Carregando sessão
      </p>
    )
  }

  if (!session) {
    return <Navigate to="/entrar" replace />
  }

  return children
}

export function GuestOnly({ children }: { children: ReactNode }) {
  const { session, loading } = useSession()

  if (loading) {
    return (
      <p
        className="px-6 py-16 text-sm text-muted-foreground"
        aria-live="polite"
      >
        Carregando sessão
      </p>
    )
  }

  if (session) {
    return <Navigate to="/perfil" replace />
  }

  return children
}
