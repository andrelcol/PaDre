import type { ComponentProps } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import type {
  CommunityInvite,
  CommunitySummary,
  MyCommunity,
} from '@/domains/communities/model/community.ts'

import { CommunitiesView } from './communities-view.tsx'

const sport = {
  id: 'a1000000-0000-4000-8000-000000000001',
  name: 'Vôlei',
}

const discovered: CommunitySummary = {
  slug: 'volei-da-praia',
  name: 'Vôlei da praia',
  description: 'Quadra aberta',
  visibility: 'public',
  memberCount: 2,
  sports: [sport],
}

const mine: MyCommunity = { ...discovered, role: 'owner' }

const invitation: CommunityInvite = {
  id: 'a1000000-0000-4000-8000-000000000020',
  slug: 'grupo-fechado',
  name: 'Grupo fechado',
  description: 'Só com convite',
  visibility: 'private',
}

function renderView(
  overrides: Partial<ComponentProps<typeof CommunitiesView>> = {},
) {
  const onAccept = vi.fn()
  const onDecline = vi.fn()
  render(
    <MemoryRouter>
      <CommunitiesView
        signedIn
        publicStatus="ready"
        mineStatus="ready"
        inviteStatus="ready"
        discovered={[discovered]}
        mine={[mine]}
        invitations={[invitation]}
        notice=""
        error=""
        pending={false}
        onAccept={onAccept}
        onDecline={onDecline}
        {...overrides}
      />
    </MemoryRouter>,
  )
  return { onAccept, onDecline }
}

describe('CommunitiesView', () => {
  it('shows loading, empty and error states', () => {
    const { unmount } = render(
      <MemoryRouter>
        <CommunitiesView
          signedIn={false}
          publicStatus="loading"
          mineStatus="signed-out"
          inviteStatus="signed-out"
          discovered={[]}
          mine={[]}
          invitations={[]}
          notice=""
          error=""
          pending={false}
          onAccept={vi.fn()}
          onDecline={vi.fn()}
        />
      </MemoryRouter>,
    )
    expect(screen.getByText('Carregando comunidades públicas')).toBeVisible()
    expect(
      screen.getByText('Entre para ver as comunidades de que você participa.'),
    ).toBeVisible()
    unmount()

    renderView({
      discovered: [],
      mine: [],
      invitations: [],
      publicStatus: 'error',
    })
    expect(
      screen.getByText('Não foi possível carregar as comunidades públicas.'),
    ).toBeVisible()
    expect(
      screen.getByText('Você ainda não participa de uma comunidade.'),
    ).toBeVisible()
    expect(screen.getByText('Nenhum convite pendente.')).toBeVisible()
  })

  it('lists a public community and accepts an invite', async () => {
    const user = userEvent.setup()
    const { onAccept, onDecline } = renderView()
    const links = screen.getAllByRole('link', { name: 'Vôlei da praia' })
    expect(links).toHaveLength(2)
    expect(links[0]).toHaveAttribute('href', '/comunidades/volei-da-praia')
    expect(screen.getAllByText(/2 integrantes/).length).toBeGreaterThan(0)
    expect(
      screen.getAllByText('Vôlei', { exact: true }).length,
    ).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'Aceitar' }))
    expect(onAccept).toHaveBeenCalledWith(invitation.id)
    await user.click(screen.getByRole('button', { name: 'Recusar' }))
    expect(onDecline).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Confirmar recusa' }))
    expect(onDecline).toHaveBeenCalledWith(invitation.id)
  })
})
