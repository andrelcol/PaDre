import { describe, expect, it } from 'vitest'

import { mapStyleUrl } from './styles.ts'

describe('map styles', () => {
  it('uses a light style and a separate dark style', () => {
    expect(mapStyleUrl('light')).toContain('/styles/liberty')
    expect(mapStyleUrl('dark')).toContain('/styles/dark')
    expect(mapStyleUrl('dark')).not.toBe(mapStyleUrl('light'))
  })
})
