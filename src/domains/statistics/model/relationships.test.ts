import { describe, expect, it } from 'vitest'

import { relationshipStatusCopy } from './relationships.ts'

describe('relationshipStatusCopy', () => {
  it('explains the minimum sample and an empty field', () => {
    expect(relationshipStatusCopy('insufficient_sample', 5)).toBe(
      'Amostra insuficiente. É preciso pelo menos 5 partidas com a mesma pessoa.',
    )
    expect(relationshipStatusCopy('none', 5)).toBe('Ninguém nesta amostra.')
    expect(relationshipStatusCopy('selected', 5)).toBeNull()
  })
})
