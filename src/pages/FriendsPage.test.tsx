import type { Session } from '@supabase/supabase-js'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Friendship } from '@/domains/friendships/model/friendship.ts'
import { SessionStateProvider } from '@/domains/identity/components/session.tsx'
import { FriendsPage } from './FriendsPage.tsx'

const { listFriendships, requestFriendship, respondToFriendship } = vi.hoisted(
  () => ({
    listFriendships: vi.fn(),
    requestFriendship: vi.fn(),
    respondToFriendship: vi.fn(),
  }),
)

vi.mock('@/domains/friendships/api/friendships.ts', () => ({
  listFriendships,
  requestFriendship,
  respondToFriendship,
}))

const incoming: Friendship = {
  id: 'a1000000-0000-4000-8000-000000000001',
  status: 'pending',
  side: 'incoming',
  otherUsername: 'ana',
  createdAt: '2026-10-18T00:00:00Z',
  updatedAt: '2026-10-18T00:00:00Z',
  acceptedAt: null,
}

const outgoing: Friendship = {
  id: 'a1000000-0000-4000-8000-000000000002',
  status: 'pending',
  side: 'outgoing',
  otherUsername: 'bia',
  createdAt: '2026-10-18T00:00:00Z',
  updatedAt: '2026-10-18T00:00:00Z',
  acceptedAt: null,
}

const friend: Friendship = {
  id: 'a1000000-0000-4000-8000-000000000003',
  status: 'accepted',
  side: 'friend',
  otherUsername: 'caio',
  createdAt: '2026-10-18T00:00:00Z',
  updatedAt: '2026-10-18T00:00:00Z',
  acceptedAt: '2026-10-18T00:00:00Z',
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <SessionStateProvider
        value={{
          session: { user: { id: 'user-1' } } as Session,
          loading: false,
        }}
      >
        <FriendsPage />
      </SessionStateProvider>
    </QueryClientProvider>,
  )
}

describe('FriendsPage', () => {
  beforeEach(() => {
    listFriendships.mockReset()
    requestFriendship.mockReset()
    respondToFriendship.mockReset()
  })

  it('shows a loading state', () => {
    listFriendships.mockReturnValue(new Promise(() => undefined))
    renderPage()
    expect(screen.getByText('Carregando amizades')).toBeVisible()
  })

  it('shows an error when the list fails', async () => {
    listFriendships.mockRejectedValue(new Error('rede'))
    renderPage()
    expect(
      await screen.findByText('Não foi possível carregar as amizades.'),
    ).toBeVisible()
  })

  it('sends a request and confirms the other actions', async () => {
    const user = userEvent.setup()
    listFriendships.mockResolvedValue([incoming, outgoing, friend])
    requestFriendship.mockResolvedValue({
      id: 'a1000000-0000-4000-8000-000000000004',
      status: 'pending',
      otherUsername: 'davi',
    })
    respondToFriendship.mockResolvedValue({
      id: incoming.id,
      status: 'accepted',
      otherUsername: 'ana',
    })
    renderPage()

    expect(
      await screen.findByRole('heading', { name: 'Meus amigos' }),
    ).toBeVisible()
    expect(screen.getByText('ana')).toBeVisible()
    expect(screen.getByText('bia')).toBeVisible()
    expect(screen.getByText('caio')).toBeVisible()

    await user.type(screen.getByLabelText('Nome de usuário'), 'Davi')
    await user.click(screen.getByRole('button', { name: 'Enviar solicitação' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Solicitação enviada.',
    )
    expect(requestFriendship).toHaveBeenCalledWith('davi', expect.anything())

    await user.click(screen.getByRole('button', { name: 'Aceitar' }))
    expect(respondToFriendship).toHaveBeenCalledWith(incoming.id, 'accept')

    await user.click(screen.getByRole('button', { name: 'Recusar' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar recusa' }))
    expect(respondToFriendship).toHaveBeenCalledWith(incoming.id, 'reject')

    await user.click(
      screen.getByRole('button', { name: 'Cancelar solicitação' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Confirmar cancelamento' }),
    )
    expect(respondToFriendship).toHaveBeenCalledWith(outgoing.id, 'cancel')

    await user.click(screen.getByRole('button', { name: 'Remover amizade' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar remoção' }))
    expect(respondToFriendship).toHaveBeenCalledWith(friend.id, 'remove')
  })

  it('shows a refusal when the username does not exist', async () => {
    const user = userEvent.setup()
    listFriendships.mockResolvedValue([])
    requestFriendship.mockRejectedValue({ message: 'user not found' })
    renderPage()

    await screen.findByText('Nenhuma solicitação recebida.')
    await user.type(screen.getByLabelText('Nome de usuário'), 'ninguem')
    await user.click(screen.getByRole('button', { name: 'Enviar solicitação' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não encontramos esse nome de usuário.',
    )
  })
})
