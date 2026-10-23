import { useState, type ReactNode } from 'react'

import { DirectionsActions } from '@/domains/maps/components/directions-actions.tsx'
import { SportsMap } from '@/domains/maps/components/sports-map.tsx'
import {
  venueStatusLabel,
  type VenueStatus,
} from '@/domains/venues/model/venue.ts'
import {
  selectPlace,
  splitLocated,
  type PlacePoint,
} from '@/domains/maps/model/places.ts'
import { Button } from '@/shared/ui/button.tsx'

type PlaceBrowserProps<T extends PlacePoint> = {
  places: T[]
  children: ReactNode
  initialView?: 'list' | 'map'
  initialSelectedId?: string | null
  renderSelected?: (place: T) => ReactNode
}

export function PlaceBrowser<T extends PlacePoint>({
  places,
  children,
  initialView = 'list',
  initialSelectedId = null,
  renderSelected,
}: PlaceBrowserProps<T>) {
  const [view, setView] = useState<'list' | 'map'>(initialView)
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId)
  const { located, missing } = splitLocated(places)
  const selected = selectPlace(located, selectedId)

  function openPlace(id: string) {
    setView('list')
    window.setTimeout(() => {
      document.getElementById(`local-${id}`)?.scrollIntoView({ block: 'start' })
    }, 0)
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label="Visualização dos locais"
        className="flex gap-2"
      >
        <Button
          type="button"
          role="tab"
          aria-selected={view === 'list'}
          variant={view === 'list' ? 'primary' : 'secondary'}
          onClick={() => setView('list')}
        >
          Lista
        </Button>
        <Button
          type="button"
          role="tab"
          aria-selected={view === 'map'}
          variant={view === 'map' ? 'primary' : 'secondary'}
          onClick={() => setView('map')}
        >
          Mapa
        </Button>
      </div>
      {view === 'list' ? (
        children
      ) : located.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum local com posição no mapa.
          {missing.length > 0
            ? ` ${missing.length} continuam na lista, sem marcador.`
            : ''}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <SportsMap
            markers={located.map((place) => ({
              id: place.id,
              label: place.name,
              latitude: place.latitude,
              longitude: place.longitude,
            }))}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          {missing.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              {missing.length}{' '}
              {missing.length === 1 ? 'local continua' : 'locais continuam'} na
              lista sem posição no mapa.
            </p>
          ) : null}
          {selected ? (
            <article className="flex flex-col gap-2 rounded-xl border bg-card p-4">
              <h3 className="text-lg font-semibold">{selected.name}</h3>
              <p className="text-sm">{selected.address}</p>
              {selected.details ? (
                <p className="text-sm text-muted-foreground">
                  {selected.details}
                </p>
              ) : null}
              <p className="text-sm">
                {venueStatusLabel(selected.status as VenueStatus)}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => openPlace(selected.id)}>
                  Abrir o local
                </Button>
              </div>
              {renderSelected ? renderSelected(selected) : null}
              <DirectionsActions point={selected} />
            </article>
          ) : (
            <p className="text-sm text-muted-foreground">
              Selecione um marcador para ver o local.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
