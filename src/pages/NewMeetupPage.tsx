import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'

import { useCommunity } from '@/domains/communities/api/queries.ts'
import { messageFromCommunityError } from '@/domains/communities/model/community.ts'
import { useOwnProfile } from '@/domains/identity/api/queries.ts'
import { useSession } from '@/domains/identity/components/session.tsx'
import {
  useCreateCommunityMeetup,
  useCreateMeetup,
} from '@/domains/meetups/api/queries.ts'
import { MeetupForm } from '@/domains/meetups/components/meetup-form.tsx'
import {
  defaultMeetupFormValues,
  messageFromMeetupError,
  type MeetupDraft,
} from '@/domains/meetups/model/meetup.ts'
import { useCatalog } from '@/domains/sports/api/queries.ts'

export function NewMeetupPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const communitySlug = params.get('comunidade') ?? ''
  const { session } = useSession()
  const catalog = useCatalog()
  const community = useCommunity(communitySlug)
  const profile = useOwnProfile(session?.user.id)
  const create = useCreateMeetup()
  const createCommunity = useCreateCommunityMeetup(communitySlug)
  const [error, setError] = useState('')
  const timeZone = profile.data?.timezone ?? 'America/Sao_Paulo'
  const waiting =
    catalog.isPending ||
    profile.isPending ||
    (communitySlug.length > 0 && community.isPending)
  const communitySports =
    catalog.data?.filter((sport) =>
      community.data?.sports.some((item) => item.id === sport.id),
    ) ?? []
  const sports = communitySlug ? communitySports : (catalog.data ?? [])
  const canWrite =
    !communitySlug ||
    (Boolean(community.data?.myRole) && communitySports.length > 0)

  function publish(draft: MeetupDraft) {
    setError('')
    const onSuccess = (id: string) => void navigate(`/encontros/${id}`)
    const onError = (caught: unknown) =>
      setError(messageFromMeetupError(caught))
    if (communitySlug) {
      createCommunity.mutate(draft, { onSuccess, onError })
      return
    }
    create.mutate(draft, { onSuccess, onError })
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Novo encontro</h1>
        <p className="text-muted-foreground">
          {community.data
            ? `Comunidade: ${community.data.name}. O encontro fica visível para os integrantes.`
            : 'O horário é gravado no fuso escolhido para o encontro.'}
        </p>
      </header>
      {waiting ? (
        <p role="status" className="text-sm text-muted-foreground">
          Carregando formulário
        </p>
      ) : null}
      {catalog.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível carregar o catálogo.
        </p>
      ) : null}
      {communitySlug && community.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {messageFromCommunityError(community.error)}
        </p>
      ) : null}
      {community.data && !community.data.myRole ? (
        <p role="alert" className="text-sm text-destructive">
          Você não participa desta comunidade.
        </p>
      ) : null}
      {community.data?.myRole && communitySports.length === 0 && !waiting ? (
        <p role="alert" className="text-sm text-destructive">
          Esta comunidade não tem modalidade ativa para um encontro.
        </p>
      ) : null}
      {catalog.data && !waiting && canWrite ? (
        <MeetupForm
          sports={sports}
          initial={{
            ...defaultMeetupFormValues(timeZone),
            sportId: sports[0]?.id ?? '',
            sportFormatId: sports[0]?.formats[0]?.id ?? '',
          }}
          structureLocked={false}
          pending={create.isPending || createCommunity.isPending}
          submitLabel={
            create.isPending || createCommunity.isPending
              ? communitySlug
                ? 'Publicando…'
                : 'Criando…'
              : communitySlug
                ? 'Publicar encontro'
                : 'Criar encontro'
          }
          onSubmit={publish}
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
