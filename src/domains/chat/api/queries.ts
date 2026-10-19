import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  deleteCommunityMessage,
  listCommunityMessages,
  sendCommunityMessage,
} from '@/domains/chat/api/messages.ts'

export const communityMessageRefreshMs = 15_000

export function communityMessageKey(slug: string) {
  return ['communities', 'messages', slug] as const
}

export function useCommunityMessages(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: communityMessageKey(slug),
    queryFn: () => listCommunityMessages(slug, null, null, 50),
    enabled,
    refetchInterval: () =>
      document.visibilityState === 'visible'
        ? communityMessageRefreshMs
        : false,
    refetchIntervalInBackground: false,
  })
}

export function useSendCommunityMessage(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: sendCommunityMessage,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: communityMessageKey(slug),
      })
    },
  })
}

export function useDeleteCommunityMessage(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteCommunityMessage,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: communityMessageKey(slug),
      })
    },
  })
}
