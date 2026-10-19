import { z } from 'zod'

import {
  addDaysToDate,
  wallClockInZone,
  zonedWallClockToUtc,
} from '@/domains/meetups/model/schedule.ts'

export const pollKinds = ['general', 'sport', 'schedule', 'location'] as const
export const selectionModes = ['single', 'multiple'] as const
export const pollStatuses = ['open', 'closed', 'cancelled'] as const

export type PollKind = (typeof pollKinds)[number]
export type SelectionMode = (typeof selectionModes)[number]
export type PollStatus = (typeof pollStatuses)[number]

export const pollTimeZone = 'America/Sao_Paulo'

export const pollKindLabels: Record<PollKind, string> = {
  general: 'Geral',
  sport: 'Modalidade',
  schedule: 'Horário',
  location: 'Local',
}

export const selectionModeLabels: Record<SelectionMode, string> = {
  single: 'Escolha única',
  multiple: 'Múltipla escolha',
}

export const pollStatusLabels: Record<PollStatus, string> = {
  open: 'Aberta',
  closed: 'Encerrada',
  cancelled: 'Cancelada',
}

export const pollFilterLabels: Record<PollStatus, string> = {
  open: 'Abertas',
  closed: 'Encerradas',
  cancelled: 'Canceladas',
}

const optionSchema = z.object({
  id: z.uuid(),
  label: z.string(),
  position: z.number().int(),
  sport_id: z.uuid().nullable(),
  starts_at: z.string().nullable(),
  time_zone: z.string().nullable(),
  vote_count: z.number().int(),
  percent: z.number().nullable(),
  leading: z.boolean(),
})

const pollSchema = z.object({
  id: z.uuid(),
  question: z.string(),
  description: z.string(),
  kind: z.enum(pollKinds),
  selection_mode: z.enum(selectionModes),
  max_selections: z.number().int(),
  status: z.enum(pollStatuses),
  effective_status: z.enum(pollStatuses),
  closes_at: z.string(),
  closed_at: z.string().nullable(),
  created_at: z.string(),
  created_by_username: z.string().nullable(),
  participant_count: z.number().int(),
  my_option_ids: z.array(z.uuid()),
  can_close: z.boolean(),
  can_cancel: z.boolean(),
  options: z.array(optionSchema),
})

const pageSchema = z.object({
  polls: z.array(pollSchema),
  has_older: z.boolean(),
})

export type PollOption = {
  id: string
  label: string
  position: number
  sportId: string | null
  startsAt: string | null
  timeZone: string | null
  voteCount: number
  percent: number | null
  leading: boolean
}

export type CommunityPoll = {
  id: string
  question: string
  description: string
  kind: PollKind
  selectionMode: SelectionMode
  maxSelections: number
  status: PollStatus
  effectiveStatus: PollStatus
  closesAt: string
  closedAt: string | null
  createdAt: string
  createdByUsername: string | null
  participantCount: number
  myOptionIds: string[]
  canClose: boolean
  canCancel: boolean
  options: PollOption[]
}

export type PollOptionDraft = {
  label: string
  sportId?: string
  date?: string
  time?: string
}

export type PollDraft = {
  question: string
  description: string
  kind: PollKind
  selectionMode: SelectionMode
  maxSelections: number
  date: string
  time: string
  options: PollOptionDraft[]
}

export type PollWrite = {
  question: string
  description: string
  kind: PollKind
  selectionMode: SelectionMode
  maxSelections: number
  closesAt: string
  options: Array<{
    label?: string
    sport_id?: string
    starts_at?: string
    time_zone?: string
  }>
}

const draftSchema = z.object({
  question: z.string(),
  description: z.string(),
  kind: z.enum(pollKinds),
  selectionMode: z.enum(selectionModes),
  maxSelections: z.number().int(),
  date: z.string(),
  time: z.string(),
  options: z.array(
    z.object({
      label: z.string(),
      sportId: z.string().optional(),
      date: z.string().optional(),
      time: z.string().optional(),
    }),
  ),
})

