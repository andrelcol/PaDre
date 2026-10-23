import { describe, expect, it } from 'vitest'

import { comparisonHighlight } from '@/domains/statistics/model/venue-statistics.ts'
import type { VenuePerformance } from '@/domains/statistics/model/venue-statistics.ts'

function venue(id: string, matches: number, rate: number): VenuePerformance {
  return {
    venue_id: id,
    visible: true,
    name: id,
    sports: [
      {
        sport_id: '11111111-1111-4111-8111-111111111111',
        sport_name: 'Vôlei de areia',
        rule_type: 'set_based',
        matches_played: matches,
        wins: 1,
        losses: 0,
        draws: 0,
        win_rate: rate,
        formats: [],
      },
    ],
  }
}

describe('comparisonHighlight', () => {
  it('ignores a sample below five matches', () => {
    expect(
      comparisonHighlight([
        venue('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 4, 100),
        venue('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 2, 0),
      ]),
    ).toBeNull()
  })

  it('marks the higher rate only when two venues reach five matches', () => {
    expect(
      comparisonHighlight([
        venue('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 5, 80),
        venue('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 6, 50),
      ]),
    ).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  })

  it('does not break a tie', () => {
    expect(
      comparisonHighlight([
        venue('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 5, 50),
        venue('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 5, 50),
      ]),
    ).toBeNull()
  })
})
