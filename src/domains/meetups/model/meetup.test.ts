import { describe, expect, it } from 'vitest'

import {
  canChangeStructure,
  defaultMeetupFormValues,
  meetupDraftSchema,
  meetupErrorMessage,
  openSpots,
  splitMeetups,
  type MeetupSummary,
} from './meetup.ts'
import { wallClockInZone, zonedWallClockToUtc } from './schedule.ts'

const summary = (overrides: Partial<MeetupSummary>): MeetupSummary => ({
  id: 'a1000000-0000-4000-8000-000000000010',
  title: 'Quadra',
  status: 'scheduled',
  startsAt: '2099-01-01T22:00:00.000Z',
  endsAt: '2099-01-02T00:00:00.000Z',
  timeZone: 'America/Sao_Paulo',
  locationName: 'Clube',
  sportName: 'Vôlei',
  formatName: 'Vôlei 6x6',
  relation: 'organizing',
  confirmedCount: 1,
  maxParticipants: 10,
  invitationId: null,
  ...overrides,
})

describe('meetup schedule', () => {
  it('stores a wall clock in the meetup time zone as an absolute instant', () => {
    const instant = zonedWallClockToUtc(
      '2026-10-20',
      '19:00',
      'America/Sao_Paulo',
    )
    expect(instant.toISOString()).toBe('2026-10-20T22:00:00.000Z')
    expect(wallClockInZone(instant, 'America/Sao_Paulo')).toEqual({
      date: '2026-10-20',
      time: '19:00',
    })
  })

  it('rejects a past start, an end before the start and a capacity of one', () => {
    const base = {
      ...defaultMeetupFormValues('America/Sao_Paulo'),
      sportFormatId: 'a2000000-0000-4000-8000-000000000001',
      scoringRuleVersionId: 'a3000000-0000-4000-8000-000000000001',
      title: 'Quadra',
      locationName: 'Clube',
      startDate: '2020-01-01',
      endDate: '2020-01-01',
    }
    expect(meetupDraftSchema.safeParse(base).success).toBe(false)
    expect(
      meetupDraftSchema.safeParse({
        ...base,
        startDate: '2099-01-01',
        endDate: '2099-01-01',
        startTime: '21:00',
        endTime: '19:00',
      }).success,
    ).toBe(false)
    expect(
      meetupDraftSchema.safeParse({
        ...base,
        startDate: '2099-01-01',
        endDate: '2099-01-01',
        maxParticipants: 1,
      }).success,
    ).toBe(false)
  })
})

describe('meetup rules', () => {
  it('counts open spots without the people who left', () => {
    expect(openSpots(10, 1)).toBe(9)
    expect(openSpots(2, 2)).toBe(0)
    expect(canChangeStructure(1)).toBe(true)
    expect(canChangeStructure(2)).toBe(false)
  })

  it('splits upcoming, organized, invited and earlier meetups', () => {
    const groups = splitMeetups(
      [
        summary({ id: 'a1000000-0000-4000-8000-000000000011' }),
        summary({
          id: 'a1000000-0000-4000-8000-000000000012',
          relation: 'invited',
          invitationId: 'a1000000-0000-4000-8000-000000000013',
        }),
        summary({
          id: 'a1000000-0000-4000-8000-000000000014',
          status: 'cancelled',
          startsAt: '2000-01-01T00:00:00.000Z',
        }),
      ],
      new Date('2026-10-18T12:00:00.000Z'),
    )
    expect(groups.upcoming).toHaveLength(1)
    expect(groups.organizing).toHaveLength(1)
    expect(groups.invited).toHaveLength(1)
    expect(groups.earlier).toHaveLength(1)
  })

  it('explains capacity, friendship and structural locks', () => {
    expect(meetupErrorMessage({ message: 'not friends' })).toMatch(/amizade/)
    expect(meetupErrorMessage({ message: 'meetup is full' })).toMatch(/vagas/)
    expect(meetupErrorMessage({ message: 'structural change locked' })).toMatch(
      /travados/,
    )
    expect(meetupErrorMessage({ message: 'organizer cannot leave' })).toMatch(
      /cancela/,
    )
  })
})
