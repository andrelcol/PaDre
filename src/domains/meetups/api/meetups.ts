import {
  parseIssuedInviteLink,
  parseInviteLinkStatus,
  parseInvitePreview,
} from '@/domains/meetups/model/invite-link.ts'
import {
  parseMeetupDetail,
  parseMeetupSummaries,
  type MeetupDraft,
} from '@/domains/meetups/model/meetup.ts'
import { meetupInstants } from '@/domains/meetups/model/meetup.ts'
import { requireSupabase } from '@/shared/lib/supabase.ts'

export type MeetupWrite = MeetupDraft & {
  startsAt?: string
  endsAt?: string
}

export async function listMeetups() {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('list_my_meetups')
  if (error) throw error
  return parseMeetupSummaries(data)
}

export async function getMeetup(meetupId: string) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('get_meetup', {
    meetup_id: meetupId,
  })
  if (error) throw error
  return parseMeetupDetail(data)
}

export async function createMeetup(draft: MeetupDraft) {
  const supabase = requireSupabase()
  const instants = meetupInstants(draft)
  const { data, error } = await supabase.rpc(
    'create_meetup',
    writeArgs(draft, instants),
  )
  if (error) throw error
  if (typeof data !== 'string') {
    throw new Error('Não foi possível concluir. Tente de novo.')
  }
  return data
}

export async function updateMeetup(meetupId: string, draft: MeetupWrite) {
  const supabase = requireSupabase()
  const instants = {
    startsAt: draft.startsAt ?? meetupInstants(draft).startsAt,
    endsAt: draft.endsAt ?? meetupInstants(draft).endsAt,
  }
  const { data, error } = await supabase.rpc('update_meetup', {
    meetup_id: meetupId,
    ...writeArgs(draft, instants),
  })
  if (error) throw error
  if (typeof data !== 'string') {
    throw new Error('Não foi possível concluir. Tente de novo.')
  }
  return data
}

export async function cancelMeetup(meetupId: string) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('cancel_meetup', {
    meetup_id: meetupId,
  })
  if (error) throw error
  return data
}

export async function inviteToMeetup(meetupId: string, username: string) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('invite_to_meetup', {
    meetup_id: meetupId,
    username,
  })
  if (error) throw error
  return data
}

export async function respondToMeetupInvitation(
  invitationId: string,
  action: 'accept' | 'decline',
) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('respond_to_meetup_invitation', {
    invitation_id: invitationId,
    action,
  })
  if (error) throw error
  return data
}

export async function cancelMeetupInvitation(invitationId: string) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('cancel_meetup_invitation', {
    invitation_id: invitationId,
  })
  if (error) throw error
  return data
}

export async function getMeetupInviteLink(meetupId: string) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('meetup_invite_link', {
    meetup_id: meetupId,
  })
  if (error) throw error
  return parseInviteLinkStatus(data)
}

export async function createMeetupInviteLink(meetupId: string) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('create_meetup_invite_link', {
    meetup_id: meetupId,
  })
  if (error) throw error
  return parseIssuedInviteLink(data)
}

export async function revokeMeetupInviteLink(meetupId: string) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('revoke_meetup_invite_link', {
    meetup_id: meetupId,
  })
  if (error) throw error
  return data
}

export async function previewMeetupInvite(token: string) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('preview_meetup_invite', {
    token,
  })
  if (error) throw error
  return parseInvitePreview(data)
}

export async function joinMeetupByInvite(token: string) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('join_meetup_by_invite', {
    token,
  })
  if (error) throw error
  if (typeof data !== 'string') {
    throw new Error('Não foi possível concluir. Tente de novo.')
  }
  return data
}

export async function leaveMeetup(meetupId: string) {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('leave_meetup', {
    meetup_id: meetupId,
  })
  if (error) throw error
  return data
}

function writeArgs(
  draft: MeetupDraft,
  instants: { startsAt: string; endsAt: string },
) {
  return {
    sport_format_id: draft.sportFormatId,
    scoring_rule_version_id: draft.scoringRuleVersionId,
    title: draft.title,
    description: draft.description,
    starts_at: instants.startsAt,
    ends_at: instants.endsAt,
    time_zone: draft.timeZone,
    location_name: draft.locationName,
    location_address: draft.locationAddress,
    max_participants: draft.maxParticipants,
  }
}
