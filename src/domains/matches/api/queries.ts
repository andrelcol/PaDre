import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  confirmMatch,
  createMatch,
  disputeMatch,
  listMeetupMatches,
  reviseMatchResult,
  setMatchLineup,
  setMatchResult,
  submitMatch,
  voidMatch,
} from '@/domains/matches/api/matches.ts'
import type { MatchResultPayload } from '@/domains/matches/model/outcome.ts'

export type MatchCommand =
  | { type: 'create' }
  | {
      type: 'lineup'
      matchId: string
      side1Name: string
      side1Players: string[]
      side2Name: string
      side2Players: string[]
    }
  | { type: 'result'; matchId: string; payload: MatchResultPayload }
  | { type: 'submit'; matchId: string }
  | { type: 'confirm'; matchId: string }
  | { type: 'dispute'; matchId: string }
  | { type: 'revise'; matchId: string; payload: MatchResultPayload }
  | { type: 'void'; matchId: string }

export function useMeetupMatches(meetupId: string | undefined) {
  return useQuery({
    queryKey: ['matches', meetupId],
    queryFn: () => listMeetupMatches(meetupId ?? ''),
    enabled: Boolean(meetupId),
  })
}

export function useMatchCommand(meetupId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (command: MatchCommand) => runMatchCommand(meetupId, command),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['matches', meetupId] })
    },
  })
}

async function runMatchCommand(meetupId: string, command: MatchCommand) {
  if (command.type === 'create') return createMatch(meetupId)
  if (command.type === 'lineup') return setMatchLineup(command)
  if (command.type === 'result')
    return setMatchResult(command.matchId, command.payload)
  if (command.type === 'submit') return submitMatch(command.matchId)
  if (command.type === 'confirm') return confirmMatch(command.matchId)
  if (command.type === 'dispute') return disputeMatch(command.matchId)
  if (command.type === 'revise') {
    return reviseMatchResult(command.matchId, command.payload)
  }
  return voidMatch(command.matchId)
}
