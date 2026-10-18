import { parseMeetupMatches } from '@/domains/matches/model/match.ts'
import type { MatchResultPayload } from '@/domains/matches/model/outcome.ts'
import { requireSupabase } from '@/shared/lib/supabase.ts'
import type { Json } from '@/shared/lib/database.types.ts'

export async function listMeetupMatches(meetupId: string) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('list_meetup_matches', {
    meetup_id: meetupId,
  })
  if (error) throw error
  return parseMeetupMatches(data)
}

export async function createMatch(meetupId: string) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('create_match', {
    meetup_id: meetupId,
  })
  if (error) throw error
  if (typeof data !== 'string') {
    throw new Error('Não foi possível concluir. Tente de novo.')
  }
  return data
}

export async function setMatchLineup(input: {
  matchId: string
  side1Name: string
  side1Players: string[]
  side2Name: string
  side2Players: string[]
}) {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('set_match_lineup', {
    match_id: input.matchId,
    side_1_name: input.side1Name,
    side_1_players: input.side1Players,
    side_2_name: input.side2Name,
    side_2_players: input.side2Players,
  })
  if (error) throw error
}

export async function setMatchResult(
  matchId: string,
  payload: MatchResultPayload,
) {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('set_match_result', {
    match_id: matchId,
    payload: payload as Json,
  })
  if (error) throw error
}

export async function submitMatch(matchId: string) {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('submit_match', { match_id: matchId })
  if (error) throw error
}

export async function confirmMatch(matchId: string) {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('confirm_match', { match_id: matchId })
  if (error) throw error
}

export async function disputeMatch(matchId: string) {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('dispute_match', { match_id: matchId })
  if (error) throw error
}

export async function reviseMatchResult(
  matchId: string,
  payload: MatchResultPayload,
) {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('revise_match_result', {
    match_id: matchId,
    payload: payload as Json,
  })
  if (error) throw error
}

export async function voidMatch(matchId: string) {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('void_match', { match_id: matchId })
  if (error) throw error
}
