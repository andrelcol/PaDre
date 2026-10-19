import { describe, expect, it } from 'vitest'

import {
  groupCommunityMeetups,
  parseCommunityMeetups,
} from './community-meetup.ts'

const meetup = {
  id: 'a1000000-0000-4000-8000-000000000041',
  title: 'Areia',
  status: 'scheduled',
  phase: 'upcoming',
  starts_at: '2026-11-01T22:00:00.000Z',
  ends_at: '2026-11-02T00:00:00.000Z',
  time_zone: 'America/Sao_Paulo',
  location_name: 'Quadra',
  sport_name: 'Vôlei de areia',
  format_name: 'Vôlei de areia 2x2',
  organizer_username: 'caio',
  confirmed_count: 1,
  max_participants: 6,
  open_spots: 5,
}

describe('community meetups', () => {
  it('parses a page and groups each phase', () => {
    const page = parseCommunityMeetups({
      total: 3,
      meetups: [
        meetup,
        {
          ...meetup,
          id: 'a1000000-0000-4000-8000-000000000042',
          phase: 'past',
        },
        {
          ...meetup,
          id: 'a1000000-0000-4000-8000-000000000043',
          status: 'cancelled',
          phase: 'cancelled',
        },
      ],
    })
    expect(page.total).toBe(3)
    expect(groupCommunityMeetups(page.meetups)).toMatchObject({
      upcoming: [{ title: 'Areia' }],
      past: [{ id: 'a1000000-0000-4000-8000-000000000042' }],
      cancelled: [{ status: 'cancelled' }],
    })
  })
})
