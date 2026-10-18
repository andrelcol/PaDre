import { z } from 'zod'

import type {
  GameBasedConfig,
  GoalBasedConfig,
  SetBasedConfig,
} from '@/domains/sports/model/scoring.ts'

export const matchOutcomes = ['side_1', 'side_2', 'draw'] as const
export type MatchOutcome = (typeof matchOutcomes)[number]

export type OutcomeResolution =
  { ok: true; outcome: MatchOutcome } | { ok: false; message: string }

const score = z.number().int().min(0).max(99)
const pair = z.tuple([score, score])

export const setBasedResultSchema = z.strictObject({
  sets: z.array(pair).min(1).max(9),
})

export const goalBasedResultSchema = z.strictObject({
  goals: pair,
})

const gameSetSchema = z.union([
  z.strictObject({
    games: pair,
    tiebreak: pair.nullable(),
  }),
  z.strictObject({
    points: pair,
  }),
])

export const gameBasedResultSchema = z.strictObject({
  sets: z.array(gameSetSchema).min(1).max(5),
})

export type SetBasedResult = z.infer<typeof setBasedResultSchema>
export type GoalBasedResult = z.infer<typeof goalBasedResultSchema>
export type GameBasedResult = z.infer<typeof gameBasedResultSchema>
export type MatchResultPayload =
  SetBasedResult | GoalBasedResult | GameBasedResult

const invalid = 'O placar não fecha com a regra deste formato.'

export type ScoringSnapshot =
  | { rule_type: 'set_based'; config: SetBasedConfig }
  | { rule_type: 'goal_based'; config: GoalBasedConfig }
  | { rule_type: 'game_based'; config: GameBasedConfig }

export function resolveOutcome(
  rule: ScoringSnapshot,
  payload: unknown,
): OutcomeResolution {
  if (rule.rule_type === 'set_based') {
    const parsed = setBasedResultSchema.safeParse(payload)
    if (!parsed.success) return { ok: false, message: invalid }
    return resolveSets(rule.config, parsed.data.sets)
  }

  if (rule.rule_type === 'goal_based') {
    const parsed = goalBasedResultSchema.safeParse(payload)
    if (!parsed.success) return { ok: false, message: invalid }
    return resolveGoals(rule.config, parsed.data.goals)
  }

  const parsed = gameBasedResultSchema.safeParse(payload)
  if (!parsed.success) return { ok: false, message: invalid }
  return resolveGames(rule.config, parsed.data.sets)
}

function resolveSets(
  config: SetBasedConfig,
  sets: [number, number][],
): OutcomeResolution {
  const maxSets = config.sets_to_win * 2 - 1
  if (sets.length < config.sets_to_win || sets.length > maxSets) {
    return { ok: false, message: invalid }
  }

  const wins = [0, 0]
  for (let index = 0; index < sets.length; index += 1) {
    if (wins[0] >= config.sets_to_win || wins[1] >= config.sets_to_win) {
      return { ok: false, message: invalid }
    }
    const deciding =
      index === maxSets - 1 && config.deciding_set_points !== null
    const target = deciding
      ? (config.deciding_set_points ?? config.points_to_win_set)
      : config.points_to_win_set
    const winner = finishedScore(
      sets[index]![0],
      sets[index]![1],
      target,
      config.minimum_point_difference,
      config.point_cap,
    )
    if (winner === null) return { ok: false, message: invalid }
    wins[winner - 1] += 1
  }

  return matchFromWins(wins, config.sets_to_win)
}

function resolveGoals(
  config: GoalBasedConfig,
  goals: [number, number],
): OutcomeResolution {
  const [left, right] = goals
  if (left > right) return { ok: true, outcome: 'side_1' }
  if (right > left) return { ok: true, outcome: 'side_2' }
  if (config.allows_draw) return { ok: true, outcome: 'draw' }
  return { ok: false, message: 'Este formato não admite empate.' }
}

function resolveGames(
  config: GameBasedConfig,
  sets: GameBasedResult['sets'],
): OutcomeResolution {
  const maxSets = config.sets_to_win * 2 - 1
  if (sets.length < config.sets_to_win || sets.length > maxSets) {
    return { ok: false, message: invalid }
  }

  const wins = [0, 0]
  for (let index = 0; index < sets.length; index += 1) {
    if (wins[0] >= config.sets_to_win || wins[1] >= config.sets_to_win) {
      return { ok: false, message: invalid }
    }
    const deciding =
      index === maxSets - 1 && config.deciding_set_points !== null
    const winner = gameSetWinner(sets[index]!, config, deciding)
    if (winner === null) return { ok: false, message: invalid }
    wins[winner - 1] += 1
  }

  return matchFromWins(wins, config.sets_to_win)
}

function gameSetWinner(
  set: GameBasedResult['sets'][number],
  config: GameBasedConfig,
  deciding: boolean,
): 1 | 2 | null {
  if (deciding) {
    if (!('points' in set) || config.deciding_set_points === null) return null
    return firstTo(set.points[0], set.points[1], config.deciding_set_points)
  }

  if ('points' in set) return null
  const [left, right] = set.games
  const tiedAtTarget =
    config.tiebreak_points !== null &&
    left === config.games_to_win_set &&
    right === config.games_to_win_set

  if (tiedAtTarget) {
    if (!set.tiebreak || config.tiebreak_points === null) return null
    return firstTo(set.tiebreak[0], set.tiebreak[1], config.tiebreak_points)
  }

  if (set.tiebreak) return null
  return finishedScore(
    left,
    right,
    config.games_to_win_set,
    config.minimum_game_difference,
    null,
  )
}

function matchFromWins(wins: number[], needed: number): OutcomeResolution {
  if (wins[0] === needed && wins[1] < needed) {
    return { ok: true, outcome: 'side_1' }
  }
  if (wins[1] === needed && wins[0] < needed) {
    return { ok: true, outcome: 'side_2' }
  }
  return { ok: false, message: invalid }
}

function finishedScore(
  left: number,
  right: number,
  target: number,
  minimumDifference: number,
  cap: number | null,
): 1 | 2 | null {
  if (left === right) return null
  if (cap !== null && (left > cap || right > cap)) return null

  const hi = Math.max(left, right)
  const lo = Math.min(left, right)
  const winner = left > right ? 1 : 2
  const needed = Math.max(target, lo + minimumDifference)

  if (
    cap !== null &&
    hi === cap &&
    lo < cap &&
    lo + minimumDifference > cap &&
    hi >= target
  ) {
    return winner
  }

  if (hi !== needed) return null
  return winner
}

function firstTo(left: number, right: number, target: number): 1 | 2 | null {
  return finishedScore(left, right, target, 1, null)
}

export function resultSchemaFor(rule: ScoringSnapshot) {
  if (rule.rule_type === 'set_based') return setBasedResultSchema
  if (rule.rule_type === 'goal_based') return goalBasedResultSchema
  return gameBasedResultSchema
}
