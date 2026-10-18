import { z } from 'zod'

export const scoringRuleTypes = [
  'set_based',
  'goal_based',
  'game_based',
] as const
export type ScoringRuleType = (typeof scoringRuleTypes)[number]

export const scoringRuleOrigins = ['official_summary', 'app_proposal'] as const
export type ScoringRuleOrigin = (typeof scoringRuleOrigins)[number]

export const tieBreaks = ['none', 'extra_time', 'penalties'] as const
export type TieBreak = (typeof tieBreaks)[number]

const whole = (min: number, max: number) => z.int().min(min).max(max)

export const setBasedConfigSchema = z
  .strictObject({
    sets_to_win: whole(1, 5),
    points_to_win_set: whole(1, 99),
    minimum_point_difference: whole(1, 10),
    deciding_set_points: whole(1, 99).nullable(),
    point_cap: whole(1, 99).nullable(),
  })
  .superRefine((config, context) => {
    if (
      config.point_cap !== null &&
      config.point_cap < config.points_to_win_set
    ) {
      context.addIssue({
        code: 'custom',
        path: ['point_cap'],
        message: 'O teto fica abaixo da pontuação do set.',
      })
    }
  })

export const goalBasedConfigSchema = z
  .strictObject({
    allows_draw: z.boolean(),
    tie_break: z.enum(tieBreaks),
  })
  .superRefine((config, context) => {
    const drawAgrees =
      (config.allows_draw && config.tie_break === 'none') ||
      (!config.allows_draw && config.tie_break !== 'none')

    if (!drawAgrees) {
      context.addIssue({
        code: 'custom',
        path: ['tie_break'],
        message: 'Empate e desempate não combinam.',
      })
    }
  })

export const gameBasedConfigSchema = z
  .strictObject({
    games_to_win_set: whole(1, 21),
    minimum_game_difference: whole(1, 4),
    sets_to_win: whole(1, 3),
    tiebreak_points: whole(1, 99).nullable(),
    deciding_set_points: whole(1, 99).nullable(),
  })
  .superRefine((config, context) => {
    if (config.sets_to_win === 1 && config.deciding_set_points !== null) {
      context.addIssue({
        code: 'custom',
        path: ['deciding_set_points'],
        message: 'Um set único não tem set decisivo.',
      })
    }
  })

export type SetBasedConfig = z.infer<typeof setBasedConfigSchema>
export type GoalBasedConfig = z.infer<typeof goalBasedConfigSchema>
export type GameBasedConfig = z.infer<typeof gameBasedConfigSchema>

export const scoringRuleSchema = z.discriminatedUnion('rule_type', [
  z.object({
    id: z.uuid(),
    version: z.int().min(1),
    rule_type: z.literal('set_based'),
    origin: z.enum(scoringRuleOrigins),
    config: setBasedConfigSchema,
  }),
  z.object({
    id: z.uuid(),
    version: z.int().min(1),
    rule_type: z.literal('goal_based'),
    origin: z.enum(scoringRuleOrigins),
    config: goalBasedConfigSchema,
  }),
  z.object({
    id: z.uuid(),
    version: z.int().min(1),
    rule_type: z.literal('game_based'),
    origin: z.enum(scoringRuleOrigins),
    config: gameBasedConfigSchema,
  }),
])

export type ScoringRule = z.infer<typeof scoringRuleSchema>

const originLabels: Record<ScoringRuleOrigin, string> = {
  official_summary: 'Resumo de regulamento',
  app_proposal: 'Proposta do PaDre',
}

export function describeScoringRule(rule: ScoringRule): string[] {
  const lines = [originLabels[rule.origin]]

  if (rule.rule_type === 'set_based') {
    lines.push(`Vence quem ganha ${rule.config.sets_to_win} sets.`)
    lines.push(
      `Cada set vai a ${rule.config.points_to_win_set} pontos, com diferença mínima de ${rule.config.minimum_point_difference}.`,
    )
    if (rule.config.deciding_set_points !== null) {
      lines.push(
        `O set decisivo vai a ${rule.config.deciding_set_points} pontos.`,
      )
    }
    if (rule.config.point_cap !== null) {
      lines.push(`Há um teto de ${rule.config.point_cap} pontos.`)
    }
    return lines
  }

  if (rule.rule_type === 'goal_based') {
    lines.push('O placar é de gols.')
    lines.push(
      rule.config.allows_draw
        ? 'O empate encerra a partida.'
        : rule.config.tie_break === 'penalties'
          ? 'Não há empate. O desempate é por pênaltis.'
          : 'Não há empate. O desempate é na prorrogação.',
    )
    return lines
  }

  lines.push(`Vence quem ganha ${rule.config.sets_to_win} sets.`)
  lines.push(
    `Cada set vai a ${rule.config.games_to_win_set} games, com diferença mínima de ${rule.config.minimum_game_difference}.`,
  )
  if (rule.config.tiebreak_points !== null) {
    lines.push(
      `No empate de games, o tiebreak vai a ${rule.config.tiebreak_points} pontos.`,
    )
  }
  if (rule.config.deciding_set_points !== null) {
    lines.push(
      `O set decisivo é um super tiebreak a ${rule.config.deciding_set_points} pontos.`,
    )
  }
  return lines
}

export function describeRoster(input: {
  sideCount: number
  playersPerSideMin: number
  playersPerSideMax: number
}): string {
  const sides = `${input.sideCount} lados`
  if (input.playersPerSideMin === input.playersPerSideMax) {
    const players =
      input.playersPerSideMin === 1
        ? '1 jogador por lado'
        : `${input.playersPerSideMin} jogadores por lado`
    return `${sides}, ${players}`
  }

  return `${sides}, de ${input.playersPerSideMin} a ${input.playersPerSideMax} jogadores por lado`
}
