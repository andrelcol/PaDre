import { z } from 'zod'

import { scoringRuleSchema, type ScoringRule } from './scoring.ts'

export const catalogSportSchema = z.object({
  id: z.uuid(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(400).nullable(),
  displayOrder: z.int().min(1),
  formats: z.array(
    z.object({
      id: z.uuid(),
      slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      name: z.string().trim().min(1).max(80),
      sideCount: z.int().min(2).max(4),
      playersPerSideMin: z.int().min(1).max(30),
      playersPerSideMax: z.int().min(1).max(30),
      displayOrder: z.int().min(1),
      rule: scoringRuleSchema,
    }),
  ),
})

export type CatalogSport = z.infer<typeof catalogSportSchema>

export type CatalogFormat = CatalogSport['formats'][number]

const sportRowSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  display_order: z.number(),
  sport_formats: z.array(
    z.object({
      id: z.uuid(),
      slug: z.string(),
      name: z.string(),
      side_count: z.number(),
      players_per_side_min: z.number(),
      players_per_side_max: z.number(),
      display_order: z.number(),
      scoring_rule_versions: z.array(
        z.object({
          id: z.uuid(),
          version: z.number(),
          rule_type: z.string(),
          config: z.unknown(),
          origin: z.string(),
        }),
      ),
    }),
  ),
})

export function parseCatalog(rows: unknown): CatalogSport[] {
  const parsed = z.array(sportRowSchema).parse(rows)

  return parsed
    .map((sport) =>
      catalogSportSchema.parse({
        id: sport.id,
        slug: sport.slug,
        name: sport.name,
        description: sport.description,
        displayOrder: sport.display_order,
        formats: sport.sport_formats
          .map((format) => {
            const rule = activeRule(format.scoring_rule_versions)
            return {
              id: format.id,
              slug: format.slug,
              name: format.name,
              sideCount: format.side_count,
              playersPerSideMin: format.players_per_side_min,
              playersPerSideMax: format.players_per_side_max,
              displayOrder: format.display_order,
              rule,
            }
          })
          .sort((left, right) => left.displayOrder - right.displayOrder),
      }),
    )
    .sort((left, right) => left.displayOrder - right.displayOrder)
}

function activeRule(
  versions: z.infer<
    typeof sportRowSchema
  >['sport_formats'][number]['scoring_rule_versions'],
): ScoringRule {
  const current = [...versions].sort(
    (left, right) => right.version - left.version,
  )[0]
  if (!current) {
    throw new Error('Formato sem regra de pontuação ativa.')
  }

  return scoringRuleSchema.parse({
    id: current.id,
    version: current.version,
    rule_type: current.rule_type,
    origin: current.origin,
    config: current.config,
  })
}
