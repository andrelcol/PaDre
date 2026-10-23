import { useState } from 'react'
import { useSearchParams } from 'react-router'

import { PlaceBrowser } from '@/domains/maps/components/place-browser.tsx'
import { VenuePerformanceSummary } from '@/domains/statistics/components/venue-performance.tsx'
import {
  useArchiveVenue,
  useCreateVenue,
  useMyVenues,
  useSetVenueLocation,
  useUpdateVenue,
} from '@/domains/venues/api/queries.ts'
import { VenueCatalog } from '@/domains/venues/components/venue-catalog.tsx'
import { VenueForm } from '@/domains/venues/components/venue-form.tsx'
import {
  messageFromVenueError,
  venueLoadError,
  type VenueDraft,
  type VenueEdit,
} from '@/domains/venues/model/venue.ts'

export function VenuesPage() {
  const [params] = useSearchParams()
  const focus = params.get('mapa')
  const venues = useMyVenues()
  const create = useCreateVenue()
  const update = useUpdateVenue()
  const archive = useArchiveVenue()
  const locate = useSetVenueLocation()
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const pending =
    create.isPending ||
    update.isPending ||
    archive.isPending ||
    locate.isPending

  async function publish(draft: VenueDraft | VenueEdit) {
    setNotice('')
    setError('')
    try {
      await create.mutateAsync({
        name: draft.name,
        address: 'address' in draft ? draft.address : '',
        details: draft.details,
        latitude: 'latitude' in draft ? draft.latitude : null,
        longitude: 'longitude' in draft ? draft.longitude : null,
      })
      setNotice('Local cadastrado.')
    } catch (caught) {
      setError(messageFromVenueError(caught))
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Locais</h1>
        <p className="text-muted-foreground">
          Cadastre quadras e ginásios para reutilizar nos seus encontros.
        </p>
      </header>
      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {venues.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Carregando locais
        </p>
      ) : null}
      {venues.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {venueLoadError(venues.error)}
        </p>
      ) : null}
      {venues.data ? (
        <PlaceBrowser
          places={venues.data}
          initialView={focus ? 'map' : 'list'}
          initialSelectedId={focus}
          renderSelected={(place) => (
            <VenuePerformanceSummary venueId={place.id} />
          )}
        >
          <VenueCatalog
            venues={venues.data}
            canManage
            emptyLabel="Você ainda não cadastrou locais."
            pending={pending}
            onUpdate={(venueId, draft) =>
              update.mutateAsync({ venueId, draft })
            }
            onArchive={(venueId) => archive.mutateAsync(venueId)}
            onSetLocation={(venueId, point) =>
              locate.mutateAsync({
                venueId,
                latitude: point.latitude,
                longitude: point.longitude,
              })
            }
          />
        </PlaceBrowser>
      ) : null}
      <section className="flex flex-col gap-3" aria-labelledby="new-venue">
        <h2 id="new-venue" className="text-xl font-semibold">
          Novo local
        </h2>
        <VenueForm
          mode="create"
          initial={{
            name: '',
            address: '',
            details: '',
            latitude: null,
            longitude: null,
          }}
          pending={pending}
          submitLabel={create.isPending ? 'Salvando…' : 'Cadastrar local'}
          onSubmit={(draft) => void publish(draft)}
        />
      </section>
    </main>
  )
}
