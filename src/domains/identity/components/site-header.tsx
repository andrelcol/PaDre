import { useState } from 'react'
import {
  Link,
  NavLink,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router'
import { useQueryClient } from '@tanstack/react-query'

import { signOut } from '@/domains/identity/api/auth.ts'
import { useSession } from '@/domains/identity/components/session.tsx'
import {
  inviteAuthPath,
  inviteReturnPath,
} from '@/domains/meetups/model/invite-link.ts'
import { ThemeControl } from '@/shared/theme/theme-control.tsx'
import { Button, buttonClassName } from '@/shared/ui/button.tsx'
import { cn } from '@/shared/lib/utils.ts'

const memberLinks = [
  { to: '/', label: 'Início', end: true },
  { to: '/encontros', label: 'Encontros', end: false },
  { to: '/comunidades', label: 'Comunidades', end: false },
  { to: '/amigos', label: 'Amigos', end: false },
  { to: '/perfil', label: 'Meu perfil', end: false },
] as const

const extraLinks = [
  { to: '/locais', label: 'Locais' },
  { to: '/modalidades', label: 'Modalidades' },
] as const

export function SiteHeader() {
  const { session, loading } = useSession()
  const location = useLocation()
  const [params] = useSearchParams()
  const retorno =
    inviteReturnPath(location.pathname) ??
    inviteReturnPath(params.get('retorno'))
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

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex min-h-11 items-center rounded-full px-3 text-sm font-semibold',
      isActive
        ? 'bg-primary text-primary-foreground'
        : 'text-foreground hover:bg-secondary',
    )

  return (
    <>
      <header className="border-b bg-card/95 pt-[env(safe-area-inset-top,0px)] md:fixed md:inset-y-0 md:left-0 md:z-20 md:w-64 md:border-r md:border-b-0 md:pt-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:flex-col md:items-stretch md:px-4 md:py-6">
          <Link
            to="/"
            className="font-display text-2xl font-bold tracking-tight"
          >
            PaDre
          </Link>
          <p className="hidden text-sm text-muted-foreground md:block">
            Sports Club
          </p>
          <nav aria-label="Principal" className="hidden flex-col gap-1 md:flex">
            {session
              ? memberLinks.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={linkClass}
                  >
                    {item.label}
                  </NavLink>
                ))
              : null}
            {extraLinks
              .filter((item) => item.to !== '/locais' || session)
              .map((item) => (
                <NavLink key={item.to} to={item.to} className={linkClass}>
                  {item.label}
                </NavLink>
              ))}
            {!session && !loading ? (
              <NavLink to="/comunidades" className={linkClass}>
                Comunidades
              </NavLink>
            ) : null}
          </nav>
          <ThemeControl />
          <div className="hidden md:block">
            {loading ? (
              <span className="text-sm text-muted-foreground">Carregando</span>
            ) : session ? (
              <Button variant="secondary" onClick={() => void logout()}>
                Sair
              </Button>
            ) : (
              <div className="flex flex-col gap-2">
                <Link
                  to={inviteAuthPath('/entrar', retorno)}
                  className={buttonClassName('ghost')}
                >
                  Entrar
                </Link>
                <Link
                  to={inviteAuthPath('/cadastrar', retorno)}
                  className={buttonClassName('primary')}
                >
                  Criar conta
                </Link>
              </div>
            )}
            {error ? (
              <p role="alert" className="mt-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          {session ? (
            <nav aria-label="Atalhos" className="flex gap-2 md:hidden">
              <Link to="/locais" className={buttonClassName('ghost')}>
                Locais
              </Link>
              <Link to="/modalidades" className={buttonClassName('ghost')}>
                Modalidades
              </Link>
            </nav>
          ) : null}
          <div className="md:hidden">
            {loading ? null : session ? (
              <Button variant="secondary" onClick={() => void logout()}>
                Sair
              </Button>
            ) : (
              <Link
                to={inviteAuthPath('/entrar', retorno)}
                className={buttonClassName('primary')}
              >
                Entrar
              </Link>
            )}
          </div>
        </div>
      </header>
      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-20 border-t bg-card px-1 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom,0px))] md:hidden"
      >
        <ul className="grid grid-cols-5 gap-1">
          {(session
            ? memberLinks
            : [
                { to: '/', label: 'Início', end: true },
                { to: '/comunidades', label: 'Comunidades', end: false },
                { to: '/modalidades', label: 'Modalidades', end: false },
                {
                  to: inviteAuthPath('/entrar', retorno),
                  label: 'Entrar',
                  end: false,
                },
                {
                  to: inviteAuthPath('/cadastrar', retorno),
                  label: 'Conta',
                  end: false,
                },
              ]
          ).map((item) => (
            <li key={item.label} className="min-w-0">
              <NavLink
                to={item.to}
                end={'end' in item ? item.end : false}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-11 min-w-0 items-center justify-center rounded-xl px-0.5 text-center text-[11px] font-semibold leading-tight',
                    isActive ? 'bg-primary text-primary-foreground' : '',
                  )
                }
              >
                {item.label === 'Meu perfil' ? 'Perfil' : item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </>
  )
}
