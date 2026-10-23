import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  getOwnPersonalDetails,
  getOwnProfile,
  updateOwnPersonalDetails,
  updateOwnProfile,
} from '@/domains/identity/api/profile.ts'
import type { PersonalDetails } from '@/domains/identity/model/personal-details.ts'
import type { ProfileEdit } from '@/domains/identity/model/profile.ts'

export function useOwnProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ['profile', userId],
    enabled: Boolean(userId),
    queryFn: () => getOwnProfile(userId ?? ''),
  })
}

export function useUpdateOwnProfile(userId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: ProfileEdit) => {
      if (!userId) throw new Error('Sessão expirada.')
      return updateOwnProfile(userId, input)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['profile', userId] })
    },
  })
}

export function useOwnPersonalDetails(enabled: boolean) {
  return useQuery({
    queryKey: ['profile', 'details'],
    queryFn: getOwnPersonalDetails,
    enabled,
  })
}

export function useUpdatePersonalDetails() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      heightCm: number | null
      sex: PersonalDetails['sex']
      showHeight: boolean
      showSex: boolean
      showAvatar: boolean
    }) => updateOwnPersonalDetails(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['profile', 'details'] })
    },
  })
}
