import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SessionStateProvider } from '@/domains/identity/components/session.tsx'
import { LoginPage } from '@/pages/LoginPage.tsx'

const { signIn } = vi.hoisted(() => ({
  signIn: vi.fn(),
}))

vi.mock('@/domains/identity/api/auth.ts', () => ({
  signIn,
}))

function renderLogin() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const router = createMemoryRouter(
    [{ path: '/entrar', element: <LoginPage /> }],
    {
      initialEntries: ['/entrar'],
    },
  )

  render(
    <QueryClientProvider client={queryClient}>
      <SessionStateProvider value={{ session: null, loading: false }}>
        <RouterProvider router={router} />
      </SessionStateProvider>
    </QueryClientProvider>,
  )
}

describe('LoginPage', () => {
  beforeEach(() => {
    signIn.mockReset()
  })

  it('shows validation before calling the API', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(screen.getByText('Informe um e-mail válido.')).toBeVisible()
    expect(screen.getByText('Informe a senha.')).toBeVisible()
    expect(signIn).not.toHaveBeenCalled()
  })

  it('shows the authentication error', async () => {
    const user = userEvent.setup()
    signIn.mockRejectedValue(new Error('E-mail ou senha incorretos.'))
    renderLogin()

    await user.type(screen.getByLabelText('E-mail'), 'ana@padre.test')
    await user.type(screen.getByLabelText('Senha'), 'senha-segura')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'E-mail ou senha incorretos.',
    )
  })
})
