import { describe, expect, it } from 'vitest'

import { navigationLinks } from './navigation.ts'

describe('navigation links', () => {
  it('builds external destination links without a private app route', () => {
    const [google, osm] = navigationLinks({
      latitude: -23.55,
      longitude: -46.63,
    })
    expect(google?.href).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=-23.55%2C-46.63',
    )
    expect(osm?.href).toContain('https://www.openstreetmap.org/directions?to=')
    expect(google?.href.startsWith('https://')).toBe(true)
    expect(osm?.href.includes('/locais')).toBe(false)
  })
})
