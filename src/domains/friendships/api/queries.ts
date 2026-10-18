import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  listFriendships,
  requestFriendship,
  respondToFriendship,
} from '@/domains/friendships/api/friendships.ts'
import type { FriendshipAction } from '@/domains/friendships/model/friendship.ts'

export function useFriendships(enabled: boolean) {
  return useQuery({
    queryKey: ['friendships'],
    queryFn: listFriendships,
    enabled,
  })
}

export function useRequestFriendship() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: requestFriendship,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['friendships'] })
    },
  })
}

export function useRespondToFriendship() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { friendshipId: string; action: FriendshipAction }) =>
      respondToFriendship(input.friendshipId, input.action),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['friendships'] })
    },
  })
}
