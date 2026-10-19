import type { ComponentProps } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { CommunityDetail } from '@/domains/communities/model/community.ts'

import { CommunityDetailView } from './community-detail.tsx'

const volleyball = 'a1000000-0000-4000-8000-000000000001'
const ana = 'a1000000-0000-4000-8000-000000000010'
const bia = 'a1000000-0000-4000-8000-000000000011'

const community: CommunityDetail = {
  slug: 'volei-da-praia',
  name: 'Vôlei da praia',
  description: 'Quadra aberta',
  visibility: 'public',
  memberCount: 2,
  sports: [{ id: volleyball, name: 'Vôlei' }],
  myRole: 'owner',
  members: [
    { userId: ana, username: 'ana', role: 'owner' },
    { userId: bia, username: 'bia', role: 'member' },
  ],
  invitations: [],
}

function renderDetail(
  overrides: Partial<ComponentProps<typeof CommunityDetailView>> = {},
) {
  const props = {
    community,
    sports: community.sports,
    currentUserId: ana,
    sessionLoading: false,
    notice: '',
    error: '',
    pending: false,
    onJoin: vi.fn(),
    onLeave: vi.fn(),
    onInvite: vi.fn(),
    onCancelInvite: vi.fn(),
    onSetRole: vi.fn(),
    onRemove: vi.fn(),
    onUpdate: vi.fn(),
    ...overrides,
  }
  render(<CommunityDetailView {...props} />)
  return props
}

describe('CommunityDetailView', () => {
  it('lets the owner promote and hides the member list from outsiders', async () => {
    const user = userEvent.setup()
    const owner = renderDetail()
    expect(screen.getByRole('heading', { name: 'Convidar' })).toBeVisible()
    expect(
      screen.getByText('O proprietário permanece na comunidade.'),
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Sair da comunidade' }),
    ).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Promover bia' }))
    expect(owner.onSetRole).toHaveBeenCalledWith('bia', 'admin')
    cleanup()

    const outsider = renderDetail({
      community: {
        ...community,
        myRole: null,
        members: null,
        invitations: null,
      },
      currentUserId: bia,
    })
    expect(
      screen.getByText('A lista de integrantes aparece para quem participa.'),
    ).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Convidar' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(outsider.onJoin).toHaveBeenCalled()
  })

  it('lets a member leave and keeps administration away', async () => {
    const user = userEvent.setup()
    const member = renderDetail({
      community: { ...community, myRole: 'member' },
      currentUserId: bia,
    })
    expect(screen.queryByRole('heading', { name: 'Convidar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Promover bia' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Sair da comunidade' }))
    expect(member.onLeave).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Confirmar saída' }))
    expect(member.onLeave).toHaveBeenCalled()
  })
})
