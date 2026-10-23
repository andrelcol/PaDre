import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  getCardTemplate,
  listPlayerCards,
  publishCardTemplate,
  ratePlayer,
  saveCardDraft,
  setCardParticipation,
} from '@/domains/cards/api/cards.ts'

export function useCardTemplate(slug: string) {
  return useQuery({
    queryKey: ['cards', 'template', slug],
    queryFn: () => getCardTemplate(slug),
    enabled: Boolean(slug),
  })
}

export function usePlayerCards(slug: string) {
  return useQuery({
    queryKey: ['cards', 'list', slug],
    queryFn: () => listPlayerCards(slug),
    enabled: Boolean(slug),
  })
}

export function useSaveCardDraft(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (attributes: { name: string; description: string }[]) =>
      saveCardDraft(slug, attributes),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['cards', slug] })
      await queryClient.invalidateQueries({
        queryKey: ['cards', 'template', slug],
      })
    },
  })
}

export function usePublishCardTemplate(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => publishCardTemplate(slug),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['cards', 'template', slug],
      })
      await queryClient.invalidateQueries({ queryKey: ['cards', 'list', slug] })
    },
  })
}

export function useCardParticipation(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (active: boolean) => setCardParticipation(slug, active),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['cards', 'list', slug] })
    },
  })
}

export function useRatePlayer(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      username: string
      attributeId: string
      score: number
    }) => ratePlayer(slug, input.username, input.attributeId, input.score),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['cards', 'list', slug] })
    },
  })
}
