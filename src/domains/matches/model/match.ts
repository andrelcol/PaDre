import { z } from 'zod'

import {
  gameBasedConfigSchema,
  goalBasedConfigSchema,
  setBasedConfigSchema,
} from '@/domains/sports/model/scoring.ts'

import {
  gameBasedResultSchema,
  goalBasedResultSchema,
  matchOutcomes,
  setBasedResultSchema,
  type MatchOutcome,
  type ScoringSnapshot,
} from './outcome.ts'

export const matchStatuses = [
  'draft',
  'pending_confirmation',
  'disputed',
  'confirmed',
  'voided',
] as const

export type MatchStatus = (typeof matchStatuses)[number]

export const matchActions = [
  'created',
  'lineup_changed',
  'result_changed',
  'submitted',
  'confirmation',
  'disputed',
  'revised',
  'confirmed',
  'voided',
] as const

export type MatchAction = (typeof matchActions)[number]

const statusLabels: Record<MatchStatus, string> = {
  draft: 'Rascunho',
  pending_confirmation: 'Aguardando confirmação',
  disputed: 'Contestada',
  confirmed: 'Confirmada',
  voided: 'Anulada',
}

const actionLabels: Record<MatchAction, string> = {
  created: 'Criou a partida',
  lineup_changed: 'Alterou as equipes',
  result_changed: 'Registrou o placar',
  submitted: 'Enviou para confirmação',
  confirmation: 'Confirmou o placar da própria equipe',
  disputed: 'Contestou o placar',
  revised: 'Reenviou o placar',
  confirmed: 'A partida ficou confirmada',
  voided: 'Anulou a partida',
}

const playerSchema = z.object({
  user_id: z.uuid(),
  username: z.string(),
})

const teamSchema = z.object({
  id: z.uuid(),
  side: z.union([z.literal(1), z.literal(2)]),
  name: z.string(),
  players: z.array(playerSchema),
})

const resultSchema = z.object({
  id: z.uuid(),
  revision: z.int(),
  payload: z.unknown(),
  outcome: z.enum(matchOutcomes),
})

const confirmationSchema = z.object({
  team_id: z.uuid(),
  user_id: z.uuid(),
  username: z.string(),
})

const auditSchema = z.object({
  action: z.enum(matchActions),
  revision: z.int().nullable(),
  created_at: z.string(),
  username: z.string(),
})

const matchSchema = z.object({
  id: z.uuid(),
  status: z.enum(matchStatuses),
  confirmed_at: z.string().nullable(),
  rule_type: z.enum(['set_based', 'goal_based', 'game_based']),
  config: z.unknown(),
  teams: z.array(teamSchema),
  result: resultSchema.nullable(),
  confirmations: z.array(confirmationSchema),
  my_team_side: z.union([z.literal(1), z.literal(2)]).nullable(),
  audit: z.array(auditSchema),
})

const boardSchema = z.object({
  roster: z.array(playerSchema),
  matches: z.array(matchSchema),
})

export type MatchPlayer = { userId: string; username: string }

export type MatchTeam = {
  id: string
  side: 1 | 2
  name: string
  players: MatchPlayer[]
}

export type MatchRecord = {
  id: string
  status: MatchStatus
  confirmedAt: string | null
  rule: ScoringSnapshot
  teams: MatchTeam[]
  result: {
    id: string
    revision: number
    payload: unknown
    outcome: MatchOutcome
  } | null
  confirmations: { teamId: string; userId: string; username: string }[]
  myTeamSide: 1 | 2 | null
  audit: {
    action: MatchAction
    revision: number | null
    createdAt: string
    username: string
  }[]
}

export type MeetupMatches = {
  roster: MatchPlayer[]
  matches: MatchRecord[]
}

export function matchStatusLabel(status: MatchStatus) {
  return statusLabels[status]
}

export function matchActionLabel(action: MatchAction) {
  return actionLabels[action]
}

export function parseMeetupMatches(value: unknown): MeetupMatches {
  const board = boardSchema.parse(value)
  return {
    roster: board.roster.map(toPlayer),
    matches: board.matches.map((match) => ({
      id: match.id,
      status: match.status,
      confirmedAt: match.confirmed_at,
      rule: parseRule(match.rule_type, match.config),
      teams: match.teams.map((team) => ({
        id: team.id,
        side: team.side,
        name: team.name,
        players: team.players.map(toPlayer),
      })),
      result: match.result
        ? {
            id: match.result.id,
            revision: match.result.revision,
            payload: match.result.payload,
            outcome: match.result.outcome,
          }
        : null,
      confirmations: match.confirmations.map((item) => ({
        teamId: item.team_id,
        userId: item.user_id,
        username: item.username,
      })),
      myTeamSide: match.my_team_side,
      audit: match.audit.map((item) => ({
        action: item.action,
        revision: item.revision,
        createdAt: item.created_at,
        username: item.username,
      })),
    })),
  }
}

