import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/shared/lib/database.types.ts'
import { readSupabaseEnv } from '@/shared/lib/env.ts'

let client: SupabaseClient<Database> | null = null

export function getSupabase() {
  if (client) return client

  const env = readSupabaseEnv()
  if (!env) return null

  client = createClient<Database>(env.url, env.anonKey, {
    auth: {
      flowType: 'pkce',
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
    },
  })

  return client
}

export function requireSupabase() {
  const supabase = getSupabase()
  if (!supabase) {
    throw new Error('O Supabase local não está configurado.')
  }
  return supabase
}
