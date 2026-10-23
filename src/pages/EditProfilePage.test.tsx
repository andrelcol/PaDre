import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SessionStateProvider } from '@/domains/identity/components/session.tsx'
import { EditProfilePage } from '@/pages/EditProfilePage.tsx'

const { getOwnProfile, updateOwnProfile, getOwnPersonalDetails } = vi.hoisted(
  () => ({
    getOwnProfile: vi.fn(),
    updateOwnProfile: vi.fn(),
    getOwnPersonalDetails: vi.fn(),
  }),
)

vi.mock('@/domains/identity/api/profile.ts', () => ({
  getOwnProfile,
  updateOwnProfile,
  getOwnPersonalDetails,
}))

const userId = '11111111-1111-4111-8111-111111111111'
const session = { user: { id: userId, email: 'ana@padre.test' } } as Session

function renderEditor() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const router = createMemoryRouter(
    [
      { path: '/perfil/editar', element: <EditProfilePage /> },
      { path: '/perfil', element: <p>perfil salvo</p> },
    ],
    { initialEntries: ['/perfil/editar'] },
  )

  render(
    <QueryClientProvider client={queryClient}>
      <SessionStateProvider value={{ session, loading: false }}>
        <RouterProvider router={router} />
      </SessionStateProvider>
    </QueryClientProvider>,
  )
}

describe('EditProfilePage', () => {
  beforeEach(() => {
    getOwnProfile.mockReset()
    updateOwnProfile.mockReset()
    getOwnPersonalDetails.mockReset()
    getOwnPersonalDetails.mockResolvedValue({
      height_cm: null,
      sex: null,
      show_height: false,
      show_sex: false,
      show_avatar: false,
      avatar_path: null,
    })
    getOwnProfile.mockResolvedValue({
      id: userId,
      username: 'ana',
      displayName: 'Ana',
      visibility: 'private',
      timezone: 'America/Sao_Paulo',
      createdAt: '2026-01-15T15:00:00.000Z',
      updatedAt: '2026-01-15T15:00:00.000Z',
    })
    updateOwnProfile.mockResolvedValue(undefined)
  })

  it('saves the edited profile', async () => {
    const user = userEvent.setup()
    renderEditor()

    const name = await screen.findByLabelText('Nome')
    await user.clear(name)
    await user.type(name, 'Ana Souza')
    await user.click(screen.getByRole('radio', { name: 'Público' }))
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(await screen.findByText('perfil salvo')).toBeVisible()
    expect(updateOwnProfile).toHaveBeenCalledWith(userId, {
      username: 'ana',
      displayName: 'Ana Souza',
      visibility: 'public',
      timezone: 'America/Sao_Paulo',
    })
  })

  it('shows a save error', async () => {
    const user = userEvent.setup()
    updateOwnProfile.mockRejectedValue(
      new Error('Esse nome de usuário já está em uso.'),
    )
    renderEditor()

    await screen.findByLabelText('Nome')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esse nome de usuário já está em uso.',
    )
  })
})
