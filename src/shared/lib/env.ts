import { z } from 'zod'

import {
  assessHostedClientEnv,
  isHostedAppEnv,
} from '@/shared/platform/hosted-env.ts'
import { isNativeAndroid } from '@/shared/platform/runtime.ts'
import {
  publicWebOrigin,
  resolveSupabaseUrl,
} from '@/shared/platform/supabase-url.ts'

const supabaseEnvSchema = z.object({
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
  VITE_SUPABASE_URL_ANDROID: z.url().optional(),
})

export type SupabaseEnv = {
  url: string
  anonKey: string
}

export function readSupabaseEnv(): SupabaseEnv | null {
  const androidUrl = import.meta.env.VITE_SUPABASE_URL_ANDROID
  const parsed = supabaseEnvSchema.safeParse({
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
    VITE_SUPABASE_URL_ANDROID: androidUrl || undefined,
  })

  if (!parsed.success) return null

  if (isHostedAppEnv(import.meta.env.VITE_APP_ENV)) {
    const problems = assessHostedClientEnv({
      appEnv: import.meta.env.VITE_APP_ENV,
      supabaseUrl: parsed.data.VITE_SUPABASE_URL,
      anonKey: parsed.data.VITE_SUPABASE_ANON_KEY,
      publicWebOrigin: import.meta.env.VITE_PUBLIC_WEB_ORIGIN,
      androidUrl: parsed.data.VITE_SUPABASE_URL_ANDROID,
      appLinkHost: import.meta.env.VITE_APP_LINK_HOST,
    })
    if (problems.length > 0) return null
  }

  return {
    url: resolveSupabaseUrl(parsed.data.VITE_SUPABASE_URL, {
      android: isNativeAndroid(),
      androidUrl: parsed.data.VITE_SUPABASE_URL_ANDROID,
    }),
    anonKey: parsed.data.VITE_SUPABASE_ANON_KEY,
  }
}

export function readPublicWebOrigin() {
  const configured = import.meta.env.VITE_PUBLIC_WEB_ORIGIN
  return publicWebOrigin({
    android: isNativeAndroid(),
    configured: typeof configured === 'string' ? configured : undefined,
    locationOrigin: window.location.origin,
  })
}
