import { describe, expect, it } from 'vitest'

import {
  availableActions,
  friendshipErrorMessage,
  friendshipRequestSchema,
  parseFriendships,
} from './friendship.ts'

describe('friendship rules', () => {
  it('offers accept and reject only to the addressee', () => {
    expect(availableActions({ status: 'pending', side: 'incoming' })).toEqual([
      'accept',
      'reject',
    ])
    expect(availableActions({ status: 'pending', side: 'outgoing' })).toEqual([
      'cancel',
    ])
    expect(availableActions({ status: 'accepted', side: 'friend' })).toEqual([
      'remove',
    ])
  })

  it('normalizes the username before the request', () => {
    expect(friendshipRequestSchema.parse({ username: ' Ana_01 ' })).toEqual({
      username: 'ana_01',
    })
    expect(friendshipRequestSchema.safeParse({ username: 'eu' }).success).toBe(
      false,
    )
  })

  it('maps database refusals to Portuguese', () => {
    expect(friendshipErrorMessage({ message: 'cannot friend yourself' })).toBe(
      'Você não pode adicionar a si mesmo.',
    )
    expect(friendshipErrorMessage({ message: 'user not found' })).toBe(
      'Não encontramos esse nome de usuário.',
    )
    expect(friendshipErrorMessage({ message: 'friendship cooldown' })).toBe(
      'Espere um dia para enviar outra solicitação a essa pessoa.',
    )
  })

  it('reads only the username returned for a relationship', () => {
    expect(
      parseFriendships([
        {
          id: 'a1000000-0000-4000-8000-000000000001',
          status: 'accepted',
          side: 'friend',
          other_username: 'bia',
          created_at: '2026-10-18T00:00:00Z',
          updated_at: '2026-10-18T00:00:00Z',
          accepted_at: '2026-10-18T00:00:00Z',
        },
      ]),
    ).toEqual([
      {
        id: 'a1000000-0000-4000-8000-000000000001',
        status: 'accepted',
        side: 'friend',
        otherUsername: 'bia',
        createdAt: '2026-10-18T00:00:00Z',
        updatedAt: '2026-10-18T00:00:00Z',
        acceptedAt: '2026-10-18T00:00:00Z',
      },
    ])
  })
})
