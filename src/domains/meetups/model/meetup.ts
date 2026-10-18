import { z } from 'zod'

import { timezoneSchema } from '@/domains/identity/model/profile.ts'
import { scoringRuleSchema } from '@/domains/sports/model/scoring.ts'

import {
  addDaysToDate,
  wallClockInZone,
  zonedWallClockToUtc,
} from './schedule.ts'

export const meetupCapacityMin = 2
export const meetupCapacityMax = 64
export const meetupDurationMs = 24 * 60 * 60 * 1000

export const meetupStatuses = ['scheduled', 'cancelled'] as const
export const meetupRelations = ['organizing', 'confirmed', 'invited'] as const
export const invitationStatuses = [
  'pending',
  'accepted',
  'declined',
  'cancelled',
] as const

export function openSpots(maxParticipants: number, confirmedCount: number) {
  return Math.max(0, maxParticipants - confirmedCount)
}

export function canChangeStructure(confirmedCount: number) {
  return confirmedCount <= 1
}

export type MeetupFormValues = {
  sportId: string
  sportFormatId: string
  title: string
  description: string
  locationName: string
  locationAddress: string
  timeZone: string
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  maxParticipants: number
}

export function defaultMeetupFormValues(timeZone: string): MeetupFormValues {
  const today = wallClockInZone(new Date(), timeZone).date
  const tomorrow = addDaysToDate(today, 1)
  return {
    sportId: '',
    sportFormatId: '',
    title: '',
    description: '',
    locationName: '',
    locationAddress: '',
    timeZone,
    startDate: tomorrow,
    startTime: '19:00',
    endDate: tomorrow,
    endTime: '21:00',
    maxParticipants: 10,
  }
}

export function splitMeetups(items: MeetupSummary[], now = new Date()) {
  return {
    upcoming: items.filter(
      (item) =>
        item.status === 'scheduled' &&
        new Date(item.startsAt) >= now &&
        item.relation !== 'invited',
    ),
    organizing: items.filter(
      (item) => item.relation === 'organizing' && item.status === 'scheduled',
    ),
    invited: items.filter((item) => item.relation === 'invited'),
    earlier: items.filter(
      (item) => item.status === 'cancelled' || new Date(item.startsAt) < now,
    ),
  }
}

const wallDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data.')
const wallTime = z.string().regex(/^\d{2}:\d{2}$/, 'Informe o horário.')

export const meetupDraftSchema = z
  .object({
    sportFormatId: z.uuid('Escolha um formato.'),
    scoringRuleVersionId: z.uuid('Escolha um formato com regra ativa.'),
    title: z.string().trim().min(1, 'Informe o título.').max(80),
    description: z.string().trim().max(500),
    locationName: z.string().trim().min(1, 'Informe o local.').max(120),
    locationAddress: z.string().trim().max(200),
    timeZone: timezoneSchema,
    startDate: wallDate,
    startTime: wallTime,
    endDate: wallDate,
    endTime: wallTime,
    maxParticipants: z
      .number()
      .int('Informe um número inteiro.')
      .min(meetupCapacityMin, 'A capacidade mínima é 2.')
      .max(meetupCapacityMax, 'A capacidade máxima é 64.'),
  })
  .superRefine((draft, context) => {
    let starts: Date
    let ends: Date
    try {
      starts = zonedWallClockToUtc(
        draft.startDate,
        draft.startTime,
        draft.timeZone,
      )
      ends = zonedWallClockToUtc(draft.endDate, draft.endTime, draft.timeZone)
    } catch {
      context.addIssue({
        code: 'custom',
        path: ['startDate'],
        message: 'Informe data e horário válidos.',
      })
      return
    }

    if (ends <= starts) {
      context.addIssue({
        code: 'custom',
        path: ['endTime'],
        message: 'O término precisa ser depois do início.',
      })
    } else if (ends.getTime() - starts.getTime() > meetupDurationMs) {
      context.addIssue({
        code: 'custom',
        path: ['endTime'],
        message: 'O encontro pode durar no máximo 24 horas.',
      })
    }

    if (starts.getTime() <= Date.now()) {
      context.addIssue({
        code: 'custom',
        path: ['startTime'],
        message: 'O encontro precisa começar no futuro.',
      })
    }
  })

export type MeetupDraft = z.infer<typeof meetupDraftSchema>

export function meetupInstants(draft: MeetupDraft) {
  return {
    startsAt: zonedWallClockToUtc(
      draft.startDate,
      draft.startTime,
      draft.timeZone,
    ).toISOString(),
    endsAt: zonedWallClockToUtc(
      draft.endDate,
      draft.endTime,
      draft.timeZone,
    ).toISOString(),
  }
}

const summarySchema = z.object({
  id: z.uuid(),
  title: z.string(),
  status: z.enum(meetupStatuses),
  starts_at: z.string(),
  ends_at: z.string(),
  time_zone: z.string(),
  location_name: z.string(),
  sport_name: z.string(),
  format_name: z.string(),
  relation: z.enum(meetupRelations),
  confirmed_count: z.number().int(),
  max_participants: z.number().int(),
  invitation_id: z.uuid().nullable(),
})

export const meetupSummarySchema = z.object({
  id: z.uuid(),
  title: z.string(),
  status: z.enum(meetupStatuses),
  startsAt: z.string(),
  endsAt: z.string(),
  timeZone: z.string(),
  locationName: z.string(),
  sportName: z.string(),
  formatName: z.string(),
  relation: z.enum(meetupRelations),
  confirmedCount: z.number().int(),
  maxParticipants: z.number().int(),
  invitationId: z.uuid().nullable(),
})

