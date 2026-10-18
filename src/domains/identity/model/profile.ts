import { z } from 'zod'

export const usernamePattern = /^[a-z][a-z0-9_]{2,29}$/

export const visibilityValues = ['private', 'public'] as const

export const visibilityLabels = {
  private: 'Privado',
  public: 'Público',
} as const

const usernameMessage =
  'Use de 3 a 30 caracteres: comece com letra e use letras minúsculas, números ou _.'
const displayNameMessage =
  'Informe um nome de 1 a 80 caracteres, sem controles.'
const emailMessage = 'Informe um e-mail válido.'
const passwordMessage = 'A senha precisa ter pelo menos 8 caracteres.'
const timezoneMessage = 'Escolha um fuso IANA.'

function hasControlCharacter(value: string) {
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (code <= 31 || code === 127) return true
  }
  return false
}

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase()
}

export function normalizeDisplayName(value: string) {
  return value.trim()
}

export function getTimeZones() {
  return Intl.supportedValuesOf('timeZone')
}

export function isIanaTimeZone(value: string) {
  return getTimeZones().includes(value)
}

export const usernameSchema = z
  .string()
  .transform(normalizeUsername)
  .refine((value) => usernamePattern.test(value), usernameMessage)

export const displayNameSchema = z
  .string()
  .transform(normalizeDisplayName)
  .refine(
    (value) =>
      value.length >= 1 && value.length <= 80 && !hasControlCharacter(value),
    displayNameMessage,
  )

export const emailSchema = z.string().trim().pipe(z.email(emailMessage))

export const passwordSchema = z.string().min(8, passwordMessage)

export const timezoneSchema = z.string().refine(isIanaTimeZone, timezoneMessage)

export const visibilitySchema = z.enum(visibilityValues)

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Informe a senha.'),
})

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  username: usernameSchema,
  displayName: displayNameSchema,
})

export const recoverSchema = z.object({
  email: emailSchema,
})

export const resetSchema = z.object({
  password: passwordSchema,
})

export const profileEditSchema = z.object({
  username: usernameSchema,
  displayName: displayNameSchema,
  visibility: visibilitySchema,
  timezone: timezoneSchema,
})

export const ownProfileSchema = profileEditSchema.extend({
  id: z.uuid(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
})

export type LoginInput = z.infer<typeof loginSchema>
export type SignupInput = z.infer<typeof signupSchema>
export type RecoverInput = z.infer<typeof recoverSchema>
export type ResetInput = z.infer<typeof resetSchema>
export type ProfileEdit = z.infer<typeof profileEditSchema>
export type OwnProfile = z.infer<typeof ownProfileSchema>
export type Visibility = z.infer<typeof visibilitySchema>

export function fieldErrorsFromZod(error: z.ZodError) {
  const fields: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path[0]
    if (typeof key === 'string' && !fields[key]) {
      fields[key] = issue.message
    }
  }
  return fields
}

export function formatProfileTimestamp(value: string, timeZone: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(value))
}
