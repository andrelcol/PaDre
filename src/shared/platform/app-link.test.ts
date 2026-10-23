import { describe, expect, it } from 'vitest'

import { appPathFromUrl } from './app-link.ts'

const token = 'a'.repeat(43)
const meetup = 'a1000000-0000-4000-8000-000000000031'

describe('app links', () => {
  it('accepts the real invite, meetup and community paths', () => {
    expect(appPathFromUrl(`padre://convite/${token}`)).toBe(`/convite/${token}`)
    expect(appPathFromUrl(`https://localhost/encontros/${meetup}`)).toBe(
      `/encontros/${meetup}`,
    )
    expect(appPathFromUrl('padre://comunidades/volei-de-quinta')).toBe(
      '/comunidades/volei-de-quinta',
    )
    expect(appPathFromUrl('https://localhost/redefinir-senha')).toBe(
      '/redefinir-senha',
    )
  })

  it('rejects other origins, tokens and paths', () => {
    expect(appPathFromUrl('javascript:alert(1)')).toBeNull()
    expect(appPathFromUrl(`https://evil.example/convite/${token}`)).toBeNull()
    expect(appPathFromUrl('padre://convite/curto')).toBeNull()
    expect(appPathFromUrl('padre://admin')).toBeNull()
    expect(appPathFromUrl('padre://comunidades/Nova')).toBeNull()
    expect(appPathFromUrl('not a url')).toBeNull()
  })
})
