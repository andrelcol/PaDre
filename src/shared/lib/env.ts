import { z } from 'zod'

const supabaseEnvSchema = z.object({
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
})

export type SupabaseEnv = {
  url: string
  anonKey: string
}

export function readSupabaseEnv(): SupabaseEnv | null {
  const parsed = supabaseEnvSchema.safeParse({
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  })

  if (!parsed.success) return null

  return {
    url: parsed.data.VITE_SUPABASE_URL,
    anonKey: parsed.data.VITE_SUPABASE_ANON_KEY,
  }
}
