import { z } from 'zod'

const inviteTokenPattern = /^[A-Za-z0-9_-]{43}$/

export const inviteLinkStates = [
  'none',
  'active',
  'expired',
  'revoked',
] as const

export const invitePreviewStatuses = [
  'unavailable',
  'open',
  'expired',
  'cancelled',
  'confirmed',
] as const

export function inviteReturnPath(value: string | null | undefined) {
  if (!value?.startsWith('/convite/')) return null
  const token = value.slice('/convite/'.length)
  if (!inviteTokenPattern.test(token)) return null
  return `/convite/${token}`
}

export function inviteAuthPath(
  path: '/entrar' | '/cadastrar',
  retorno: string | null | undefined,
) {
  const safe = inviteReturnPath(retorno)
  if (!safe) return path
  return `${path}?retorno=${encodeURIComponent(safe)}`
}

export function inviteEmailRedirect(
  origin: string,
  retorno: string | null | undefined,
) {
  const safe = inviteReturnPath(retorno)
  if (!safe) return undefined
  try {
    const url = new URL(safe, origin)
    if (url.origin !== new URL(origin).origin) return undefined
    if (url.pathname !== safe || url.search || url.hash) return undefined
    return url.toString()
  } catch {
    return undefined
  }
}

export function inviteShareUrl(origin: string, token: string) {
  const path = inviteReturnPath(`/convite/${token}`)
  if (!path) return null
  return inviteEmailRedirect(origin, path) ?? null
}

const previewFields = {
  title: z.string(),
  sport_name: z.string(),
  format_name: z.string(),
  starts_at: z.string(),
  ends_at: z.string(),
  time_zone: z.string(),
  location_name: z.string(),
  open_spots: z.number().int(),
  participation: z.enum(['confirmed', 'left', 'removed']).nullable(),
  meetup_id: z.uuid().nullable(),
}

export const invitePreviewSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('unavailable') }),
  z.object({ status: z.literal('open'), ...previewFields }),
  z.object({ status: z.literal('expired'), ...previewFields }),
  z.object({ status: z.literal('cancelled'), ...previewFields }),
  z.object({ status: z.literal('confirmed'), ...previewFields }),
])

export type InvitePreview = z.infer<typeof invitePreviewSchema>

export function parseInvitePreview(value: unknown): InvitePreview {
  return invitePreviewSchema.parse(value)
}

export const inviteLinkSchema = z.object({
  state: z.enum(inviteLinkStates),
  expires_at: z.string().nullable(),
  revoked_at: z.string().nullable(),
  created_at: z.string().nullable(),
})

export type InviteLinkStatus = z.infer<typeof inviteLinkSchema>

export function parseInviteLinkStatus(value: unknown): InviteLinkStatus {
  return inviteLinkSchema.parse(value)
}

const issuedLinkSchema = z.object({
  token: z.string().regex(inviteTokenPattern),
  expires_at: z.string(),
})

export function parseIssuedInviteLink(value: unknown) {
  const row = z.array(issuedLinkSchema).length(1).parse(value)[0]
  if (!row) {
    throw new Error('Não foi possível gerar o link.')
  }
  return row
}
