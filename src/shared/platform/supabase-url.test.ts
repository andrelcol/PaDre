import { describe, expect, it } from 'vitest'

import { publicWebOrigin, resolveSupabaseUrl } from './supabase-url.ts'

describe('supabase urls', () => {
  it('keeps the web address on the browser', () => {
    expect(
      resolveSupabaseUrl('http://127.0.0.1:54321', { android: false }),
    ).toBe('http://127.0.0.1:54321')
  })

  it('points a local android build at the emulator host', () => {
    expect(
      resolveSupabaseUrl('http://127.0.0.1:54321/', { android: true }),
    ).toBe('http://10.0.2.2:54321')
    expect(
      resolveSupabaseUrl('http://localhost:54321', { android: true }),
    ).toBe('http://10.0.2.2:54321')
  })

  it('uses the explicit android address for a phone', () => {
    expect(
      resolveSupabaseUrl('http://127.0.0.1:54321', {
        android: true,
        androidUrl: 'http://127.0.0.1:54321/',
      }),
    ).toBe('http://127.0.0.1:54321')
  })

  it('keeps a future https address unchanged', () => {
    expect(
      resolveSupabaseUrl('https://api.example.com', { android: true }),
    ).toBe('https://api.example.com')
  })

  it('sends recovery links to the configured web origin on android', () => {
    expect(
      publicWebOrigin({
        android: true,
        configured: 'http://127.0.0.1:5173/',
        locationOrigin: 'https://localhost',
      }),
    ).toBe('http://127.0.0.1:5173')
    expect(
      publicWebOrigin({
        android: false,
        locationOrigin: 'http://127.0.0.1:5173',
      }),
    ).toBe('http://127.0.0.1:5173')
  })
})
