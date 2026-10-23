import { describe, expect, it } from 'vitest'

import { venueDraftSchema, venueEditSchema, parseVenues } from './venue.ts'

describe('venue drafts', () => {
  it('accepts an accented name without coordinates', () => {
    const parsed = venueDraftSchema.parse({
      name: 'Quadra do José',
      address: 'Rua São João, 10',
      details: 'Entrada pelo portão lateral.',
    })
    expect(parsed.name).toBe('Quadra do José')
    expect(
      venueEditSchema.parse({ name: 'Quadra Central', details: '' }).name,
    ).toBe('Quadra Central')
  })

  it('keeps two equal names as separate records', () => {
    const venues = parseVenues([
      row('a1000000-0000-4000-8000-000000000021', 'Quadra Central'),
      row('a1000000-0000-4000-8000-000000000022', 'Quadra Central'),
    ])
    expect(venues).toHaveLength(2)
    expect(venues[0]?.id).not.toBe(venues[1]?.id)
  })
})

function row(id: string, name: string) {
  return {
    id,
    name,
    address: 'Rua 1',
    details: null,
    latitude: null,
    longitude: null,
    status: 'active',
    scope: 'personal',
    created_at: '2026-10-19T12:00:00.000Z',
    updated_at: '2026-10-19T12:00:00.000Z',
  }
}
