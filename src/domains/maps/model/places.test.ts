import { describe, expect, it } from 'vitest'

import { selectPlace, splitLocated } from './places.ts'

const places = [
  {
    id: 'a',
    name: 'Quadra A',
    address: 'Rua 1',
    details: '',
    status: 'active',
    latitude: -23.5,
    longitude: -46.6,
  },
  {
    id: 'b',
    name: 'Quadra A',
    address: 'Rua 2',
    details: 'Coberta',
    status: 'active',
    latitude: null,
    longitude: null,
  },
]

describe('place selection', () => {
  it('keeps venues without coordinates out of the map', () => {
    const split = splitLocated(places)
    expect(split.located.map((place) => place.id)).toEqual(['a'])
    expect(split.missing.map((place) => place.id)).toEqual(['b'])
  })

  it('selects a marker by venue id, even when names match', () => {
    const split = splitLocated([
      places[0]!,
      { ...places[0]!, id: 'c', latitude: -23.4, longitude: -46.5 },
    ])
    expect(selectPlace(split.located, 'c')?.id).toBe('c')
    expect(selectPlace(split.located, 'missing')).toBeNull()
  })
})
