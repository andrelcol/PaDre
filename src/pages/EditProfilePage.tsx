import { useState } from 'react'
import { useNavigate } from 'react-router'

import {
  useOwnProfile,
  useUpdateOwnProfile,
} from '@/domains/identity/api/queries.ts'
import { PersonalDetailsForm } from '@/domains/identity/components/sports-identity.tsx'
import { ProfileForm } from '@/domains/identity/components/profile-form.tsx'
import { useSession } from '@/domains/identity/components/session.tsx'
import {
  fieldErrorsFromZod,
  profileEditSchema,
  type ProfileEdit,
} from '@/domains/identity/model/profile.ts'

export function EditProfilePage() {
  const { session } = useSession()
  const navigate = useNavigate()
  const userId = session?.user.id
  const profileQuery = useOwnProfile(userId)
  const mutation = useUpdateOwnProfile(userId)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  if (profileQuery.isLoading) {
    return (
      <p
        className="px-6 py-16 text-sm text-muted-foreground"
        aria-live="polite"
      >
        Carregando perfil
      </p>
    )
  }

  if (profileQuery.isError || !profileQuery.data) {
    return (
      <p role="alert" className="px-6 py-16 text-sm text-destructive">
        Não foi possível carregar o perfil.
      </p>
    )
  }

  const defaults: ProfileEdit = {
    username: profileQuery.data.username,
    displayName: profileQuery.data.displayName,
    visibility: profileQuery.data.visibility,
    timezone: profileQuery.data.timezone,
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Editar perfil</h1>
        <p className="text-sm text-muted-foreground">
          O identificador da conta não muda. Senha fica na recuperação de
          acesso.
        </p>
      </div>
      <PersonalDetailsForm />
      <ProfileForm
        key={`${profileQuery.data.updatedAt}-${profileQuery.data.username}`}
        defaultValues={defaults}
        pending={mutation.isPending}
        formError={
          mutation.error instanceof Error ? mutation.error.message : undefined
        }
        fieldErrors={fieldErrors}
        onSubmit={(values) => {
          const parsed = profileEditSchema.safeParse(values)
          if (!parsed.success) {
            setFieldErrors(fieldErrorsFromZod(parsed.error))
            return
          }
          setFieldErrors({})
          mutation.mutate(parsed.data, {
            onSuccess: () => {
              void navigate('/perfil')
            },
          })
        }}
      />
    </main>
  )
}
