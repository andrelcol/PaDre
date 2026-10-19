import {
  parseMeetupRelationships,
  parseRelationshipHighlights,
  parseRelationshipList,
} from '@/domains/statistics/model/relationships.ts'
import {
  parseMeetupStatistics,
  parseOwnStatistics,
} from '@/domains/statistics/model/statistics.ts'
import { requireSupabase } from '@/shared/lib/supabase.ts'

export async function getMyStatistics() {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('my_statistics')
  if (error) throw error
  return parseOwnStatistics(data)
}

export async function getMeetupStatistics(meetupId: string) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('meetup_participant_statistics', {
    meetup_id: meetupId,
  })
  if (error) throw error
  return parseMeetupStatistics(data)
}

export async function getMyTeammates(
  sportId: string,
  sportFormatId: string | null,
  offset: number,
) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('my_teammate_statistics', {
    sport_id: sportId,
    sport_format_id: sportFormatId ?? undefined,
    result_offset: offset,
  })
  if (error) throw error
  return parseRelationshipList(data)
}

export async function getMyOpponents(
  sportId: string,
  sportFormatId: string | null,
  offset: number,
) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('my_opponent_statistics', {
    sport_id: sportId,
    sport_format_id: sportFormatId ?? undefined,
    result_offset: offset,
  })
  if (error) throw error
  return parseRelationshipList(data)
}

export async function getMyRelationshipHighlights(
  sportId: string,
  sportFormatId: string | null,
) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('my_relationship_highlights', {
    sport_id: sportId,
    sport_format_id: sportFormatId ?? undefined,
  })
  if (error) throw error
  return parseRelationshipHighlights(data)
}

export async function getMeetupRelationships(
  meetupId: string,
  playerId: string,
) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('meetup_player_relationships', {
    meetup_id: meetupId,
    player_id: playerId,
  })
  if (error) throw error
  return parseMeetupRelationships(data)
}
