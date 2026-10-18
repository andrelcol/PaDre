import { describe, expect, it } from 'vitest'

import {
  describeRoster,
  describeScoringRule,
  gameBasedConfigSchema,
  goalBasedConfigSchema,
  scoringRuleSchema,
  setBasedConfigSchema,
  type ScoringRule,
} from './scoring.ts'

const setRule: ScoringRule = {
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

describe('scoring config', () => {
  it('accepts the three initial shapes', () => {
    expect(setBasedConfigSchema.safeParse(setRule.config).success).toBe(true)
    expect(
      goalBasedConfigSchema.safeParse({
        allows_draw: true,
        tie_break: 'none',
      }).success,
    ).toBe(true)
    expect(
      gameBasedConfigSchema.safeParse({
        games_to_win_set: 6,
        minimum_game_difference: 2,
        sets_to_win: 2,
        tiebreak_points: 7,
        deciding_set_points: 10,
      }).success,
    ).toBe(true)
  })

  it('rejects a set rule with an extra field or a cap below the target', () => {
    expect(
      setBasedConfigSchema.safeParse({
        ...setRule.config,
        substitutions: 6,
      }).success,
    ).toBe(false)
    expect(
      setBasedConfigSchema.safeParse({ ...setRule.config, point_cap: 20 })
        .success,
    ).toBe(false)
  })

  it('rejects a draw that also requires a tie break', () => {
    expect(
      goalBasedConfigSchema.safeParse({
        allows_draw: true,
        tie_break: 'penalties',
      }).success,
    ).toBe(false)
    expect(
      goalBasedConfigSchema.safeParse({
        allows_draw: false,
        tie_break: 'none',
      }).success,
    ).toBe(false)
  })

  it('rejects a deciding set on a match that has only one set', () => {
    expect(
      gameBasedConfigSchema.safeParse({
        games_to_win_set: 6,
        minimum_game_difference: 2,
        sets_to_win: 1,
        tiebreak_points: 7,
        deciding_set_points: 10,
      }).success,
    ).toBe(false)
  })

  it('rejects an unknown rule type', () => {
    expect(
      scoringRuleSchema.safeParse({ ...setRule, rule_type: 'points' }).success,
    ).toBe(false)
  })
})

describe('describeScoringRule', () => {
  it('describes a set rule without turning it into a generic score', () => {
    expect(describeScoringRule(setRule)).toEqual([
      'Resumo de regulamento',
      'Vence quem ganha 3 sets.',
      'Cada set vai a 25 pontos, com diferença mínima de 2.',
      'O set decisivo vai a 15 pontos.',
    ])
  })

  it('describes a goal rule that can end in a draw', () => {
    expect(
      describeScoringRule({
        id: 'a3000000-0000-4000-8000-000000000005',
        version: 1,
        rule_type: 'goal_based',
        origin: 'official_summary',
        config: { allows_draw: true, tie_break: 'none' },
      }),
    ).toEqual([
      'Resumo de regulamento',
      'O placar é de gols.',
      'O empate encerra a partida.',
    ])
  })

  it('describes a game rule proposed by the app', () => {
    expect(
      describeScoringRule({
        id: 'a3000000-0000-4000-8000-000000000007',
        version: 1,
        rule_type: 'game_based',
        origin: 'app_proposal',
        config: {
          games_to_win_set: 6,
          minimum_game_difference: 2,
          sets_to_win: 2,
          tiebreak_points: 7,
          deciding_set_points: 10,
        },
      }),
    ).toEqual([
      'Proposta do PaDre',
      'Vence quem ganha 2 sets.',
      'Cada set vai a 6 games, com diferença mínima de 2.',
      'No empate de games, o tiebreak vai a 7 pontos.',
      'O set decisivo é um super tiebreak a 10 pontos.',
    ])
  })
})

describe('describeRoster', () => {
  it('uses a range when the format allows it', () => {
    expect(
      describeRoster({
        sideCount: 2,
        playersPerSideMin: 4,
        playersPerSideMax: 6,
      }),
    ).toBe('2 lados, de 4 a 6 jogadores por lado')
  })

  it('uses a single count when minimum and maximum match', () => {
    expect(
      describeRoster({
        sideCount: 2,
        playersPerSideMin: 1,
        playersPerSideMax: 1,
      }),
    ).toBe('2 lados, 1 jogador por lado')
  })
})
