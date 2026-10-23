import { z } from 'zod'

import { parseCoordinatePair } from '@/domains/maps/model/coordinates.ts'

export const venueStatuses = ['active', 'archived'] as const
export const venueScopes = ['personal', 'community'] as const

export type VenueStatus = (typeof venueStatuses)[number]
export type VenueScope = (typeof venueScopes)[number]

export type Venue = {
  id: string
  name: string
  address: string
  details: string
  latitude: number | null
  longitude: number | null
  status: VenueStatus
  scope: VenueScope
  createdAt: string
  updatedAt: string
}

export type VenueDraft = {
  name: string
  address: string
  details: string
  latitude: number | null
  longitude: number | null
}

export type VenueEdit = {
  name: string
  details: string
}

export type VenueMeetup = {
  id: string
  title: string
  status: string
  startsAt: string
  locationName: string
  locationAddress: string
}

const venueRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  address: z.string(),
  details: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  status: z.enum(venueStatuses),
  scope: z.enum(venueScopes),
  created_at: z.string(),
  updated_at: z.string(),
})

export const venueDraftSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Informe o nome do local.')
      .max(80, 'Use no máximo 80 caracteres.'),
    address: z
      .string()
      .trim()
      .min(1, 'Informe o endereço.')
      .max(200, 'Use no máximo 200 caracteres.'),
    details: z.string().trim().max(500, 'Use no máximo 500 caracteres.'),
    latitude: z.number().nullable().default(null),
    longitude: z.number().nullable().default(null),
  })
  .superRefine((draft, context) => {
    const missingOne = (draft.latitude == null) !== (draft.longitude == null)
    const invalidPair =
      draft.latitude != null &&
      draft.longitude != null &&
      !parseCoordinatePair(draft.latitude, draft.longitude)
    if (missingOne || invalidPair) {
      context.addIssue({
        code: 'custom',
        path: ['latitude'],
        message: 'Informe uma posição válida ou deixe o mapa sem marcação.',
      })
    }
  })

export const venueEditSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Informe o nome do local.')
    .max(80, 'Use no máximo 80 caracteres.'),
  details: z.string().trim().max(500, 'Use no máximo 500 caracteres.'),
})

export function venueStatusLabel(status: VenueStatus) {
  return status === 'active' ? 'Ativo' : 'Arquivado'
}

export function venueScopeLabel(scope: VenueScope) {
  return scope === 'personal' ? 'Pessoal' : 'Comunidade'
}

export function parseVenue(value: unknown): Venue {
  const row = venueRowSchema.parse(value)
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    details: row.details ?? '',
    latitude: row.latitude,
    longitude: row.longitude,
    status: row.status,
    scope: row.scope,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function parseVenues(value: unknown): Venue[] {
  return z
    .array(venueRowSchema)
    .parse(value ?? [])
    .map((row) => parseVenue(row))
}

const venueMeetupSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  status: z.string(),
  starts_at: z.string(),
  location_name: z.string(),
  location_address: z.string().nullable(),
})

export function parseVenueMeetups(value: unknown) {
  const page = z
    .object({
      meetups: z.array(venueMeetupSchema),
      total: z.number().int(),
    })
    .parse(value)
  return {
    meetups: page.meetups.map((meetup) => ({
      id: meetup.id,
      title: meetup.title,
      status: meetup.status,
      startsAt: meetup.starts_at,
      locationName: meetup.location_name,
      locationAddress: meetup.location_address ?? '',
    })),
    total: page.total,
  }
}

export function messageFromVenueError(error: unknown) {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String(error.message).toLowerCase()
      : ''
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String(error.code)
      : ''
  if (message.includes('invalid coordinates')) {
    return 'Informe latitude e longitude juntas, dentro dos limites válidos.'
  }
  if (message.includes('invalid venue')) {
    return 'Revise o nome, o endereço e os detalhes.'
  }
  if (message.includes('venue archived')) {
    return 'Local arquivado não volta a ficar ativo. Cadastre outro.'
  }
  if (message.includes('location already set')) {
    return 'A posição deste local já foi registrada e não pode ser trocada.'
  }
  if (message.includes('venue identity is protected')) {
    return 'Endereço e posição registrada ficam fixos. Para outro lugar, arquive e cadastre de novo.'
  }
  if (message.includes('not found') || code === '42501') {
    return 'Você não pode alterar esse local.'
  }
  return 'Não foi possível concluir. Tente de novo.'
}

export function venueLoadError(error: unknown) {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String(error.code)
      : ''
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String(error.message).toLowerCase()
      : ''
  if (code === '42501' || message.includes('not allowed')) {
    return 'Você não pode ver estes locais.'
  }
  if (message.includes('not found')) {
    return 'Não encontramos esses locais.'
  }
  return 'Não foi possível carregar os locais.'
}
