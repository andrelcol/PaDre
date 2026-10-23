import { useQuery } from '@tanstack/react-query'

import {
  getCommunityVenueUsage,
  getMeetupRelationships,
  getMeetupStatistics,
  getMyOpponents,
  getMyRelationshipHighlights,
  getMyStatistics,
  getMyTeammates,
  getMyVenueStatistic,
  getMyVenueStatistics,
} from '@/domains/statistics/api/statistics.ts'

export function useMyStatistics(enabled: boolean) {
  return useQuery({
    queryKey: ['statistics', 'me'],
    queryFn: getMyStatistics,
    enabled,
  })
}

export function useMyVenueStatistics(
  sportId: string | null,
  sportFormatId: string | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['statistics', 'venues', sportId, sportFormatId],
    queryFn: () => getMyVenueStatistics(sportId, sportFormatId),
    enabled,
  })
}

export function useMyVenueStatistic(venueId: string | null) {
  return useQuery({
    queryKey: ['statistics', 'venue', venueId],
    queryFn: () => getMyVenueStatistic(venueId ?? ''),
    enabled: Boolean(venueId),
  })
}

export function useCommunityVenueUsage(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: ['statistics', 'venue-usage', slug],
    queryFn: () => getCommunityVenueUsage(slug),
    enabled,
  })
}

export function useMeetupStatistics(meetupId: string | undefined) {
  return useQuery({
    queryKey: ['statistics', 'meetup', meetupId],
    queryFn: () => getMeetupStatistics(meetupId ?? ''),
    enabled: Boolean(meetupId),
  })
}

export function useMyTeammates(
  sportId: string | undefined,
  sportFormatId: string | null,
  offset: number,
) {
  return useQuery({
    queryKey: ['statistics', 'teammates', sportId, sportFormatId, offset],
    queryFn: () => getMyTeammates(sportId ?? '', sportFormatId, offset),
    enabled: Boolean(sportId),
  })
}

export function useMyOpponents(
  sportId: string | undefined,
  sportFormatId: string | null,
  offset: number,
) {
  return useQuery({
    queryKey: ['statistics', 'opponents', sportId, sportFormatId, offset],
    queryFn: () => getMyOpponents(sportId ?? '', sportFormatId, offset),
    enabled: Boolean(sportId),
  })
}

export function useMyRelationshipHighlights(
  sportId: string | undefined,
  sportFormatId: string | null,
) {
  return useQuery({
    queryKey: ['statistics', 'highlights', sportId, sportFormatId],
    queryFn: () => getMyRelationshipHighlights(sportId ?? '', sportFormatId),
    enabled: Boolean(sportId),
  })
}

export function useMeetupRelationships(
  meetupId: string | undefined,
  playerId: string | undefined,
) {
  return useQuery({
    queryKey: ['statistics', 'meetup', meetupId, 'relationships', playerId],
    queryFn: () => getMeetupRelationships(meetupId ?? '', playerId ?? ''),
    enabled: Boolean(meetupId && playerId),
  })
}
