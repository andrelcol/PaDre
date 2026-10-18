import { describe, expect, it } from 'vitest'

import type { ScoringRule } from '@/domains/sports/model/scoring.ts'

import { resolveOutcome } from './outcome.ts'

const volleyball: ScoringRule = {
  id: 'a3000000-0000-4000-8000-000000000001',
  version: 1,
  rule_type: 'set_based',
  origin: 'official_summary',
  config: {
    sets_to_win: 3,
    points_to_win_set: 25,
    minimum_point_difference: 2,
    deciding_set_points: 15,
    point_cap: null,
  },
}

const beach: ScoringRule = {
  ...volleyball,
  id: 'a3000000-0000-4000-8000-000000000003',
  config: {
    sets_to_win: 2,
    points_to_win_set: 21,
    minimum_point_difference: 2,
    deciding_set_points: 15,
    point_cap: null,
  },
}

const futsal: ScoringRule = {
  id: 'a3000000-0000-4000-8000-000000000005',
  version: 1,
  rule_type: 'goal_based',
  origin: 'official_summary',
  config: { allows_draw: true, tie_break: 'none' },
}

const singles: ScoringRule = {
  id: 'a3000000-0000-4000-8000-000000000006',
  version: 1,
  rule_type: 'game_based',
  origin: 'app_proposal',
  config: {
    games_to_win_set: 6,
    minimum_game_difference: 2,
    sets_to_win: 1,
    tiebreak_points: 7,
    deciding_set_points: null,
  },
}

const doubles: ScoringRule = {
  ...singles,
  id: 'a3000000-0000-4000-8000-000000000007',
  config: {
    games_to_win_set: 6,
    minimum_game_difference: 2,
    sets_to_win: 2,
    tiebreak_points: 7,
    deciding_set_points: 10,
  },
}

describe('resolveOutcome', () => {
  it('scores a volleyball match and the deciding set', () => {
    expect(
      resolveOutcome(volleyball, {
        sets: [
          [25, 20],
          [25, 18],
          [25, 22],
        ],
      }),
    ).toEqual({ ok: true, outcome: 'side_1' })
    expect(
      resolveOutcome(volleyball, {
        sets: [
          [25, 20],
          [20, 25],
          [25, 23],
          [23, 25],
          [15, 13],
        ],
      }),
    ).toEqual({ ok: true, outcome: 'side_1' })
    expect(resolveOutcome(volleyball, { sets: [[25, 24]] })).toMatchObject({
      ok: false,
    })
    expect(resolveOutcome(volleyball, { sets: [[27, 24]] })).toMatchObject({
      ok: false,
    })
    expect(
      resolveOutcome(volleyball, {
        sets: [
          [25, 10],
          [25, 10],
          [25, 10],
          [25, 10],
        ],
      }),
    ).toMatchObject({ ok: false })
  })

  it('scores beach volleyball without using the deciding target early', () => {
    expect(
      resolveOutcome(beach, {
        sets: [
          [21, 15],
          [21, 18],
        ],
      }),
    ).toEqual({ ok: true, outcome: 'side_1' })
    expect(
      resolveOutcome(beach, {
        sets: [
          [21, 19],
          [18, 21],
          [10, 15],
        ],
      }),
    ).toEqual({ ok: true, outcome: 'side_2' })
  })

  it('accepts a futsal draw and rejects a draw when the rule forbids it', () => {
    expect(resolveOutcome(futsal, { goals: [3, 2] })).toEqual({
      ok: true,
      outcome: 'side_1',
    })
    expect(resolveOutcome(futsal, { goals: [2, 2] })).toEqual({
      ok: true,
      outcome: 'draw',
    })
    expect(resolveOutcome(futsal, { goals: [-1, 2] })).toMatchObject({
      ok: false,
    })
    expect(
      resolveOutcome(
        {
          ...futsal,
          config: { allows_draw: false, tie_break: 'penalties' },
        },
        { goals: [1, 1] },
      ),
    ).toEqual({
      ok: false,
      message: 'Este formato não admite empate.',
    })
  })

  it('scores beach tennis games, tiebreak and super tiebreak', () => {
    expect(
      resolveOutcome(singles, {
        sets: [{ games: [6, 4], tiebreak: null }],
      }),
    ).toEqual({ ok: true, outcome: 'side_1' })
    expect(
      resolveOutcome(singles, {
        sets: [{ games: [7, 5], tiebreak: null }],
      }),
    ).toEqual({ ok: true, outcome: 'side_1' })
    expect(
      resolveOutcome(singles, {
        sets: [{ games: [6, 6], tiebreak: [7, 5] }],
      }),
    ).toEqual({ ok: true, outcome: 'side_1' })
    expect(
      resolveOutcome(singles, {
        sets: [{ games: [6, 6], tiebreak: [8, 6] }],
      }),
    ).toMatchObject({ ok: false })
    expect(
      resolveOutcome(singles, {
        sets: [{ games: [6, 4], tiebreak: [7, 0] }],
      }),
    ).toMatchObject({ ok: false })
    expect(
      resolveOutcome(doubles, {
        sets: [
          { games: [6, 4], tiebreak: null },
          { games: [4, 6], tiebreak: null },
          { points: [10, 6] },
        ],
      }),
    ).toEqual({ ok: true, outcome: 'side_1' })
    expect(
      resolveOutcome(doubles, {
        sets: [
          { games: [6, 3], tiebreak: null },
          { games: [6, 4], tiebreak: null },
          { points: [10, 4] },
        ],
      }),
    ).toMatchObject({ ok: false })
  })
})
