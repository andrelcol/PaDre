import type { Session } from '@supabase/supabase-js'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MeetupSummary } from '@/domains/meetups/model/meetup.ts'
import { SessionStateProvider } from '@/domains/identity/components/session.tsx'
import { MeetupsPage } from './MeetupsPage.tsx'

const { listMeetups } = vi.hoisted(() => ({ listMeetups: vi.fn() }))

vi.mock('@/domains/meetups/api/meetups.ts', () => ({ listMeetups }))

const upcoming: MeetupSummary = {
  id: 'a1000000-0000-4000-8000-000000000021',
  title: 'Vôlei na quadra',
  status: 'scheduled',
  startsAt: '2099-01-01T22:00:00.000Z',
  endsAt: '2099-01-02T00:00:00.000Z',
  timeZone: 'America/Sao_Paulo',
  locationName: 'Clube',
  sportName: 'Vôlei',
  formatName: 'Vôlei 6x6',
  relation: 'organizing',
  confirmedCount: 1,
  maxParticipants: 2,
  invitationId: null,
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createMemoryRouter(
    [{ path: '/encontros', element: <MeetupsPage /> }],
    {
      initialEntries: ['/encontros'],
    },
  )
  render(
    <QueryClientProvider client={queryClient}>
      <SessionStateProvider
        value={{
          session: { user: { id: 'user-1' } } as Session,
          loading: false,
        }}
      >
        <RouterProvider router={router} />
      </SessionStateProvider>
    </QueryClientProvider>,
  )
}

describe('MeetupsPage', () => {
  beforeEach(() => {
    listMeetups.mockReset()
  })

  it('shows a loading state', () => {
    listMeetups.mockReturnValue(new Promise(() => undefined))
    renderPage()
    expect(screen.getByText('Carregando encontros')).toBeVisible()
  })

  it('shows an error when the list fails', async () => {
    listMeetups.mockRejectedValue(new Error('rede'))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar os encontros.',
    )
  })

  it('groups upcoming meetups, invitations and empty sections', async () => {
    listMeetups.mockResolvedValue([
      upcoming,
      {
        ...upcoming,
        id: 'a1000000-0000-4000-8000-000000000022',
        title: 'Convite da Ana',
        relation: 'invited',
        invitationId: 'a1000000-0000-4000-8000-000000000023',
      },
    ])
    renderPage()
    expect(
      await screen.findByRole('heading', { name: 'Meus próximos encontros' }),
    ).toBeVisible()
    expect(screen.getAllByRole('link', { name: /Vôlei na quadra/ })).toHaveLength(2)
    expect(screen.getByRole('link', { name: /Convite da Ana/ })).toBeVisible()
    expect(screen.getAllByText(/1 vaga disponível/).length).toBeGreaterThan(0)
    expect(
      screen.getByText('Nenhum encontro anterior ou cancelado.'),
    ).toBeVisible()
  })
})
