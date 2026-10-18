import { z } from 'zod'

import { usernameSchema } from '@/domains/identity/model/profile.ts'

export const friendshipStatuses = [
  'pending',
  'accepted',
  'rejected',
  'cancelled',
  'removed',
] as const

export const friendshipSides = ['incoming', 'outgoing', 'friend'] as const

export const friendshipActions = [
  'accept',
  'reject',
  'cancel',
  'remove',
] as const

export type FriendshipStatus = (typeof friendshipStatuses)[number]
export type FriendshipSide = (typeof friendshipSides)[number]
export type FriendshipAction = (typeof friendshipActions)[number]

export const friendshipRequestSchema = z.object({
  username: usernameSchema,
})

export const friendshipSchema = z.object({
  id: z.uuid(),
  status: z.enum(['pending', 'accepted']),
  side: z.enum(friendshipSides),
  otherUsername: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  acceptedAt: z.string().nullable(),
})

export type Friendship = z.infer<typeof friendshipSchema>

const listedRowSchema = z.object({
  id: z.uuid(),
  status: z.enum(['pending', 'accepted']),
  side: z.enum(friendshipSides),
  other_username: z.string().min(1),
  created_at: z.string(),
  updated_at: z.string(),
  accepted_at: z.string().nullable(),
})

export function parseFriendships(rows: unknown): Friendship[] {
  return z
    .array(listedRowSchema)
    .parse(rows ?? [])
    .map((row) =>
      friendshipSchema.parse({
        id: row.id,
        status: row.status,
        side: row.side,
        otherUsername: row.other_username,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        acceptedAt: row.accepted_at,
      }),
    )
}

export function parseFriendshipCommand(row: unknown) {
  const parsed = z
    .object({
      id: z.uuid(),
      status: z.enum(friendshipStatuses),
      other_username: z.string().min(1),
    })
    .parse(row)
  return {
    id: parsed.id,
    status: parsed.status,
    otherUsername: parsed.other_username,
  }
}

export function availableActions(friendship: {
  status: Friendship['status']
  side: FriendshipSide
}): FriendshipAction[] {
  if (friendship.status === 'pending' && friendship.side === 'incoming') {
    return ['accept', 'reject']
  }
  if (friendship.status === 'pending' && friendship.side === 'outgoing') {
    return ['cancel']
  }
  if (friendship.status === 'accepted' && friendship.side === 'friend') {
    return ['remove']
  }
  return []
}

export function friendshipErrorMessage(error: {
  message?: string
  code?: string
}) {
  const message = error.message?.toLowerCase() ?? ''

  if (message.includes('cannot friend yourself')) {
    return 'Você não pode adicionar a si mesmo.'
  }
  if (message.includes('user not found')) {
    return 'Não encontramos esse nome de usuário.'
  }
  if (message.includes('already pending')) {
    return 'Já existe uma solicitação para essa pessoa.'
  }
  if (message.includes('incoming friendship request')) {
    return 'Essa pessoa já enviou uma solicitação para você.'
  }
  if (message.includes('already friends')) {
    return 'Vocês já são amigos.'
  }
  if (message.includes('cooldown')) {
    return 'Espere um dia para enviar outra solicitação a essa pessoa.'
  }
  if (message.includes('too many pending')) {
    return 'Você atingiu o limite de solicitações pendentes.'
  }
  if (
    message.includes('not a participant') ||
    message.includes('invalid friendship transition') ||
    error.code === '42501'
  ) {
    return 'Você não pode alterar essa relação.'
  }

  return 'Não foi possível concluir. Tente de novo.'
}

export function messageFromFriendshipError(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    const details = error as { message?: string; code?: string }
    return friendshipErrorMessage({
      message: details.message,
      code: details.code,
    })
  }
  return friendshipErrorMessage({})
}
