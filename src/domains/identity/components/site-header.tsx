import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'

import { signOut } from '@/domains/identity/api/auth.ts'
import { useSession } from '@/domains/identity/components/session.tsx'
import { Button, buttonClassName } from '@/shared/ui/button.tsx'

export function SiteHeader() {
  const { session, loading } = useSession()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')

  async function logout() {
    setError('')
    try {
      await signOut()
      queryClient.clear()
      await navigate('/')
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Não foi possível sair.',
      )
    }
  }

  return (
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-lg font-semibold">
            PaDre
          </Link>
          <Link to="/modalidades" className="text-sm text-muted-foreground">
            Modalidades
          </Link>
        </div>
        <nav aria-label="Conta" className="flex flex-wrap items-center gap-2">
          {loading ? (
            <span className="text-sm text-muted-foreground">Carregando</span>
          ) : session ? (
            <>
              <Link to="/amigos" className={buttonClassName('ghost')}>
                Amigos
              </Link>
              <Link to="/perfil" className={buttonClassName('ghost')}>
                Meu perfil
              </Link>
              <Button variant="secondary" onClick={() => void logout()}>
                Sair
              </Button>
            </>
          ) : (
            <>
              <Link to="/entrar" className={buttonClassName('ghost')}>
                Entrar
              </Link>
              <Link to="/cadastrar" className={buttonClassName('primary')}>
                Criar conta
              </Link>
            </>
          )}
        </nav>
      </div>
      {error ? (
        <p role="alert" className="px-6 pb-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </header>
  )
}
