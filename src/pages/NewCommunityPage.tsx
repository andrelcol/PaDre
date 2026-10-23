import { useState } from 'react'
import { useNavigate } from 'react-router'

import { useCreateCommunity } from '@/domains/communities/api/queries.ts'
import { CommunityForm } from '@/domains/communities/components/community-form.tsx'
import { messageFromCommunityError } from '@/domains/communities/model/community.ts'
import { useCatalog } from '@/domains/sports/api/queries.ts'

export function NewCommunityPage() {
  const navigate = useNavigate()
  const catalog = useCatalog()
  const create = useCreateCommunity()
  const [error, setError] = useState('')
  const sports = catalog.data?.map((sport) => ({
    id: sport.id,
    name: sport.name,
  }))

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Nova comunidade
        </h1>
        <p className="text-muted-foreground">
          Você se torna proprietário e escolhe as modalidades do catálogo.
        </p>
      </header>
      {catalog.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Carregando modalidades
        </p>
      ) : null}
      {catalog.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível carregar as modalidades.
        </p>
      ) : null}
      {sports ? (
        <CommunityForm
          sports={sports}
          visibilityLocked={false}
          pending={create.isPending}
          submitLabel={create.isPending ? 'Criando…' : 'Criar comunidade'}
          initial={{
            name: '',
            description: '',
            visibility: 'public',
            sportIds: [],
          }}
          onSubmit={(draft) => {
            setError('')
            create.mutate(draft, {
              onSuccess: (slug) => void navigate(`/comunidades/${slug}`),
              onError: (caught) => setError(messageFromCommunityError(caught)),
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
