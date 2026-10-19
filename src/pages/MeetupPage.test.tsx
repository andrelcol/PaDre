import type { Session } from '@supabase/supabase-js'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MeetupDetail } from '@/domains/meetups/model/meetup.ts'
import { SessionStateProvider } from '@/domains/identity/components/session.tsx'
import { MeetupPage } from './MeetupPage.tsx'

const {
  getMeetup,
  listFriendships,
  getCatalog,
  respondToMeetupInvitation,
  leaveMeetup,
  cancelMeetup,
  getMeetupInviteLink,
} = vi.hoisted(() => ({
  getMeetup: vi.fn(),
  listFriendships: vi.fn(),
  getCatalog: vi.fn(),
  respondToMeetupInvitation: vi.fn(),
  leaveMeetup: vi.fn(),
  cancelMeetup: vi.fn(),
  getMeetupInviteLink: vi.fn(),
}))

vi.mock('@/domains/meetups/api/meetups.ts', () => ({
  getMeetup,
  listMeetups: vi.fn(),
  createMeetup: vi.fn(),
  updateMeetup: vi.fn(),
  cancelMeetup,
  inviteToMeetup: vi.fn(),
  respondToMeetupInvitation,
  cancelMeetupInvitation: vi.fn(),
  leaveMeetup,
  getMeetupInviteLink,
  createMeetupInviteLink: vi.fn(),
  revokeMeetupInviteLink: vi.fn(),
  previewMeetupInvite: vi.fn(),
  joinMeetupByInvite: vi.fn(),
}))

vi.mock('@/domains/friendships/api/friendships.ts', () => ({
  listFriendships,
  requestFriendship: vi.fn(),
  respondToFriendship: vi.fn(),
}))

vi.mock('@/domains/sports/api/catalog.ts', () => ({ getCatalog }))

vi.mock('@/domains/statistics/api/statistics.ts', () => ({
  getMyStatistics: vi.fn(async () => ({ sports: [] })),
  getMeetupStatistics: vi.fn(async () => ({ participants: [] })),
  getMyTeammates: vi.fn(),
  getMyOpponents: vi.fn(),
  getMyRelationshipHighlights: vi.fn(),
  getMeetupRelationships: vi.fn(async () => ({
    player: {
      user_id: 'a1000000-0000-4000-8000-000000000099',
      username: 'ana',
    },
    sports: [],
  })),
}))

vi.mock('@/domains/matches/api/matches.ts', () => ({
  listMeetupMatches: vi.fn(async () => ({ roster: [], matches: [] })),
  createMatch: vi.fn(),
  setMatchLineup: vi.fn(),
  setMatchResult: vi.fn(),
  submitMatch: vi.fn(),
  confirmMatch: vi.fn(),
  disputeMatch: vi.fn(),
  reviseMatchResult: vi.fn(),
  voidMatch: vi.fn(),
}))

