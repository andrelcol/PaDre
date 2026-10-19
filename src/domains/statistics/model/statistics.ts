import { z } from 'zod'

import { scoringRuleTypes } from '@/domains/sports/model/scoring.ts'

const count = z.number().int().nonnegative()

const bucketSchema = z.object({
  matches_played: count,
  wins: count,
  losses: count,
  draws: count,
  win_rate: z.number().nonnegative(),
  points_for: count.nullable().optional(),
  points_against: count.nullable().optional(),
  goals_for: count.nullable().optional(),
  goals_against: count.nullable().optional(),
  sets_won: count.nullable().optional(),
  sets_lost: count.nullable().optional(),
  games_won: count.nullable().optional(),
  games_lost: count.nullable().optional(),
  deciding_points_for: count.nullable().optional(),
  deciding_points_against: count.nullable().optional(),
})

const formatSchema = bucketSchema.extend({
  sport_format_id: z.uuid(),
  format_name: z.string(),
})

const sportSchema = bucketSchema.extend({
  sport_id: z.uuid(),
  sport_name: z.string(),
  rule_type: z.enum(scoringRuleTypes),
  formats: z.array(formatSchema),
})

const ownSchema = z.object({
  sports: z.array(sportSchema),
})

const meetupSchema = z.object({
  participants: z.array(
    z.object({
      user_id: z.uuid(),
      username: z.string(),
      sports: z.array(sportSchema),
    }),
  ),
})

export type StatisticBucket = z.infer<typeof bucketSchema>
export type StatisticFormat = z.infer<typeof formatSchema>
export type StatisticSport = z.infer<typeof sportSchema>
export type OwnStatistics = z.infer<typeof ownSchema>
export type MeetupStatistics = z.infer<typeof meetupSchema>

export function parseOwnStatistics(value: unknown): OwnStatistics {
  return ownSchema.parse(value)
}

export function parseMeetupStatistics(value: unknown): MeetupStatistics {
  return meetupSchema.parse(value)
}

export function formatWinRate(rate: number) {
  return `${new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(rate)}%`
}

export function signedDifference(favor: number, against: number) {
  const difference = favor - against
  if (difference > 0) return `+${difference}`
  return String(difference)
}

export function showsDecidingPoints(bucket: StatisticBucket) {
  return (
    (bucket.deciding_points_for ?? 0) + (bucket.deciding_points_against ?? 0) >
    0
  )
}

export function messageFromStatisticError(error: unknown) {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String(error.message).toLowerCase()
      : ''
  if (message.includes('not allowed') || message.includes('42501')) {
    return 'Você não pode ver este desempenho.'
  }
  return 'Não foi possível carregar o desempenho.'
}
