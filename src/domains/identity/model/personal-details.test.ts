import { describe, expect, it } from 'vitest'

import {
  heightLabel,
  sexLabel,
  uploadAvatar,
  validateAvatarFile,
} from '@/domains/identity/model/personal-details.ts'

describe('personal details', () => {
  it('formats height in centimeters and leaves sex empty as not informed', () => {
    expect(heightLabel(175)).toBe('175 cm')
    expect(heightLabel(null)).toBe('Não informado')
    expect(sexLabel(null)).toBe('Não informado')
    expect(sexLabel('intersex')).toBe('Intersexo')
  })

  it('rejects an unsafe avatar and does not pretend the upload worked', async () => {
    const svg = new File(['<svg></svg>'], 'avatar.svg', {
      type: 'image/svg+xml',
    })
    expect(validateAvatarFile(svg)).toMatch(/JPEG/)
    const huge = { type: 'image/png', size: 2 * 1024 * 1024 + 1 } as File
    expect(validateAvatarFile(huge)).toMatch(/2 MB/)
    const png = new File([new Uint8Array([1, 2, 3])], 'ok.png', {
      type: 'image/png',
    })
    await expect(uploadAvatar(png)).rejects.toThrow(/não está disponível/)
  })
})
