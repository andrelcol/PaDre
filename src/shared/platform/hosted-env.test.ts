import { describe, expect, it } from 'vitest'

import { assessHostedClientEnv } from './hosted-env.ts'

const anonKey = jwt({ role: 'anon' })

const hosted = {
  appEnv: 'beta',
  supabaseUrl: 'https://example.supabase.co',
  anonKey,
  publicWebOrigin: 'https://beta.example.com',
}

describe('hosted client env', () => {
  it('accepts the public https configuration', () => {
    expect(assessHostedClientEnv(hosted)).toEqual([])
  })

  it('accepts a publishable client key', () => {
    expect(
      assessHostedClientEnv({
        ...hosted,
        anonKey: 'sb_publishable_example',
      }),
    ).toEqual([])
  })

  it('rejects a local or administrative configuration', () => {
    expect(
      assessHostedClientEnv({
        appEnv: 'local',
        supabaseUrl: 'http://127.0.0.1:54321',
        anonKey: jwt({ role: 'service_role' }),
        publicWebOrigin: 'http://localhost:5173',
        androidUrl: 'http://10.0.2.2:54321',
        appLinkHost: 'outro.example',
      }),
    ).toEqual([
      'VITE_APP_ENV deve ser beta ou production.',
      'VITE_SUPABASE_URL precisa ser uma URL https pública.',
      'VITE_SUPABASE_ANON_KEY não pode ser uma chave administrativa.',
      'VITE_PUBLIC_WEB_ORIGIN precisa ser uma URL https pública.',
      'VITE_SUPABASE_URL_ANDROID precisa ser uma URL https pública.',
      'VITE_APP_LINK_HOST deve ser o hostname de VITE_PUBLIC_WEB_ORIGIN.',
    ])
  })
})

function jwt(payload: { role: string }) {
  const header = encode({ alg: 'none', typ: 'JWT' })
  const body = encode(payload)
  return `${header}.${body}.signature`
}

function encode(value: unknown) {
  return btoa(JSON.stringify(value))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}
