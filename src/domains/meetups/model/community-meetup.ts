import { z } from 'zod'

const communityMeetupSchema = z.object({
  total: z.int().nonnegative(),
  meetups: z.array(
    z.object({
      id: z.uuid(),
      title: z.string(),
      status: z.enum(['scheduled', 'cancelled']),
      phase: z.enum(['upcoming', 'past', 'cancelled']),
      starts_at: z.string(),
      ends_at: z.string(),
      time_zone: z.string(),
      location_name: z.string(),
      sport_name: z.string(),
      format_name: z.string(),
      organizer_username: z.string(),
      confirmed_count: z.int().nonnegative(),
      max_participants: z.int(),
      open_spots: z.int(),
    }),
  ),
})

export type CommunityMeetup = {
  id: string
  title: string
  status: 'scheduled' | 'cancelled'
  phase: 'upcoming' | 'past' | 'cancelled'
  startsAt: string
  endsAt: string
  timeZone: string
  locationName: string
  sportName: string
  formatName: string
  organizerUsername: string
  confirmedCount: number
  maxParticipants: number
  openSpots: number
}

export type CommunityMeetupPage = {
  total: number
  meetups: CommunityMeetup[]
}

export function parseCommunityMeetups(value: unknown): CommunityMeetupPage {
  const row = communityMeetupSchema.parse(value)
  return {
    total: row.total,
    meetups: row.meetups.map((meetup) => ({
      id: meetup.id,
      title: meetup.title,
      status: meetup.status,
      phase: meetup.phase,
      startsAt: meetup.starts_at,
      endsAt: meetup.ends_at,
      timeZone: meetup.time_zone,
      locationName: meetup.location_name,
      sportName: meetup.sport_name,
      formatName: meetup.format_name,
      organizerUsername: meetup.organizer_username,
      confirmedCount: meetup.confirmed_count,
      maxParticipants: meetup.max_participants,
      openSpots: meetup.open_spots,
    })),
  }
}

export function groupCommunityMeetups(meetups: CommunityMeetup[]) {
  return {
    upcoming: meetups.filter((meetup) => meetup.phase === 'upcoming'),
    past: meetups.filter((meetup) => meetup.phase === 'past'),
    cancelled: meetups.filter((meetup) => meetup.phase === 'cancelled'),
  }
}
