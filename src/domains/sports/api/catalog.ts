import {
  parseCatalog,
  type CatalogSport,
} from '@/domains/sports/model/catalog.ts'
import { requireSupabase } from '@/shared/lib/supabase.ts'

export async function getCatalog(): Promise<CatalogSport[]> {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('sports')
    .select(
      `
        id,
        slug,
        name,
        description,
        display_order,
        sport_formats (
          id,
          slug,
          name,
          side_count,
          players_per_side_min,
          players_per_side_max,
          display_order,
          scoring_rule_versions (
            id,
            version,
            rule_type,
            config,
            origin
          )
        )
      `,
    )
    .eq('active', true)
    .order('display_order')

  if (error) {
    throw new Error('Não foi possível carregar o catálogo.')
  }

  return parseCatalog(data)
}
