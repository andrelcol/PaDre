import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router'

import {
  GuestOnly,
  RequireAuth,
} from '@/domains/identity/components/guards.tsx'
import { SessionStateProvider } from '@/domains/identity/components/session.tsx'

const session = {
  user: { id: '11111111-1111-4111-8111-111111111111' },
} as Session

function renderAt(
  path: string,
  routes: { path: string; element: ReactNode }[],
  state: { session: Session | null; loading: boolean },
) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <SessionStateProvider value={state}>
      <RouterProvider router={router} />
    </SessionStateProvider>,
  )
}

describe('auth guards', () => {
  it('keeps a private page away from an anonymous visitor', () => {
    renderAt(
      '/perfil',
      [
        {
          path: '/perfil',
          element: (
            <RequireAuth>
              <p>área privada</p>
            </RequireAuth>
          ),
        },
        { path: '/entrar', element: <p>tela de login</p> },
      ],
      { session: null, loading: false },
    )

    expect(screen.getByText('tela de login')).toBeVisible()
  })

  it('shows the private page to an authenticated person', () => {
    renderAt(
      '/perfil',
      [
        {
          path: '/perfil',
          element: (
            <RequireAuth>
              <p>área privada</p>
            </RequireAuth>
          ),
        },
      ],
      { session, loading: false },
    )

    expect(screen.getByText('área privada')).toBeVisible()
  })

  it('does not send an authenticated person back to login', () => {
    renderAt(
      '/entrar',
      [
        {
          path: '/entrar',
          element: (
            <GuestOnly>
              <p>tela de login</p>
            </GuestOnly>
          ),
        },
        { path: '/perfil', element: <p>área privada</p> },
      ],
      { session, loading: false },
    )

    expect(screen.getByText('área privada')).toBeVisible()
  })

  it('waits for the session before choosing a page', () => {
    renderAt(
      '/perfil',
      [
        {
          path: '/perfil',
          element: (
            <RequireAuth>
              <p>área privada</p>
            </RequireAuth>
          ),
        },
      ],
      { session: null, loading: true },
    )

    expect(screen.getByText('Carregando sessão')).toBeVisible()
  })
})
