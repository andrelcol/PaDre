import { z } from 'zod'

import { usernameSchema } from '@/domains/identity/model/profile.ts'

export const communityRoles = ['owner', 'admin', 'member'] as const
export const communityVisibilities = ['public', 'private'] as const

export type CommunityRole = (typeof communityRoles)[number]
export type CommunityVisibility = (typeof communityVisibilities)[number]

export const communityRoleLabels: Record<CommunityRole, string> = {
  owner: 'Proprietário',
  admin: 'Administrador',
  member: 'Integrante',
}

export const communityVisibilityLabels: Record<CommunityVisibility, string> = {
  public: 'Pública',
  private: 'Privada',
}

const nameMessage = 'Informe um nome de 2 a 60 caracteres, sem controles.'
const descriptionMessage =
  'A descrição pode ter até 500 caracteres, sem controles.'
const sportsMessage = 'Escolha ao menos uma modalidade.'

function hasControlCharacter(value: string) {
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (code <= 31 || code === 127) return true
  }
  return false
}

export const communityDraftSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, nameMessage)
    .max(60, nameMessage)
    .refine((value) => !hasControlCharacter(value), nameMessage),
  description: z
    .string()
    .trim()
    .max(500, descriptionMessage)
    .refine((value) => !hasControlCharacter(value), descriptionMessage),
  visibility: z.enum(communityVisibilities),
  sportIds: z.array(z.uuid()).min(1, sportsMessage),
})

export type CommunityDraft = z.infer<typeof communityDraftSchema>

export type CommunityFormValues = {
  name: string
  description: string
  visibility: CommunityVisibility
  sportIds: string[]
}

export const communityInviteSchema = z.object({
  username: usernameSchema,
})

const sportSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
})

const summarySchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  visibility: z.enum(communityVisibilities),
  member_count: z.int().nonnegative(),
  sports: z.array(sportSchema),
})

const memberSchema = z.object({
  user_id: z.uuid(),
  username: z.string().min(1),
  role: z.enum(communityRoles),
})

const pendingInviteSchema = z.object({
  id: z.uuid(),
  username: z.string().min(1),
})

const detailSchema = summarySchema.extend({
  my_role: z.enum(communityRoles).nullable(),
  members: z.array(memberSchema).nullable(),
  invitations: z.array(pendingInviteSchema).nullable(),
})

const invitationSchema = z.object({
  id: z.uuid(),
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  visibility: z.enum(communityVisibilities),
})

export type CommunitySport = { id: string; name: string }

export type CommunitySummary = {
  slug: string
  name: string
  description: string
  visibility: CommunityVisibility
  memberCount: number
  sports: CommunitySport[]
}

export type MyCommunity = CommunitySummary & { role: CommunityRole }

export type CommunityMember = {
  userId: string
  username: string
  role: CommunityRole
}

export type CommunityInvite = {
  id: string
  slug: string
  name: string
  description: string
  visibility: CommunityVisibility
}

export type PendingCommunityInvite = { id: string; username: string }

export type CommunityDetail = CommunitySummary & {
  myRole: CommunityRole | null
  members: CommunityMember[] | null
  invitations: PendingCommunityInvite[] | null
}

function toSummary(row: z.infer<typeof summarySchema>): CommunitySummary {
  return {
    slug: row.slug,
    name: row.name,
    description: row.description,
    visibility: row.visibility,
    memberCount: row.member_count,
    sports: row.sports,
  }
}

export function parsePublicCommunities(data: unknown): CommunitySummary[] {
  const parsed = z.object({ communities: z.array(summarySchema) }).parse(data)
  return parsed.communities.map(toSummary)
}

export function parseMyCommunities(data: unknown): MyCommunity[] {
  const parsed = z
    .object({
      communities: z.array(
        summarySchema.extend({ role: z.enum(communityRoles) }),
      ),
    })
    .parse(data)
  return parsed.communities.map((row) => ({
    ...toSummary(row),
    role: row.role,
  }))
}

export function parseCommunityInvites(data: unknown): CommunityInvite[] {
  const parsed = z
    .object({ invitations: z.array(invitationSchema) })
    .parse(data)
  return parsed.invitations
}

export function parseCommunityDetail(data: unknown): CommunityDetail {
  const row = detailSchema.parse(data)
  return {
    ...toSummary(row),
    myRole: row.my_role,
    members:
      row.members?.map((member) => ({
        userId: member.user_id,
        username: member.username,
        role: member.role,
      })) ?? null,
    invitations: row.invitations,
  }
}

export function parseCommunitySlug(data: unknown) {
  return z.object({ slug: z.string().min(1) }).parse(data).slug
}

export function memberCountLabel(count: number) {
  return count === 1 ? '1 integrante' : `${count} integrantes`
}

export function canInvite(role: CommunityRole | null) {
  return role === 'owner' || role === 'admin'
}

export function canEditCommunity(role: CommunityRole | null) {
  return role === 'owner' || role === 'admin'
}

export function canChangeVisibility(role: CommunityRole | null) {
  return role === 'owner'
}

export function canLeave(role: CommunityRole | null) {
  return role === 'admin' || role === 'member'
}

export function canSetMemberRole(role: CommunityRole | null) {
  return role === 'owner'
}

export function canRemoveMember(
  actor: CommunityRole | null,
  target: CommunityRole,
) {
  if (target === 'owner' || actor === null) return false
  if (actor === 'owner') return true
  return actor === 'admin' && target === 'member'
}

function communityErrorText(error: unknown) {
  if (!error || typeof error !== 'object' || !('message' in error)) return ''
  return typeof error.message === 'string' ? error.message.toLowerCase() : ''
}

export function messageFromCommunityError(error: unknown) {
  const message = communityErrorText(error)
  const code =
    typeof error === 'object' && error && 'code' in error
      ? String(error.code)
      : ''

  if (message.includes('not found')) return 'Comunidade não encontrada.'
  if (message.includes('reentry requires invitation')) {
    return 'Quem foi removido só volta com um convite.'
  }
  if (message.includes('owner cannot leave')) {
    return 'O proprietário não pode sair.'
  }
  if (message.includes('cancel community meetups before leaving')) {
    return 'Cancele os encontros futuros que essa pessoa organiza antes de sair ou removê-la.'
  }
  if (message.includes('already a member')) {
    return 'Essa pessoa já participa.'
  }
  if (message.includes('invitation already pending')) {
    return 'Já existe um convite pendente.'
  }
  if (message.includes('invitation cooldown')) {
    return 'Espere 24 horas para convidar de novo.'
  }
  if (message.includes('too many pending invitations')) {
    return 'Há convites demais em aberto.'
  }
  if (message.includes('cannot invite yourself')) {
    return 'Você não pode convidar a si mesmo.'
  }
  if (message.includes('user not found')) {
    return 'Não encontramos esse nome de usuário.'
  }
  if (message.includes('invalid community name')) return nameMessage
  if (message.includes('invalid community description')) {
    return descriptionMessage
  }
  if (message.includes('sport required')) return sportsMessage
  if (message.includes('unknown sport')) {
    return 'Essa modalidade não está disponível.'
  }
  if (message.includes('invalid role')) {
    return 'Esse papel não pode ser atribuído.'
  }
  if (message.includes('not authenticated')) return 'Você precisa entrar.'
  if (
    message.includes('not allowed') ||
    message.includes('permission denied') ||
    code === '42501'
  ) {
    return 'Você não pode fazer isso.'
  }
  return 'Não foi possível concluir. Tente de novo.'
}
