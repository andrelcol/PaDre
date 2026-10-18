import { describe, expect, it } from 'vitest'

import {
  describeScore,
  lineupError,
  messageFromMatchError,
  outcomeLabel,
  parseMeetupMatches,
} from './match.ts'

const beachRule = {
  sets_to_win: 2,
  points_to_win_set: 21,
  minimum_point_difference: 2,
  deciding_set_points: 15,
  point_cap: null,
}

describe('match model', () => {
  it('reads a board and names the winner from the stored score', () => {
    const board = parseMeetupMatches({
      roster: [
        {
          user_id: 'a1000000-0000-4000-8000-000000000011',
          username: 'ana',
        },
      ],
      matches: [
        {
          id: 'a1000000-0000-4000-8000-000000000021',
          status: 'pending_confirmation',
          confirmed_at: null,
          rule_type: 'set_based',
          config: beachRule,
          teams: [
            {
              id: 'a1000000-0000-4000-8000-000000000031',
              side: 1,
              name: 'Azul',
              players: [],
            },
            {
              id: 'a1000000-0000-4000-8000-000000000032',
              side: 2,
              name: 'Verde',
              players: [],
            },
          ],
          result: {
            id: 'a1000000-0000-4000-8000-000000000041',
            revision: 1,
            payload: {
              sets: [
                [21, 15],
                [21, 18],
              ],
            },
            outcome: 'side_1',
          },
          confirmations: [],
          my_team_side: 1,
          audit: [
            {
              action: 'created',
              revision: null,
              created_at: '2026-10-18T18:00:00.000Z',
              username: 'ana',
            },
          ],
        },
      ],
    })

    const match = board.matches[0]!
    expect(describeScore(match.rule, match.result?.payload)).toBe(
      '21–15, 21–18',
    )
    expect(outcomeLabel('side_1', match.teams)).toBe('Azul venceu')
    expect(outcomeLabel('draw', match.teams)).toBe('Empate')
    expect(match.myTeamSide).toBe(1)
  })

  it('rejects a lineup that repeats a player or misses the format', () => {
    expect(lineupError(['a', 'b'], ['a', 'c'], 2, 2)).toBe(
      'Um jogador não pode estar nas duas equipes.',
    )
    expect(lineupError(['a'], ['b', 'c'], 2, 2)).toBe(
      'Cada equipe precisa de 2 jogadores.',
    )
    expect(lineupError(['a', 'b'], ['c', 'd'], 2, 2)).toBeNull()
  })

  it('maps database errors to the screen', () => {
    expect(messageFromMatchError({ message: 'invalid match result' })).toMatch(
      /não fecha/,
    )
    expect(
      messageFromMatchError({ message: 'side already confirmed' }),
    ).toMatch(/já confirmou/)
    expect(
      messageFromMatchError({ code: '42501', message: 'not allowed' }),
    ).toBe('Você não pode fazer isso.')
  })
})
