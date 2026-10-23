import {
  parseCardTemplate,
  parsePlayerCard,
  parsePlayerCardList,
} from '@/domains/cards/model/player-card.ts'
import { requireSupabase } from '@/shared/lib/supabase.ts'

export async function getCardTemplate(slug: string) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('get_community_card_template', {
    slug,
  })
  if (error) throw error
  return parseCardTemplate(data)
}

export async function saveCardDraft(
  slug: string,
  attributes: { name: string; description: string }[],
) {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('save_community_card_draft', {
    slug,
    attributes,
  })
  if (error) throw error
}

export async function publishCardTemplate(slug: string) {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('publish_community_card_template', {
    slug,
  })
  if (error) throw error
}

export async function setCardParticipation(slug: string, active: boolean) {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('set_my_community_card_participation', {
    slug,
    active,
  })
  if (error) throw error
}

export async function ratePlayer(
  slug: string,
  username: string,
  attributeId: string,
  score: number,
) {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('rate_community_player', {
    slug,
    username,
    attribute_id: attributeId,
    score,
  })
  if (error) throw error
}

export async function listPlayerCards(slug: string) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('list_community_player_cards', {
    slug,
  })
  if (error) throw error
  return parsePlayerCardList(data)
}

export async function getPlayerCard(slug: string, username: string) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('get_community_player_card', {
    slug,
    username,
  })
  if (error) throw error
  return parsePlayerCard(data)
}
