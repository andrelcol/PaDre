import {
  friendshipRequestSchema,
  parseFriendshipCommand,
  parseFriendships,
  type FriendshipAction,
} from '@/domains/friendships/model/friendship.ts'
import { requireSupabase } from '@/shared/lib/supabase.ts'

export async function listFriendships() {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('list_my_friendships')
  if (error) throw error
  return parseFriendships(data)
}

export async function requestFriendship(username: string) {
  const parsed = friendshipRequestSchema.parse({ username })
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('request_friendship', {
    username: parsed.username,
  })
  if (error) throw error
  const row = firstRow(data)
  return parseFriendshipCommand(row)
}

export async function respondToFriendship(
  friendshipId: string,
  action: FriendshipAction,
) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('respond_to_friendship', {
    friendship_id: friendshipId,
    action,
  })
  if (error) throw error
  return parseFriendshipCommand(firstRow(data))
}

function firstRow(data: unknown) {
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error('Não foi possível concluir. Tente de novo.')
  }
  return data[0]
}
