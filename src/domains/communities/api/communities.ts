import {
  communityDraftSchema,
  communityInviteSchema,
  parseCommunityDetail,
  parseCommunityInvites,
  parseCommunitySlug,
  parseMyCommunities,
  parsePublicCommunities,
  type CommunityDraft,
  type CommunityRole,
} from '@/domains/communities/model/community.ts'
import { requireSupabase } from '@/shared/lib/supabase.ts'

export async function listPublicCommunities() {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('list_public_communities')
  if (error) throw error
  return parsePublicCommunities(data)
}

export async function listMyCommunities() {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('list_my_communities')
  if (error) throw error
  return parseMyCommunities(data)
}

export async function listMyCommunityInvitations() {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('list_my_community_invitations')
  if (error) throw error
  return parseCommunityInvites(data)
}

export async function getCommunity(slug: string) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('get_community', { slug })
  if (error) throw error
  return parseCommunityDetail(data)
}

export async function createCommunity(draft: CommunityDraft) {
  const parsed = communityDraftSchema.parse(draft)
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('create_community', {
    name: parsed.name,
    description: parsed.description,
    visibility: parsed.visibility,
    sport_ids: parsed.sportIds,
  })
  if (error) throw error
  return parseCommunitySlug(data)
}

export async function updateCommunity(slug: string, draft: CommunityDraft) {
  const parsed = communityDraftSchema.parse(draft)
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('update_community', {
    slug,
    name: parsed.name,
    description: parsed.description,
    visibility: parsed.visibility,
  })
  if (error) throw error
}

export async function setCommunitySports(slug: string, sportIds: string[]) {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('set_community_sports', {
    slug,
    sport_ids: sportIds,
  })
  if (error) throw error
}

export async function joinPublicCommunity(slug: string) {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('join_public_community', { slug })
  if (error) throw error
}

export async function leaveCommunity(slug: string) {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('leave_community', { slug })
  if (error) throw error
}

export async function inviteToCommunity(slug: string, username: string) {
  const parsed = communityInviteSchema.parse({ username })
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('invite_to_community', {
    slug,
    username: parsed.username,
  })
  if (error) throw error
}

export async function respondToCommunityInvitation(
  invitationId: string,
  action: 'accept' | 'decline',
) {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('respond_to_community_invitation', {
    invitation_id: invitationId,
    action,
  })
  if (error) throw error
}

export async function cancelCommunityInvitation(invitationId: string) {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('cancel_community_invitation', {
    invitation_id: invitationId,
  })
  if (error) throw error
}

export async function setCommunityMemberRole(
  slug: string,
  username: string,
  role: Extract<CommunityRole, 'admin' | 'member'>,
) {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('set_community_member_role', {
    slug,
    username,
    role,
  })
  if (error) throw error
}

export async function removeCommunityMember(slug: string, username: string) {
  const supabase = requireSupabase()
  const { error } = await supabase.rpc('remove_community_member', {
    slug,
    username,
  })
  if (error) throw error
}
