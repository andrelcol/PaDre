import { useState } from 'react'
import { useNavigate } from 'react-router'

import { useOwnProfile } from '@/domains/identity/api/queries.ts'
import { useSession } from '@/domains/identity/components/session.tsx'
import { useCreateMeetup } from '@/domains/meetups/api/queries.ts'
import { MeetupForm } from '@/domains/meetups/components/meetup-form.tsx'
import {
  defaultMeetupFormValues,
  messageFromMeetupError,
} from '@/domains/meetups/model/meetup.ts'
import { useCatalog } from '@/domains/sports/api/queries.ts'

export function NewMeetupPage() {
  const navigate = useNavigate()
  const { session } = useSession()
  const catalog = useCatalog()
  const profile = useOwnProfile(session?.user.id)
  const create = useCreateMeetup()
  const [error, setError] = useState('')
  const timeZone = profile.data?.timezone ?? 'America/Sao_Paulo'

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Novo encontro</h1>
        <p className="text-muted-foreground">
          O horário é gravado no fuso escolhido para o encontro.
        </p>
      </header>
      {catalog.isPending || profile.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Carregando formulário
        </p>
      ) : null}
      {catalog.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível carregar o catálogo.
        </p>
      ) : null}
      {catalog.data && !profile.isPending ? (
        <MeetupForm
          sports={catalog.data}
          initial={{
            ...defaultMeetupFormValues(timeZone),
            sportId: catalog.data[0]?.id ?? '',
            sportFormatId: catalog.data[0]?.formats[0]?.id ?? '',
          }}
          structureLocked={false}
          pending={create.isPending}
          submitLabel={create.isPending ? 'Criando…' : 'Criar encontro'}
          onSubmit={(draft) => {
            setError('')
            create.mutate(draft, {
              onSuccess: (id) => void navigate(`/encontros/${id}`),
              onError: (caught) => setError(messageFromMeetupError(caught)),
            })
          }}
        />
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </main>
  )
}
