import type { ReactNode } from 'react'
import { Navigate, useSearchParams } from 'react-router'

import { useSession } from '@/domains/identity/components/session.tsx'
import { inviteReturnPath } from '@/domains/meetups/model/invite-link.ts'

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
  const [params] = useSearchParams()

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
    return (
      <Navigate
        to={inviteReturnPath(params.get('retorno')) ?? '/perfil'}
        replace
      />
    )
  }

  return children
}
