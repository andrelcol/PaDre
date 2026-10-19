import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  cancelCommunityInvitation,
  createCommunity,
  getCommunity,
  inviteToCommunity,
  joinPublicCommunity,
  leaveCommunity,
  listMyCommunities,
  listMyCommunityInvitations,
  listPublicCommunities,
  removeCommunityMember,
  respondToCommunityInvitation,
  setCommunityMemberRole,
  setCommunitySports,
  updateCommunity,
} from '@/domains/communities/api/communities.ts'
import type { CommunityDraft } from '@/domains/communities/model/community.ts'

const communityKey = ['communities'] as const

export function usePublicCommunities() {
  return useQuery({
    queryKey: [...communityKey, 'public'],
    queryFn: listPublicCommunities,
  })
}

export function useMyCommunities(enabled: boolean) {
  return useQuery({
    queryKey: [...communityKey, 'mine'],
    queryFn: listMyCommunities,
    enabled,
  })
}

export function useMyCommunityInvitations(enabled: boolean) {
  return useQuery({
    queryKey: [...communityKey, 'invitations'],
    queryFn: listMyCommunityInvitations,
    enabled,
  })
}

export function useCommunity(slug: string) {
  return useQuery({
    queryKey: [...communityKey, 'detail', slug],
    queryFn: () => getCommunity(slug),
    enabled: slug.length > 0,
  })
}

function useCommunityMutation<T>(mutationFn: (input: T) => Promise<unknown>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: communityKey })
    },
  })
}

export function useCreateCommunity() {
  return useCommunityMutation(createCommunity)
}

export function useUpdateCommunity(slug: string) {
  return useCommunityMutation((draft: CommunityDraft) =>
    updateCommunity(slug, draft),
  )
}

export function useSetCommunitySports(slug: string) {
  return useCommunityMutation((sportIds: string[]) =>
    setCommunitySports(slug, sportIds),
  )
}

export function useJoinPublicCommunity() {
  return useCommunityMutation(joinPublicCommunity)
}

export function useLeaveCommunity() {
  return useCommunityMutation(leaveCommunity)
}

export function useInviteToCommunity(slug: string) {
  return useCommunityMutation((username: string) =>
    inviteToCommunity(slug, username),
  )
}

export function useRespondToCommunityInvitation() {
  return useCommunityMutation(
    (input: { invitationId: string; action: 'accept' | 'decline' }) =>
      respondToCommunityInvitation(input.invitationId, input.action),
  )
}

export function useCancelCommunityInvitation() {
  return useCommunityMutation(cancelCommunityInvitation)
}

export function useSetCommunityMemberRole(slug: string) {
  return useCommunityMutation(
    (input: { username: string; role: 'admin' | 'member' }) =>
      setCommunityMemberRole(slug, input.username, input.role),
  )
}

export function useRemoveCommunityMember(slug: string) {
  return useCommunityMutation((username: string) =>
    removeCommunityMember(slug, username),
  )
}
