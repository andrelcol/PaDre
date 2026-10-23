const localHosts = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '10.0.2.2',
  '[::1]',
])

export type HostedClientInput = {
  appEnv?: string
  supabaseUrl?: string
  anonKey?: string
  publicWebOrigin?: string
  androidUrl?: string
  appLinkHost?: string
}

export function isHostedAppEnv(value: unknown): value is 'beta' | 'production' {
  return value === 'beta' || value === 'production'
}

export function assessHostedClientEnv(input: HostedClientInput) {
  const problems: string[] = []

  if (!isHostedAppEnv(input.appEnv)) {
    problems.push('VITE_APP_ENV deve ser beta ou production.')
  }

  problems.push(...publicHttps('VITE_SUPABASE_URL', input.supabaseUrl))
  problems.push(...clientKey(input.anonKey))
  problems.push(...publicHttps('VITE_PUBLIC_WEB_ORIGIN', input.publicWebOrigin))

  if (input.androidUrl) {
    problems.push(...publicHttps('VITE_SUPABASE_URL_ANDROID', input.androidUrl))
  }

  if (input.appLinkHost) {
    const host = hostname(input.publicWebOrigin)
    if (!host || input.appLinkHost !== host) {
      problems.push(
        'VITE_APP_LINK_HOST deve ser o hostname de VITE_PUBLIC_WEB_ORIGIN.',
      )
    }
  }

  return problems
}

function publicHttps(name: string, value: string | undefined) {
  if (!value) return [`${name} é obrigatória.`]
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return [`${name} precisa ser uma URL https pública.`]
  }
  if (url.protocol !== 'https:' || localHosts.has(url.hostname)) {
    return [`${name} precisa ser uma URL https pública.`]
  }
  return []
}

function clientKey(value: string | undefined) {
  const key = value?.trim()
  if (!key) return ['VITE_SUPABASE_ANON_KEY é obrigatória.']
  const role = jwtRole(key)
  if (
    key.startsWith('sb_secret_') ||
    role === 'service_role' ||
    key.includes('service_role')
  ) {
    return ['VITE_SUPABASE_ANON_KEY não pode ser uma chave administrativa.']
  }
  if (key.startsWith('sb_publishable_') || role === 'anon') return []
  return ['VITE_SUPABASE_ANON_KEY precisa ser a chave pública do cliente.']
}

function jwtRole(token: string) {
  const part = token.split('.')[1]
  if (!part) return null
  try {
    const padded = part.replaceAll('-', '+').replaceAll('_', '/')
    const body = padded + '='.repeat((4 - (padded.length % 4)) % 4)
    const payload = JSON.parse(globalThis.atob(body)) as { role?: unknown }
    return typeof payload.role === 'string' ? payload.role : null
  } catch {
    return null
  }
}

function hostname(value: string | undefined) {
  if (!value) return null
  try {
    return new URL(value).hostname
  } catch {
    return null
  }
}
