import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  cancelCommunityPoll,
  closeCommunityPoll,
  createCommunityPoll,
  listCommunityPolls,
  voteCommunityPoll,
} from '@/domains/polls/api/polls.ts'
import type { PollStatus } from '@/domains/polls/model/poll.ts'

export const communityPollRefreshMs = 15_000

export function communityPollKey(slug: string, status?: PollStatus) {
  return status
    ? (['communities', 'polls', slug, status] as const)
    : (['communities', 'polls', slug] as const)
}

export function useCommunityPolls(
  slug: string,
  status: PollStatus,
  enabled: boolean,
) {
  return useQuery({
    queryKey: communityPollKey(slug, status),
    queryFn: () => listCommunityPolls(slug, status, 20, null, null),
    enabled,
    refetchInterval: () =>
      document.visibilityState === 'visible' ? communityPollRefreshMs : false,
    refetchIntervalInBackground: false,
  })
}

export function useCreateCommunityPoll(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createCommunityPoll,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: communityPollKey(slug) })
    },
  })
}

export function useVoteCommunityPoll(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      pollId,
      optionIds,
    }: {
      pollId: string
      optionIds: string[]
    }) => voteCommunityPoll(pollId, optionIds),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: communityPollKey(slug) })
    },
  })
}

export function useCloseCommunityPoll(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: closeCommunityPoll,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: communityPollKey(slug) })
    },
  })
}

export function useCancelCommunityPoll(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: cancelCommunityPoll,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: communityPollKey(slug) })
    },
  })
}
