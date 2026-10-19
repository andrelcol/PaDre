import { z } from 'zod'

const meetupCardSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  status: z.enum(['scheduled', 'cancelled']),
  starts_at: z.string(),
  ends_at: z.string(),
  time_zone: z.string(),
  location_name: z.string(),
  sport_name: z.string(),
  format_name: z.string(),
  confirmed_count: z.int().nonnegative(),
  max_participants: z.int(),
  open_spots: z.int(),
})

const messageSchema = z.object({
  id: z.uuid(),
  author_username: z.string(),
  body: z.string(),
  created_at: z.string(),
  deleted: z.boolean(),
  mine: z.boolean(),
  can_moderate: z.boolean(),
  meetup: meetupCardSchema.nullable(),
})

const pageSchema = z.object({
  has_older: z.boolean(),
  messages: z.array(messageSchema),
})

export type CommunityMessageMeetup = {
  id: string
  title: string
  status: 'scheduled' | 'cancelled'
  startsAt: string
  endsAt: string
  timeZone: string
  locationName: string
  sportName: string
  formatName: string
  confirmedCount: number
  maxParticipants: number
  openSpots: number
}

export type CommunityMessage = {
  id: string
  authorUsername: string
  body: string
  createdAt: string
  deleted: boolean
  mine: boolean
  canModerate: boolean
  meetup: CommunityMessageMeetup | null
}

export type CommunityMessagePage = {
  hasOlder: boolean
  messages: CommunityMessage[]
}

export function parseCommunityMessages(value: unknown): CommunityMessagePage {
  const page = pageSchema.parse(value)
  return {
    hasOlder: page.has_older,
    messages: page.messages.map((message) => ({
      id: message.id,
      authorUsername: message.author_username,
      body: message.body,
      createdAt: message.created_at,
      deleted: message.deleted,
      mine: message.mine,
      canModerate: message.can_moderate,
      meetup: message.meetup
        ? {
            id: message.meetup.id,
            title: message.meetup.title,
            status: message.meetup.status,
            startsAt: message.meetup.starts_at,
            endsAt: message.meetup.ends_at,
            timeZone: message.meetup.time_zone,
            locationName: message.meetup.location_name,
            sportName: message.meetup.sport_name,
            formatName: message.meetup.format_name,
            confirmedCount: message.meetup.confirmed_count,
            maxParticipants: message.meetup.max_participants,
            openSpots: message.meetup.open_spots,
          }
        : null,
    })),
  }
}

export function messageFromChatError(error: unknown) {
  const message =
    typeof error === 'object' && error && 'message' in error
      ? String(error.message)
      : error instanceof Error
        ? error.message
        : ''
  if (message.includes('too many messages')) {
    return 'Você enviou mensagens demais. Espere um pouco antes de enviar outra.'
  }
  if (message.includes('empty message')) return 'Escreva uma mensagem.'
  if (message.includes('message is too long')) {
    return 'A mensagem pode ter até 2000 caracteres.'
  }
  if (message.includes('invalid message'))
    return 'Essa mensagem não pode ser enviada.'
  if (message.includes('meetup is not in community')) {
    return 'Esse encontro não pode ser compartilhado neste chat.'
  }
  if (message.includes('not found')) return 'Comunidade não encontrada.'
  if (
    message.includes('not allowed') ||
    message.includes('not authenticated')
  ) {
    return 'Você não pode ver este chat.'
  }
  return 'Não foi possível atualizar o chat.'
}

export function isChatAuthorizationError(error: unknown) {
  const message =
    typeof error === 'object' && error && 'message' in error
      ? String(error.message)
      : ''
  return (
    message.includes('not allowed') ||
    message.includes('not authenticated') ||
    message.includes('not found')
  )
}

export function mergeCommunityMessages(messages: CommunityMessage[]) {
  const byId = new Map<string, CommunityMessage>()
  for (const message of messages) byId.set(message.id, message)
  return [...byId.values()].sort((left, right) => {
    if (left.createdAt === right.createdAt) {
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
    }
    return left.createdAt < right.createdAt ? -1 : 1
  })
}
