import type {
  RecoverInput,
  ResetInput,
  SignupInput,
  LoginInput,
} from '@/domains/identity/model/profile.ts'
import { toAuthError } from '@/domains/identity/api/errors.ts'
import { readPublicWebOrigin } from '@/shared/lib/env.ts'
import { requireSupabase } from '@/shared/lib/supabase.ts'

export async function signUp(input: SignupInput, emailRedirectTo?: string) {
  const supabase = requireSupabase()
  const available = await supabase.rpc('username_is_available', {
    candidate: input.username,
  })

  if (available.error) {
    throw new Error('Não foi possível verificar o nome de usuário.')
  }

  if (!available.data) {
    throw new Error('Esse nome de usuário já está em uso.')
  }

  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo,
      data: {
        username: input.username,
        display_name: input.displayName,
      },
    },
  })

  if (error) throw toAuthError(error)

  return { session: data.session }
}

export async function signIn(input: LoginInput) {
  const supabase = requireSupabase()
  const { error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  })

  if (error) throw toAuthError(error)
}

export async function requestPasswordRecovery(input: RecoverInput) {
  const supabase = requireSupabase()
  const { error } = await supabase.auth.resetPasswordForEmail(input.email, {
    redirectTo: `${readPublicWebOrigin()}/redefinir-senha`,
  })

  if (error) throw toAuthError(error)
}

export async function resetPassword(input: ResetInput) {
  const supabase = requireSupabase()
  const { error } = await supabase.auth.updateUser({
    password: input.password,
  })

  if (error) throw toAuthError(error)
}

export async function signOut() {
  const supabase = requireSupabase()
  const { error } = await supabase.auth.signOut()
  if (error) throw toAuthError(error)
}
