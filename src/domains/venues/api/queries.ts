import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  archiveVenue,
  createVenue,
  listCommunityVenues,
  listMyVenues,
  listVenueMeetups,
  setVenueLocation,
  updateVenue,
} from '@/domains/venues/api/venues.ts'
import type { VenueDraft, VenueEdit } from '@/domains/venues/model/venue.ts'

export function myVenuesKey() {
  return ['venues', 'mine'] as const
}

export function communityVenuesKey(slug: string) {
  return ['venues', 'community', slug] as const
}

export function useMyVenues(enabled = true) {
  return useQuery({
    queryKey: myVenuesKey(),
    queryFn: listMyVenues,
    enabled,
  })
}

export function useCommunityVenues(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: communityVenuesKey(slug),
    queryFn: () => listCommunityVenues(slug),
    enabled: enabled && slug.length > 0,
  })
}

export function useVenueMeetups(
  venueId: string,
  enabled: boolean,
  limit = 20,
  offset = 0,
) {
  return useQuery({
    queryKey: ['venues', 'meetups', venueId, limit, offset],
    queryFn: () => listVenueMeetups(venueId, limit, offset),
    enabled,
  })
}

export function useCreateVenue(communitySlug?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (draft: VenueDraft) => createVenue(draft, communitySlug),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['venues'] })
    },
  })
}

export function useUpdateVenue() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ venueId, draft }: { venueId: string; draft: VenueEdit }) =>
      updateVenue(venueId, draft),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['venues'] })
    },
  })
}

export function useSetVenueLocation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      venueId,
      latitude,
      longitude,
    }: {
      venueId: string
      latitude: number
      longitude: number
    }) => setVenueLocation(venueId, latitude, longitude),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['venues'] })
    },
  })
}

export function useArchiveVenue() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (venueId: string) => archiveVenue(venueId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['venues'] })
    },
  })
}
