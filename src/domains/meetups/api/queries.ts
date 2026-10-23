import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  cancelMeetup,
  setMeetupPlace,
  cancelMeetupInvitation,
  createCommunityMeetup,
  createMeetup,
  joinCommunityMeetup,
  listCommunityMeetups,
  createMeetupInviteLink,
  getMeetup,
  getMeetupInviteLink,
  inviteToMeetup,
  joinMeetupByInvite,
  leaveMeetup,
  listMeetups,
  previewMeetupInvite,
  respondToMeetupInvitation,
  revokeMeetupInviteLink,
  updateMeetup,
  type MeetupWrite,
} from '@/domains/meetups/api/meetups.ts'
import type { MeetupDraft } from '@/domains/meetups/model/meetup.ts'

export function useMeetups(enabled: boolean) {
  return useQuery({
    queryKey: ['meetups'],
    queryFn: listMeetups,
    enabled,
  })
}

export function useMeetup(meetupId: string | undefined) {
  return useQuery({
    queryKey: ['meetups', meetupId],
    queryFn: () => getMeetup(meetupId ?? ''),
    enabled: Boolean(meetupId),
  })
}

export function useCommunityMeetups(
  slug: string,
  enabled: boolean,
  limit = 20,
) {
  return useQuery({
    queryKey: ['communities', 'meetups', slug, limit],
    queryFn: () => listCommunityMeetups(slug, limit, 0),
    enabled: enabled && slug.length > 0,
  })
}

export function useCreateMeetup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (draft: MeetupDraft) => createMeetup(draft),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['meetups'] })
    },
  })
}

export function useCreateCommunityMeetup(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (draft: MeetupDraft) => createCommunityMeetup(slug, draft),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['meetups'] })
      await queryClient.invalidateQueries({
        queryKey: ['communities', 'meetups', slug],
      })
    },
  })
}

export function useUpdateMeetup(meetupId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (draft: MeetupWrite) => updateMeetup(meetupId, draft),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['meetups'] })
    },
  })
}

export function useSetMeetupPlace(meetupId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (draft: MeetupDraft) => setMeetupPlace(meetupId, draft),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['meetups'] })
      await queryClient.invalidateQueries({ queryKey: ['venues', 'meetups'] })
    },
  })
}

export function useMeetupCommand(meetupId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (
      command:
        | { type: 'cancel' }
        | { type: 'leave' }
        | { type: 'join' }
        | { type: 'invite'; username: string }
        | { type: 'cancel-invitation'; invitationId: string }
        | {
            type: 'respond'
            invitationId: string
            action: 'accept' | 'decline'
          },
    ) => {
      if (!meetupId) throw new Error('Encontro ausente.')
      if (command.type === 'cancel') return cancelMeetup(meetupId)
      if (command.type === 'leave') return leaveMeetup(meetupId)
      if (command.type === 'join') return joinCommunityMeetup(meetupId)
      if (command.type === 'invite')
        return inviteToMeetup(meetupId, command.username)
      if (command.type === 'cancel-invitation') {
        return cancelMeetupInvitation(command.invitationId)
      }
      return respondToMeetupInvitation(command.invitationId, command.action)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['meetups'] })
      await queryClient.invalidateQueries({
        queryKey: ['communities', 'meetups'],
      })
    },
  })
}

export function useMeetupInviteLink(
  meetupId: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['meetups', meetupId, 'invite-link'],
    queryFn: () => getMeetupInviteLink(meetupId ?? ''),
    enabled: Boolean(meetupId) && enabled,
  })
}

export function useCreateMeetupInviteLink(meetupId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => createMeetupInviteLink(meetupId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['meetups', meetupId, 'invite-link'],
      })
    },
  })
}

export function useRevokeMeetupInviteLink(meetupId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => revokeMeetupInviteLink(meetupId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['meetups', meetupId, 'invite-link'],
      })
    },
  })
}

export function useInvitePreview(token: string | undefined) {
  return useQuery({
    queryKey: ['invite-preview', token],
    queryFn: () => previewMeetupInvite(token ?? ''),
    enabled: Boolean(token),
    retry: false,
  })
}

export function useJoinMeetupByInvite(token: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => joinMeetupByInvite(token),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['invite-preview', token],
      })
      await queryClient.invalidateQueries({ queryKey: ['meetups'] })
    },
  })
}
