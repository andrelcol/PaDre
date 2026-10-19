import { describe, expect, it } from 'vitest'

import {
  canChangeVisibility,
  canInvite,
  canLeave,
  canRemoveMember,
  canSetMemberRole,
  communityDraftSchema,
  memberCountLabel,
  messageFromCommunityError,
  parseCommunityDetail,
  parsePublicCommunities,
} from './community.ts'

const volleyball = 'a1000000-0000-4000-8000-000000000001'
const ana = 'a1000000-0000-4000-8000-000000000010'

describe('community rules', () => {
  it('asks for a name and at least one sport', () => {
    expect(
      communityDraftSchema.safeParse({
        name: ' ',
        description: '',
        visibility: 'public',
        sportIds: [],
      }).success,
    ).toBe(false)
    const parsed = communityDraftSchema.parse({
      name: '  Vôlei da praia  ',
      description: ' Quadra ',
      visibility: 'private',
      sportIds: [volleyball],
    })
    expect(parsed.name).toBe('Vôlei da praia')
    expect(parsed.description).toBe('Quadra')
  })

  it('keeps owner, admin and member powers apart', () => {
    expect(canInvite('owner')).toBe(true)
    expect(canInvite('admin')).toBe(true)
    expect(canInvite('member')).toBe(false)
    expect(canChangeVisibility('owner')).toBe(true)
    expect(canChangeVisibility('admin')).toBe(false)
    expect(canLeave('owner')).toBe(false)
    expect(canLeave('member')).toBe(true)
    expect(canSetMemberRole('admin')).toBe(false)
    expect(canSetMemberRole('owner')).toBe(true)
    expect(canRemoveMember('admin', 'member')).toBe(true)
    expect(canRemoveMember('admin', 'admin')).toBe(false)
    expect(canRemoveMember('admin', 'owner')).toBe(false)
    expect(canRemoveMember('owner', 'admin')).toBe(true)
    expect(canRemoveMember('member', 'member')).toBe(false)
  })

  it('labels the active member count', () => {
    expect(memberCountLabel(1)).toBe('1 integrante')
    expect(memberCountLabel(2)).toBe('2 integrantes')
  })

  it('hides the member list from someone who has not joined', () => {
    const listed = parsePublicCommunities({
      communities: [
        {
          slug: 'volei',
          name: 'Vôlei',
          description: '',
          visibility: 'public',
          member_count: 1,
          sports: [{ id: volleyball, name: 'Vôlei' }],
        },
      ],
    })
    expect(listed[0]?.sports[0]?.name).toBe('Vôlei')
    const detail = parseCommunityDetail({
      slug: 'volei',
      name: 'Vôlei',
      description: '',
      visibility: 'public',
      member_count: 1,
      sports: [{ id: volleyball, name: 'Vôlei' }],
      my_role: null,
      members: null,
      invitations: null,
    })
    expect(detail.members).toBeNull()
    expect(detail.myRole).toBeNull()
    const joined = parseCommunityDetail({
      ...{
        slug: 'volei',
        name: 'Vôlei',
        description: '',
        visibility: 'public',
        member_count: 1,
        sports: [{ id: volleyball, name: 'Vôlei' }],
      },
      my_role: 'owner',
      members: [{ user_id: ana, username: 'ana', role: 'owner' }],
      invitations: [],
    })
    expect(joined.members?.[0]).toEqual({
      userId: ana,
      username: 'ana',
      role: 'owner',
    })
  })

  it('translates database refusals', () => {
    expect(
      messageFromCommunityError(new Error('reentry requires invitation')),
    ).toBe('Quem foi removido só volta com um convite.')
    expect(messageFromCommunityError(new Error('not found'))).toBe(
      'Comunidade não encontrada.',
    )
    expect(
      messageFromCommunityError({ message: 'not found', code: 'P0001' }),
    ).toBe('Comunidade não encontrada.')
    expect(
      messageFromCommunityError({ message: 'not allowed', code: '42501' }),
    ).toBe('Você não pode fazer isso.')
  })
})