export function outcomeLabel(outcome: MatchOutcome, teams: MatchTeam[]) {
  if (outcome === 'draw') return 'Empate'
  const side = outcome === 'side_1' ? 1 : 2
  const name = teams.find((team) => team.side === side)?.name ?? `Lado ${side}`
  return `${name} venceu`
}

export function describeScore(rule: ScoringSnapshot, payload: unknown) {
  if (rule.rule_type === 'set_based') {
    const parsed = setBasedResultSchema.safeParse(payload)
    if (!parsed.success) return 'Placar indisponível'
    return parsed.data.sets
      .map(([left, right]) => `${left}–${right}`)
      .join(', ')
  }

  if (rule.rule_type === 'goal_based') {
    const parsed = goalBasedResultSchema.safeParse(payload)
    if (!parsed.success) return 'Placar indisponível'
    return `${parsed.data.goals[0]}–${parsed.data.goals[1]}`
  }

  const parsed = gameBasedResultSchema.safeParse(payload)
  if (!parsed.success) return 'Placar indisponível'
  return parsed.data.sets
    .map((set) => {
      if ('points' in set) return `${set.points[0]}–${set.points[1]}`
      const games = `${set.games[0]}–${set.games[1]}`
      if (!set.tiebreak) return games
      return `${games} (${set.tiebreak[0]}–${set.tiebreak[1]})`
    })
    .join(', ')
}

export function scoreLines(rule: ScoringSnapshot, payload: unknown) {
  if (rule.rule_type === 'set_based') {
    const parsed = setBasedResultSchema.safeParse(payload)
    if (!parsed.success) return []
    return parsed.data.sets.map(([left, right], index) => ({
      label: `Set ${index + 1}`,
      left: String(left),
      right: String(right),
    }))
  }

  if (rule.rule_type === 'goal_based') {
    const parsed = goalBasedResultSchema.safeParse(payload)
    if (!parsed.success) return []
    return [
      {
        label: 'Gols',
        left: String(parsed.data.goals[0]),
        right: String(parsed.data.goals[1]),
      },
    ]
  }

  const parsed = gameBasedResultSchema.safeParse(payload)
  if (!parsed.success) return []
  return parsed.data.sets.map((set, index) => {
    if ('points' in set) {
      return {
        label: `Set ${index + 1}`,
        left: String(set.points[0]),
        right: String(set.points[1]),
      }
    }
    const tiebreak = set.tiebreak
      ? ` · tiebreak ${set.tiebreak[0]}–${set.tiebreak[1]}`
      : ''
    return {
      label: `Set ${index + 1}${tiebreak}`,
      left: String(set.games[0]),
      right: String(set.games[1]),
    }
  })
}

export function confirmedSides(match: MatchRecord) {
  const sides = new Map(match.teams.map((team) => [team.id, team.side]))
  return new Set(
    match.confirmations.flatMap((item) => {
      const side = sides.get(item.teamId)
      return side ? [side] : []
    }),
  )
}

export function lineupError(
  side1: string[],
  side2: string[],
  minimum: number,
  maximum: number,
) {
  const count =
    minimum === maximum
      ? `${minimum} ${minimum === 1 ? 'jogador' : 'jogadores'}`
      : `de ${minimum} a ${maximum} jogadores`
  if (
    side1.length < minimum ||
    side1.length > maximum ||
    side2.length < minimum ||
    side2.length > maximum
  ) {
    return `Cada equipe precisa de ${count}.`
  }
  if (new Set([...side1, ...side2]).size !== side1.length + side2.length) {
    return 'Um jogador não pode estar nas duas equipes.'
  }
  return null
}

export function messageFromMatchError(error: unknown) {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String(error.message).toLowerCase()
      : ''
  if (message.includes('invalid match result')) {
    return 'O placar não fecha com a regra deste formato.'
  }
  if (message.includes('invalid lineup')) {
    return 'A escalação não respeita o formato ou inclui alguém de fora do encontro.'
  }
  if (message.includes('match frozen')) {
    return 'Esta partida não pode ser alterada neste estado.'
  }
  if (message.includes('meetup cancelled')) {
    return 'Este encontro foi cancelado.'
  }
  if (message.includes('meetup not started')) {
    return 'A confirmação abre depois que o encontro começa.'
  }
  if (message.includes('side already confirmed')) {
    return 'Esta equipe já confirmou este placar.'
  }
  if (message.includes('not allowed') || message.includes('42501')) {
    return 'Você não pode fazer isso.'
  }
  return 'Não foi possível concluir. Tente de novo.'
}

function toPlayer(player: z.infer<typeof playerSchema>): MatchPlayer {
  return { userId: player.user_id, username: player.username }
}

function parseRule(
  ruleType: 'set_based' | 'goal_based' | 'game_based',
  config: unknown,
): ScoringSnapshot {
  if (ruleType === 'set_based') {
    return { rule_type: ruleType, config: setBasedConfigSchema.parse(config) }
  }
  if (ruleType === 'goal_based') {
    return { rule_type: ruleType, config: goalBasedConfigSchema.parse(config) }
  }
  return { rule_type: ruleType, config: gameBasedConfigSchema.parse(config) }
}
