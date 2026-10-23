import { z } from 'zod'

import { sportSchema } from '@/domains/statistics/model/statistics.ts'

export const venueHighlightMinimum = 5

const venueStatus = z.enum(['active', 'archived'])
const venueScope = z.enum(['personal', 'community'])

const venuePerformanceSchema = z.object({
  venue_id: z.uuid(),
  visible: z.boolean(),
  name: z.string().optional(),
  address: z.string().optional(),
  status: venueStatus.optional(),
  scope: venueScope.optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  community_slug: z.string().nullable().optional(),
  sports: z.array(sportSchema),
})

const venueListSchema = z.object({
  venues: z.array(venuePerformanceSchema),
  truncated: z.boolean(),
  unassigned: z.object({
    sports: z.array(sportSchema),
  }),
})

const usageSportSchema = z.object({
  sport_id: z.uuid(),
  sport_name: z.string(),
  confirmed_matches: z.number().int().nonnegative(),
})

const usageSchema = z.object({
  venues: z.array(
    z.object({
      venue_id: z.uuid(),
      name: z.string(),
      address: z.string(),
      status: venueStatus,
      latitude: z.number().nullable().optional(),
      longitude: z.number().nullable().optional(),
      scheduled_meetups: z.number().int().nonnegative(),
      cancelled_meetups: z.number().int().nonnegative(),
      meetups_with_confirmed_matches: z.number().int().nonnegative(),
      confirmed_matches: z.number().int().nonnegative(),
      sports: z.array(usageSportSchema),
    }),
  ),
})

export type VenuePerformance = z.infer<typeof venuePerformanceSchema>
export type VenuePerformanceList = z.infer<typeof venueListSchema>
export type VenueUsage = z.infer<typeof usageSchema>

export function parseVenuePerformanceList(
  value: unknown,
): VenuePerformanceList {
  return venueListSchema.parse(value)
}

export function parseVenuePerformance(value: unknown): VenuePerformance {
  return venuePerformanceSchema.parse(value)
}

export function parseVenueUsage(value: unknown): VenueUsage {
  return usageSchema.parse(value)
}

export function venueLabel(venue: VenuePerformance) {
  if (!venue.visible || !venue.name) return 'Local indisponível'
  return venue.name
}

export function venueMapPath(venue: VenuePerformance) {
  if (!venue.visible) return null
  if (venue.scope === 'community' && venue.community_slug) {
    return `/comunidades/${venue.community_slug}?mapa=${venue.venue_id}`
  }
  if (venue.scope === 'personal') return `/locais?mapa=${venue.venue_id}`
  return null
}

export function comparisonHighlight(rows: VenuePerformance[]) {
  const eligible = rows.flatMap((venue) => {
    const sport = venue.sports[0]
    if (!sport || sport.matches_played < venueHighlightMinimum) return []
    return [{ venueId: venue.venue_id, winRate: sport.win_rate }]
  })
  if (eligible.length < 2) return null
  const best = Math.max(...eligible.map((row) => row.winRate))
  const winners = eligible.filter((row) => row.winRate === best)
  if (winners.length !== 1) return null
  return winners[0]?.venueId ?? null
}
