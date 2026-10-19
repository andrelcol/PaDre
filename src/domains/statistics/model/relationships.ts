import { z } from 'zod'

export const relationshipStatuses = [
  'selected',
  'insufficient_sample',
  'none',
] as const

const statusSchema = z.enum(relationshipStatuses)

const personSchema = z.object({
  user_id: z.uuid(),
  username: z.string(),
  matches_played: z.number().int().positive(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  draws: z.number().int().nonnegative(),
  win_rate: z.number().nonnegative(),
})

const listSchema = z.object({
  sport_id: z.uuid(),
  sport_format_id: z.uuid().nullable(),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  relationships: z.array(personSchema),
})

const highlightsSchema = z.object({
  sport_id: z.uuid(),
  sport_format_id: z.uuid().nullable(),
  minimum_matches: z.number().int().positive(),
  most_frequent_teammate: personSchema.nullable(),
  most_frequent_teammate_status: statusSchema,
  best_teammate: personSchema.nullable(),
  best_teammate_status: statusSchema,
  most_frequent_opponent: personSchema.nullable(),
  most_frequent_opponent_status: statusSchema,
  most_defeated_opponent: personSchema.nullable(),
  most_defeated_opponent_status: statusSchema,
  hardest_opponent: personSchema.nullable(),
  hardest_opponent_status: statusSchema,
})

const meetupSchema = z.object({
  player: z.object({
    user_id: z.uuid(),
    username: z.string(),
  }),
  sports: z.array(
    z.object({
      sport_id: z.uuid(),
      sport_name: z.string(),
      teammates: z.array(personSchema),
      opponents: z.array(personSchema),
      highlights: highlightsSchema,
    }),
  ),
})

export type RelationshipPerson = z.infer<typeof personSchema>
export type RelationshipList = z.infer<typeof listSchema>
export type RelationshipHighlights = z.infer<typeof highlightsSchema>
export type RelationshipStatus = z.infer<typeof statusSchema>
export type MeetupRelationships = z.infer<typeof meetupSchema>

export function parseRelationshipList(value: unknown): RelationshipList {
  return listSchema.parse(value)
}

export function parseRelationshipHighlights(
  value: unknown,
): RelationshipHighlights {
  return highlightsSchema.parse(value)
}

export function parseMeetupRelationships(value: unknown): MeetupRelationships {
  return meetupSchema.parse(value)
}

export function messageFromRelationshipError(error: unknown) {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String(error.message).toLowerCase()
      : ''
  if (message.includes('not allowed') || message.includes('42501')) {
    return 'Você não pode ver estas relações.'
  }
  return 'Não foi possível carregar as relações.'
}

export function relationshipStatusCopy(
  status: RelationshipStatus,
  minimum: number,
) {
  if (status === 'insufficient_sample') {
    return `Amostra insuficiente. É preciso pelo menos ${minimum} partidas com a mesma pessoa.`
  }
  if (status === 'none') return 'Ninguém nesta amostra.'
  return null
}
