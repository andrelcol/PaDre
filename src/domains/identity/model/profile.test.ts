import { describe, expect, it } from 'vitest'

import {
  displayNameSchema,
  formatProfileTimestamp,
  profileEditSchema,
  signupSchema,
  timezoneSchema,
  usernameSchema,
} from '@/domains/identity/model/profile.ts'

describe('profile rules', () => {
  it('normalizes the username and keeps accented display names', () => {
    expect(usernameSchema.parse(' Ana_Silva ')).toBe('ana_silva')
    expect(displayNameSchema.parse(' José Álvares ')).toBe('José Álvares')
    expect(
      signupSchema.safeParse({
        email: 'ana@padre.test',
        password: 'senha-segura',
        username: 'Ana',
        displayName: 'Ana',
      }).success,
    ).toBe(true)
  })

  it('rejects invalid usernames, time zones and visibility', () => {
    expect(usernameSchema.safeParse('João').success).toBe(false)
    expect(usernameSchema.safeParse('ab').success).toBe(false)
    expect(timezoneSchema.safeParse('America/Sao_Paulo').success).toBe(true)
    expect(timezoneSchema.safeParse('Mars/Olympus').success).toBe(false)
    expect(
      profileEditSchema.safeParse({
        username: 'ana',
        displayName: 'Ana',
        visibility: 'friends',
        timezone: 'America/Sao_Paulo',
      }).success,
    ).toBe(false)
  })

  it('formats a timestamp in the profile time zone', () => {
    const formatted = formatProfileTimestamp(
      '2026-01-15T15:00:00.000Z',
      'America/Sao_Paulo',
    )
    expect(formatted).toContain('2026')
    expect(formatted).toContain('12:00')
  })
})
