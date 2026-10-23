import { useState } from 'react'

import { useSearchParams } from 'react-router'

import { PlaceBrowser } from '@/domains/maps/components/place-browser.tsx'
import { VenuePerformanceSummary } from '@/domains/statistics/components/venue-performance.tsx'
import { VenueUsageSummary } from '@/domains/statistics/components/venue-usage.tsx'
import {
  useArchiveVenue,
  useCommunityVenues,
  useCreateVenue,
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

type CommunityVenuesProps = {
  slug: string
  canManage: boolean
}

export function CommunityVenues({ slug, canManage }: CommunityVenuesProps) {
  const [params] = useSearchParams()
  const focus = params.get('mapa')
  const venues = useCommunityVenues(slug, true)
  const create = useCreateVenue(slug)
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
    <section className="flex flex-col gap-4" aria-labelledby="community-venues">
      <h2 id="community-venues" className="text-xl font-semibold">
        Locais
      </h2>
      <p className="text-sm text-muted-foreground">
        Integrantes consultam os locais da comunidade. Proprietário e
        administradores cadastram e arquivam.
      </p>
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
            canManage={canManage}
            emptyLabel="Esta comunidade ainda não tem locais."
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
      <VenueUsageSummary slug={slug} />
      {canManage ? (
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
      ) : null}
    </section>
  )
}
