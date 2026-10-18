import {
  ownProfileSchema,
  type OwnProfile,
  type ProfileEdit,
} from '@/domains/identity/model/profile.ts'
import { toAuthError } from '@/domains/identity/api/errors.ts'
import { requireSupabase } from '@/shared/lib/supabase.ts'

export async function getOwnProfile(userId: string): Promise<OwnProfile> {
  const supabase = requireSupabase()
  const [profileResult, preferencesResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, username, display_name, visibility, created_at, updated_at')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('profile_preferences')
      .select('timezone')
      .eq('user_id', userId)
      .maybeSingle(),
  ])

  if (profileResult.error) throw toAuthError(profileResult.error)
  if (preferencesResult.error) throw toAuthError(preferencesResult.error)
  if (!profileResult.data || !preferencesResult.data) {
    throw new Error('Não foi possível carregar o perfil.')
  }

  const parsed = ownProfileSchema.safeParse({
    id: profileResult.data.id,
    username: profileResult.data.username,
    displayName: profileResult.data.display_name,
    visibility: profileResult.data.visibility,
    timezone: preferencesResult.data.timezone,
    createdAt: profileResult.data.created_at,
    updatedAt: profileResult.data.updated_at,
  })

  if (!parsed.success) {
    throw new Error('O perfil salvo está incompleto.')
  }

  return parsed.data
}

export async function updateOwnProfile(userId: string, input: ProfileEdit) {
  const supabase = requireSupabase()
  const profileResult = await supabase
    .from('profiles')
    .update({
      username: input.username,
      display_name: input.displayName,
      visibility: input.visibility,
    })
    .eq('id', userId)
    .select('id')

  if (profileResult.error) throw toAuthError(profileResult.error)
  if (!profileResult.data?.length) {
    throw new Error('Não foi possível salvar o perfil.')
  }

  const preferencesResult = await supabase
    .from('profile_preferences')
    .update({ timezone: input.timezone })
    .eq('user_id', userId)
    .select('user_id')

  if (preferencesResult.error) throw toAuthError(preferencesResult.error)
  if (!preferencesResult.data?.length) {
    throw new Error('Não foi possível salvar o fuso horário.')
  }
}
