import { describe, expect, it } from 'vitest'

import { parseCoordinatePair, roundCoordinate } from './coordinates.ts'

describe('coordinates', () => {
  it('accepts a finite pair and keeps six decimal places', () => {
    expect(parseCoordinatePair(-23.5505204, -46.6333082)).toEqual({
      latitude: -23.55052,
      longitude: -46.633308,
    })
    expect(roundCoordinate(10.1234567)).toBe(10.123457)
  })

  it('treats a missing pair as no location', () => {
    expect(parseCoordinatePair(null, null)).toBeNull()
    expect(parseCoordinatePair(undefined, undefined)).toBeNull()
  })

  it('rejects a single coordinate, NaN, Infinity and out of range values', () => {
    expect(parseCoordinatePair(-23.5, null)).toBeNull()
    expect(parseCoordinatePair(null, -46.6)).toBeNull()
    expect(parseCoordinatePair(Number.NaN, -46.6)).toBeNull()
    expect(parseCoordinatePair(-23.5, Number.POSITIVE_INFINITY)).toBeNull()
    expect(parseCoordinatePair(91, 0)).toBeNull()
    expect(parseCoordinatePair(0, 181)).toBeNull()
  })
})