export type MeetupSummary = z.infer<typeof meetupSummarySchema>

export function parseMeetupSummaries(rows: unknown): MeetupSummary[] {
  return z
    .array(summarySchema)
    .parse(rows ?? [])
    .map((row) =>
      meetupSummarySchema.parse({
        id: row.id,
        title: row.title,
        status: row.status,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        timeZone: row.time_zone,
        locationName: row.location_name,
        sportName: row.sport_name,
        formatName: row.format_name,
        relation: row.relation,
        confirmedCount: row.confirmed_count,
        maxParticipants: row.max_participants,
        invitationId: row.invitation_id,
      }),
    )
}

const detailSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.enum(meetupStatuses),
  starts_at: z.string(),
  ends_at: z.string(),
  time_zone: z.string(),
  location_name: z.string(),
  location_address: z.string().nullable(),
  max_participants: z.number().int(),
  confirmed_count: z.number().int(),
  open_spots: z.number().int(),
  sport_id: z.uuid(),
  sport_name: z.string(),
  sport_format_id: z.uuid(),
  format_name: z.string(),
  scoring_rule_version_id: z.uuid(),
  rule: scoringRuleSchema,
  organizer_username: z.string(),
  is_organizer: z.boolean(),
  my_participation: z.enum(['confirmed', 'left', 'removed']).nullable(),
  participants: z.array(z.object({ username: z.string() })),
  my_invitation: z
    .object({
      id: z.uuid(),
      status: z.enum(invitationStatuses),
    })
    .nullable(),
  invitations: z.array(
    z.object({
      id: z.uuid(),
      username: z.string(),
      status: z.enum(invitationStatuses),
    }),
  ),
})

export type MeetupDetail = {
  id: string
  title: string
  description: string
  status: (typeof meetupStatuses)[number]
  startsAt: string
  endsAt: string
  timeZone: string
  locationName: string
  locationAddress: string
  maxParticipants: number
  confirmedCount: number
  openSpots: number
  sportId: string
  sportName: string
  sportFormatId: string
  formatName: string
  scoringRuleVersionId: string
  rule: z.infer<typeof scoringRuleSchema>
  organizerUsername: string
  isOrganizer: boolean
  myParticipation: 'confirmed' | 'left' | 'removed' | null
  participants: { username: string }[]
  myInvitation: {
    id: string
    status: (typeof invitationStatuses)[number]
  } | null
  invitations: {
    id: string
    username: string
    status: (typeof invitationStatuses)[number]
  }[]
}

export function parseMeetupDetail(value: unknown): MeetupDetail {
  const row = detailSchema.parse(value)
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timeZone: row.time_zone,
    locationName: row.location_name,
    locationAddress: row.location_address ?? '',
    maxParticipants: row.max_participants,
    confirmedCount: row.confirmed_count,
    openSpots: row.open_spots,
    sportId: row.sport_id,
    sportName: row.sport_name,
    sportFormatId: row.sport_format_id,
    formatName: row.format_name,
    scoringRuleVersionId: row.scoring_rule_version_id,
    rule: row.rule,
    organizerUsername: row.organizer_username,
    isOrganizer: row.is_organizer,
    myParticipation: row.my_participation,
    participants: row.participants,
    myInvitation: row.my_invitation,
    invitations: row.invitations,
  }
}

export function meetupErrorMessage(error: { message?: string; code?: string }) {
  const message = error.message?.toLowerCase() ?? ''
  if (message.includes('cannot invite yourself')) {
    return 'Você não pode convidar a si mesmo.'
  }
  if (message.includes('user not found')) {
    return 'Não encontramos esse nome de usuário.'
  }
  if (message.includes('not friends')) {
    return 'Só é possível convidar uma amizade confirmada.'
  }
  if (message.includes('already participating')) {
    return 'Essa pessoa já participa do encontro.'
  }
  if (message.includes('cannot be reopened')) {
    return 'Quem saiu não volta a participar nesta versão.'
  }
  if (message.includes('invite unavailable')) {
    return 'Este convite não está mais disponível.'
  }
  if (message.includes('meetup is full')) {
    return 'Não há vagas disponíveis.'
  }
  if (message.includes('meetup cancelled')) {
    return 'Este encontro foi cancelado.'
  }
  if (message.includes('already started')) {
    return 'Este encontro já começou.'
  }
  if (message.includes('organizer cannot leave')) {
    return 'Quem organiza cancela o encontro em vez de sair.'
  }
  if (message.includes('capacity below confirmed')) {
    return 'A capacidade não pode ficar abaixo dos confirmados.'
  }
  if (message.includes('structural change locked')) {
    return 'Com outros confirmados, modalidade, regra e horário ficam travados.'
  }
  if (message.includes('sport format not found')) {
    return 'Escolha um formato ativo do catálogo.'
  }
  if (message.includes('scoring rule does not match')) {
    return 'A regra de pontuação não pertence a esse formato.'
  }
  if (
    message.includes('invalid meetup schedule') ||
    message.includes('invalid meetup field')
  ) {
    return 'Revise data, horário, fuso e capacidade.'
  }
  if (
    message.includes('invalid invitation transition') ||
    error.code === '42501'
  ) {
    return 'Você não pode alterar esse encontro.'
  }
  return 'Não foi possível concluir. Tente de novo.'
}

export function messageFromMeetupError(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    const details = error as { message?: string; code?: string }
    return meetupErrorMessage(details)
  }
  return meetupErrorMessage({})
}