const detail: MeetupDetail = {
  id: 'a1000000-0000-4000-8000-000000000031',
  title: 'Vôlei na quadra',
  description: 'Treino',
  status: 'scheduled',
  startsAt: '2099-01-01T22:00:00.000Z',
  endsAt: '2099-01-02T00:00:00.000Z',
  timeZone: 'America/Sao_Paulo',
  locationName: 'Clube',
  locationAddress: '',
  maxParticipants: 2,
  confirmedCount: 1,
  openSpots: 1,
  sportId: 'a1000000-0000-4000-8000-000000000001',
  sportName: 'Vôlei',
  sportFormatId: 'a2000000-0000-4000-8000-000000000001',
  formatName: 'Vôlei 6x6',
  scoringRuleVersionId: 'a3000000-0000-4000-8000-000000000001',
  rule: {
    id: 'a3000000-0000-4000-8000-000000000001',
    version: 1,
    rule_type: 'set_based',
    origin: 'official_summary',
    config: {
      sets_to_win: 3,
      points_to_win_set: 25,
      minimum_point_difference: 2,
      deciding_set_points: 15,
      point_cap: null,
    },
  },
  organizerUsername: 'ana',
  isOrganizer: false,
  communitySlug: null,
  communityName: null,
  canModerate: false,
  myParticipation: null,
  participants: [{ username: 'ana' }],
  myInvitation: {
    id: 'a1000000-0000-4000-8000-000000000032',
    status: 'pending',
  },
  invitations: [],
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const router = createMemoryRouter(
    [{ path: '/encontros/:id', element: <MeetupPage /> }],
    {
      initialEntries: [`/encontros/${detail.id}`],
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

describe('MeetupPage', () => {
  beforeEach(() => {
    getMeetup.mockReset()
    listFriendships.mockReset()
    getCatalog.mockReset()
    respondToMeetupInvitation.mockReset()
    leaveMeetup.mockReset()
    cancelMeetup.mockReset()
    getMeetupInviteLink.mockReset()
    getMeetupInviteLink.mockResolvedValue({
      state: 'none',
      expires_at: null,
      revoked_at: null,
      created_at: null,
    })
    getCatalog.mockResolvedValue([])
    listFriendships.mockResolvedValue([])
  })

  it('accepts, confirms a refusal and shows a load error', async () => {
    const user = userEvent.setup()
    getMeetup.mockResolvedValue(detail)
    respondToMeetupInvitation.mockResolvedValue('accepted')
    renderPage()

    expect(
      await screen.findByRole('heading', { name: 'Vôlei na quadra' }),
    ).toBeVisible()
    expect(screen.getByText(/1 vaga disponível/)).toBeVisible()
    expect(
      screen.getByRole('list', { name: 'Participantes confirmados' }),
    ).toHaveTextContent('ana')
    await user.click(screen.getByRole('button', { name: 'Aceitar convite' }))
    expect(respondToMeetupInvitation).toHaveBeenCalledWith(
      detail.myInvitation?.id,
      'accept',
    )
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Presença confirmada.',
    )

    await user.click(screen.getByRole('button', { name: 'Recusar convite' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar recusa' }))
    expect(respondToMeetupInvitation).toHaveBeenCalledWith(
      detail.myInvitation?.id,
      'decline',
    )
  })

  it('confirms leaving', async () => {
    const user = userEvent.setup()
    getMeetup.mockResolvedValue({
      ...detail,
      myInvitation: null,
      myParticipation: 'confirmed',
      confirmedCount: 2,
      openSpots: 0,
    })
    leaveMeetup.mockResolvedValue('left')
    renderPage()
    await screen.findByRole('heading', { name: 'Vôlei na quadra' })
    await user.click(screen.getByRole('button', { name: 'Desistir' }))
    await user.click(
      screen.getByRole('button', { name: 'Confirmar desistência' }),
    )
    expect(leaveMeetup).toHaveBeenCalledWith(detail.id)
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Você saiu do encontro.',
    )
  })

  it('confirms cancelling a meetup', async () => {
    const user = userEvent.setup()
    getMeetup.mockResolvedValue({
      ...detail,
      isOrganizer: true,
      myInvitation: null,
      myParticipation: 'confirmed',
      invitations: [
        {
          id: 'a1000000-0000-4000-8000-000000000033',
          username: 'bia',
          status: 'pending',
        },
      ],
    })
    leaveMeetup.mockResolvedValue('left')
    cancelMeetup.mockResolvedValue('cancelled')
    renderPage()

    await screen.findByRole('heading', { name: 'Convidar amigo' })
    await user.click(screen.getByRole('button', { name: 'Cancelar encontro' }))
    await user.click(
      screen.getByRole('button', { name: 'Confirmar cancelamento' }),
    )
    expect(cancelMeetup).toHaveBeenCalledWith(detail.id)
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Encontro cancelado.',
    )
  })

  it('shows an error when the meetup cannot be loaded', async () => {
    getMeetup.mockRejectedValue(new Error('rede'))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar o encontro.',
    )
  })
})
