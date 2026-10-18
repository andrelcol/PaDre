import { describe, expect, it } from 'vitest'
import { initialSports } from './initial-sports.ts'

describe('initialSports', () => {
  it('lists the five opening sports once each', () => {
    expect(initialSports.map((sport) => sport.slug)).toEqual([
      'volleyball',
      'beach-volleyball',
      'futsal',
      'beach-tennis',
      'footvolley',
    ])

    expect(new Set(initialSports.map((sport) => sport.slug)).size).toBe(
      initialSports.length,
    )
  })
})
