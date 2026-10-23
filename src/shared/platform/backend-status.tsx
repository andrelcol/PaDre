import { useEffect, useState } from 'react'

import { readSupabaseEnv } from '@/shared/lib/env.ts'

type BackendState = 'ready' | 'missing' | 'unreachable'

export function BackendStatus() {
  const [state, setState] = useState<BackendState>(() =>
    readSupabaseEnv() ? 'ready' : 'missing',
  )

  useEffect(() => {
    const env = readSupabaseEnv()
    if (!env) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 4000)
    void fetch(`${env.url}/auth/v1/health`, { signal: controller.signal })
      .then((response) => {
        setState(response.ok ? 'ready' : 'unreachable')
      })
      .catch(() => {
        setState('unreachable')
      })
      .finally(() => window.clearTimeout(timer))
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [])

  if (state === 'ready') return null

  return (
    <p role="status" className="bg-card px-4 py-3 text-sm text-foreground">
      {state === 'missing'
        ? 'O aplicativo abriu, mas o servidor não está configurado.'
        : 'O aplicativo abriu, mas o servidor não respondeu.'}
    </p>
  )
}
