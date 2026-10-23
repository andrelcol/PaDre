import { z } from 'zod'

export const sexValues = ['female', 'male', 'intersex'] as const

export const sexLabels = {
  female: 'Feminino',
  male: 'Masculino',
  intersex: 'Intersexo',
} as const

export const avatarStorageAvailable = false

export const avatarUnavailableMessage =
  'O envio de foto não está disponível neste ambiente. O servidor local não tem armazenamento de arquivos.'

const detailsSchema = z.object({
  height_cm: z.number().int().min(50).max(250).nullable(),
  sex: z.enum(sexValues).nullable(),
  show_height: z.boolean(),
  show_sex: z.boolean(),
  show_avatar: z.boolean(),
  avatar_path: z.string().nullable(),
})

export type PersonalDetails = z.infer<typeof detailsSchema>

export const personalDetailsInputSchema = z.object({
  heightCm: z
    .string()
    .trim()
    .refine(
      (value) =>
        value === '' ||
        (Number.isInteger(Number(value)) &&
          Number(value) >= 50 &&
          Number(value) <= 250),
      'Informe a altura em centímetros, entre 50 e 250, ou deixe em branco.',
    ),
  sex: z.string(),
  showHeight: z.boolean(),
  showSex: z.boolean(),
  showAvatar: z.boolean(),
})

export function parsePersonalDetails(value: unknown): PersonalDetails {
  return detailsSchema.parse(value)
}

export function heightLabel(height: number | null | undefined) {
  if (height == null) return 'Não informado'
  return `${height} cm`
}

export function sexLabel(sex: PersonalDetails['sex'] | undefined) {
  if (!sex) return 'Não informado'
  return sexLabels[sex]
}

export function validateAvatarFile(file: File) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowed.includes(file.type)) {
    return 'Use uma imagem JPEG, PNG ou WebP.'
  }
  if (file.size > 2 * 1024 * 1024) {
    return 'A imagem precisa ter no máximo 2 MB.'
  }
  return null
}

export async function uploadAvatar(file: File) {
  const invalid = validateAvatarFile(file)
  if (invalid) throw new Error(invalid)
  throw new Error(avatarUnavailableMessage)
}
