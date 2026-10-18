import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  cancelMeetup,
  cancelMeetupInvitation,
  createMeetup,
  getMeetup,
  inviteToMeetup,
  leaveMeetup,
  listMeetups,
  respondToMeetupInvitation,
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

export function useCreateMeetup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (draft: MeetupDraft) => createMeetup(draft),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['meetups'] })
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

export function useMeetupCommand(meetupId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (
      command:
        | { type: 'cancel' }
        | { type: 'leave' }
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
      if (command.type === 'invite')
        return inviteToMeetup(meetupId, command.username)
      if (command.type === 'cancel-invitation') {
        return cancelMeetupInvitation(command.invitationId)
      }
      return respondToMeetupInvitation(command.invitationId, command.action)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['meetups'] })
    },
  })
}
