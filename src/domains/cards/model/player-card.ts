import { z } from 'zod'

export const cardRatingMinimum = 3

const attributeSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable().optional(),
  position: z.number().int().optional(),
  voters: z.number().int().nonnegative().optional(),
  average: z.number().nullable().optional(),
  state: z.enum(['published', 'pending']).optional(),
})

const templateSchema = z.object({
  id: z.uuid(),
  version: z.number().int(),
  status: z.string(),
  attributes: z.array(attributeSchema),
})

const templateResponseSchema = z.object({
  active: templateSchema.nullable(),
  draft: templateSchema.nullable().optional(),
})

const cardSchema = z.object({
  username: z.string(),
  display_name: z.string(),
  community_name: z.string().optional(),
  template_version: z.number().int(),
  overall: z.number().int().nullable(),
  state: z.enum(['published', 'pending']),
  attributes: z.array(attributeSchema),
})

const listSchema = z.object({
  community_name: z.string(),
  cards: z.array(cardSchema),
})

export type CardAttribute = z.infer<typeof attributeSchema>
export type PlayerCard = z.infer<typeof cardSchema>
export type CardTemplateResponse = z.infer<typeof templateResponseSchema>

export function parseCardTemplate(value: unknown) {
  return templateResponseSchema.parse(value)
}

export function parsePlayerCard(value: unknown) {
  return cardSchema.parse(value)
}

export function parsePlayerCardList(value: unknown) {
  return listSchema.parse(value)
}

export function formatAverage(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: 1,
  }).format(value)
}
