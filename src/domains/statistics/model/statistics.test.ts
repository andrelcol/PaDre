import { describe, expect, it } from 'vitest'

import {
  formatWinRate,
  showsDecidingPoints,
  signedDifference,
} from './statistics.ts'

describe('statistics presentation', () => {
  it('formats the win rate with one decimal and keeps the balance exact', () => {
    expect(formatWinRate(66.7)).toBe('66,7%')
    expect(formatWinRate(0)).toBe('0,0%')
    expect(signedDifference(75, 60)).toBe('+15')
    expect(signedDifference(2, 2)).toBe('0')
    expect(signedDifference(4, 6)).toBe('-2')
  })

  it('shows deciding points only when a super tiebreak was played', () => {
    expect(
      showsDecidingPoints({
        matches_played: 1,
        wins: 1,
        losses: 0,
        draws: 0,
        win_rate: 100,
        deciding_points_for: 0,
        deciding_points_against: 0,
      }),
    ).toBe(false)
    expect(
      showsDecidingPoints({
        matches_played: 1,
        wins: 1,
        losses: 0,
        draws: 0,
        win_rate: 100,
        deciding_points_for: 10,
        deciding_points_against: 6,
      }),
    ).toBe(true)
  })
})