export function normalizePollText(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

export function defaultPollDraft(): PollDraft {
  const clock = wallClockInZone(new Date(), pollTimeZone)
  return {
    question: '',
    description: '',
    kind: 'general' as const,
    selectionMode: 'single' as const,
    maxSelections: 1,
    date: addDaysToDate(clock.date, 1),
    time: '18:00',
    options: [{ label: '' }, { label: '' }],
  }
}

export function buildPollInput(
  draft: PollDraft,
): { ok: true; value: PollWrite } | { ok: false; error: string } {
  const parsed = draftSchema.safeParse(draft)
  if (!parsed.success) return { ok: false, error: 'Revise a enquete.' }
  const question = normalizePollText(parsed.data.question)
  if (question.length < 3 || question.length > 140) {
    return { ok: false, error: 'A pergunta precisa ter de 3 a 140 caracteres.' }
  }
  const description = parsed.data.description.trim()
  if (description.length > 500) {
    return { ok: false, error: 'A descrição pode ter até 500 caracteres.' }
  }
  let closesAt: Date
  try {
    closesAt = zonedWallClockToUtc(
      parsed.data.date,
      parsed.data.time,
      pollTimeZone,
    )
  } catch {
    return { ok: false, error: 'Informe a data de encerramento.' }
  }

  const options: PollWrite['options'] = []
  const seen = new Set<string>()
  if (parsed.data.kind === 'sport') {
    for (const option of parsed.data.options) {
      if (!option.sportId || seen.has(option.sportId)) {
        return { ok: false, error: 'Escolha modalidades diferentes.' }
      }
      seen.add(option.sportId)
      options.push({ sport_id: option.sportId })
    }
  } else {
    for (const option of parsed.data.options) {
      const label = normalizePollText(option.label)
      const key = label.toLocaleLowerCase('pt-BR')
      if (!label || label.length > 80 || seen.has(key)) {
        return {
          ok: false,
          error: 'As opções precisam ser preenchidas e diferentes.',
        }
      }
      seen.add(key)
      const date = option.date?.trim() ?? ''
      const time = option.time?.trim() ?? ''
      if (parsed.data.kind === 'schedule' && (date !== '' || time !== '')) {
        if (date === '' || time === '') {
          return {
            ok: false,
            error: 'A opção de horário precisa de data e hora, ou só o texto.',
          }
        }
        try {
          options.push({
            label,
            starts_at: zonedWallClockToUtc(
              date,
              time,
              pollTimeZone,
            ).toISOString(),
            time_zone: pollTimeZone,
          })
        } catch {
          return { ok: false, error: 'Revise a data da opção.' }
        }
      } else {
        options.push({ label })
      }
    }
  }

  if (options.length < 2 || options.length > 10) {
    return { ok: false, error: 'Inclua de 2 a 10 opções.' }
  }
  const maxSelections =
    parsed.data.selectionMode === 'single' ? 1 : parsed.data.maxSelections
  if (
    parsed.data.selectionMode === 'multiple' &&
    (maxSelections < 1 || maxSelections > options.length)
  ) {
    return {
      ok: false,
      error: 'O máximo de escolhas não pode passar da quantidade de opções.',
    }
  }

  return {
    ok: true,
    value: {
      question,
      description,
      kind: parsed.data.kind,
      selectionMode: parsed.data.selectionMode,
      maxSelections,
      closesAt: closesAt.toISOString(),
      options,
    },
  }
}

export function parseCommunityPoll(data: unknown) {
  const poll = pollSchema.parse(data)
  return toPoll(poll)
}

export function parseCommunityPolls(data: unknown) {
  const page = pageSchema.parse(data)
  return {
    polls: page.polls.map(toPoll),
    hasOlder: page.has_older,
  }
}

export function formatPollPercent(percent: number) {
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(percent)}%`
}

export function describePollResult(poll: CommunityPoll) {
  if (poll.effectiveStatus === 'cancelled') {
    return 'Enquete cancelada. O resultado não vale como decisão do grupo.'
  }
  if (poll.participantCount === 0) return 'Ninguém votou.'
  if (poll.effectiveStatus !== 'closed') return ''
  const leaders = poll.options.filter((option) => option.leading)
  if (leaders.length > 1) return 'Empate entre as mais votadas.'
  if (leaders.length === 1) return `Mais votada: ${leaders[0]?.label}.`
  return ''
}

export function messageFromPollError(error: unknown) {
  const message =
    typeof error === 'object' && error && 'message' in error
      ? String(error.message)
      : error instanceof Error
        ? error.message
        : ''
  if (message.includes('too many polls')) {
    return 'Você publicou muitas enquetes nesta comunidade. Espere um pouco.'
  }
  if (message.includes('too few options')) {
    return 'Inclua pelo menos duas opções.'
  }
  if (message.includes('too many options')) {
    return 'Uma enquete pode ter no máximo dez opções.'
  }
  if (message.includes('too many selections')) {
    return 'Você marcou mais opções do que o permitido.'
  }
  if (message.includes('duplicate option')) return 'Há opções repetidas.'
  if (message.includes('invalid closing time')) {
    return 'O encerramento precisa ficar entre 15 minutos e 30 dias.'
  }
  if (message.includes('sport not in community')) {
    return 'A modalidade precisa fazer parte da comunidade.'
  }
  if (message.includes('invalid schedule')) return 'Revise a data e o fuso.'
  if (message.includes('poll cancelled')) return 'Esta enquete foi cancelada.'
  if (message.includes('poll closed')) return 'Esta enquete já encerrou.'
  if (message.includes('poll is immutable')) {
    return 'A enquete publicada não pode ser alterada.'
  }
  if (message.includes('invalid option')) return 'Revise as opções da enquete.'
  if (message.includes('invalid selection')) return 'Revise o modo de votação.'
  if (message.includes('invalid category'))
    return 'Escolha uma categoria válida.'
  if (message.includes('invalid poll')) return 'Revise a pergunta da enquete.'
  if (message.includes('not found')) return 'Enquete não encontrada.'
  if (
    message.includes('not allowed') ||
    message.includes('not authenticated')
  ) {
    return 'Você não pode participar desta enquete.'
  }
  return 'Não foi possível concluir a enquete.'
}

export function isPollAuthorizationError(error: unknown) {
  const message =
    typeof error === 'object' && error && 'message' in error
      ? String(error.message)
      : ''
  return message.includes('not allowed') || message.includes('not found')
}

function toPoll(poll: z.infer<typeof pollSchema>): CommunityPoll {
  return {
    id: poll.id,
    question: poll.question,
    description: poll.description,
    kind: poll.kind,
    selectionMode: poll.selection_mode,
    maxSelections: poll.max_selections,
    status: poll.status,
    effectiveStatus: poll.effective_status,
    closesAt: poll.closes_at,
    closedAt: poll.closed_at,
    createdAt: poll.created_at,
    createdByUsername: poll.created_by_username,
    participantCount: poll.participant_count,
    myOptionIds: poll.my_option_ids,
    canClose: poll.can_close,
    canCancel: poll.can_cancel,
    options: poll.options.map((option) => ({
      id: option.id,
      label: option.label,
      position: option.position,
      sportId: option.sport_id,
      startsAt: option.starts_at,
      timeZone: option.time_zone,
      voteCount: option.vote_count,
      percent: option.percent,
      leading: option.leading,
    })),
  }
}
