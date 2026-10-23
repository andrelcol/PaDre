import { useState } from 'react'
import { Link } from 'react-router'

import { DirectionsActions } from '@/domains/maps/components/directions-actions.tsx'
import { VenueLocationPicker } from '@/domains/maps/components/venue-location-picker.tsx'
import {
  parseCoordinatePair,
  type Coordinates,
} from '@/domains/maps/model/coordinates.ts'
import { VenueStatisticsPanel } from '@/domains/statistics/components/venue-performance.tsx'
import { useVenueMeetups } from '@/domains/venues/api/queries.ts'
import { VenueForm } from '@/domains/venues/components/venue-form.tsx'
import {
  messageFromVenueError,
  venueScopeLabel,
  venueStatusLabel,
  type Venue,
  type VenueEdit,
} from '@/domains/venues/model/venue.ts'
import { Button } from '@/shared/ui/button.tsx'

type VenueCatalogProps = {
  venues: Venue[]
  canManage: boolean
  emptyLabel: string
  pending: boolean
  onUpdate: (venueId: string, draft: VenueEdit) => Promise<unknown>
  onArchive: (venueId: string) => Promise<unknown>
  onSetLocation: (venueId: string, point: Coordinates) => Promise<unknown>
}

export function VenueCatalog({
  venues,
  canManage,
  emptyLabel,
  pending,
  onUpdate,
  onArchive,
  onSetLocation,
}: VenueCatalogProps) {
  if (venues.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>
  }

  return (
    <ul className="flex flex-col gap-4">
      {venues.map((venue) => (
        <li key={venue.id}>
          <VenueCard
            venue={venue}
            canManage={canManage}
            pending={pending}
            onUpdate={onUpdate}
            onArchive={onArchive}
            onSetLocation={onSetLocation}
          />
        </li>
      ))}
    </ul>
  )
}

function VenueCard({
  venue,
  canManage,
  pending,
  onUpdate,
  onArchive,
  onSetLocation,
}: {
  venue: Venue
  canManage: boolean
  pending: boolean
  onUpdate: (venueId: string, draft: VenueEdit) => Promise<unknown>
  onArchive: (venueId: string) => Promise<unknown>
  onSetLocation: (venueId: string, point: Coordinates) => Promise<unknown>
}) {
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [showMeetups, setShowMeetups] = useState(false)
  const [showStatistics, setShowStatistics] = useState(false)
  const [error, setError] = useState('')
  const [point, setPoint] = useState<Coordinates | null>(null)
  const [confirmingPoint, setConfirmingPoint] = useState(false)
  const active = venue.status === 'active'
  const location = parseCoordinatePair(venue.latitude, venue.longitude)

  return (
    <article
      id={`local-${venue.id}`}
      className="flex flex-col gap-3 rounded-xl border p-4"
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">{venue.name}</h3>
          <p className="text-sm text-muted-foreground">{venue.address}</p>
        </div>
        <p className="text-sm">
          {venueScopeLabel(venue.scope)} · {venueStatusLabel(venue.status)}
        </p>
      </header>
      {venue.details ? <p className="text-sm">{venue.details}</p> : null}
      {location ? (
        <p className="text-sm">Posição registrada.</p>
      ) : (
        <p className="text-sm text-muted-foreground">Sem posição no mapa.</p>
      )}
      {canManage && active && !location ? (
        <div className="flex flex-col gap-2">
          <VenueLocationPicker point={point} onChange={setPoint} />
          <p className="text-sm text-muted-foreground">
            Registrar a posição uma vez não altera encontros antigos.
          </p>
          <Button
            type="button"
            variant="secondary"
            disabled={pending || !point}
            onClick={() => {
              if (!point) return
              if (!confirmingPoint) {
                setConfirmingPoint(true)
                return
              }
              setError('')
              void onSetLocation(venue.id, point)
                .then(() => {
                  setPoint(null)
                  setConfirmingPoint(false)
                })
                .catch((caught: unknown) =>
                  setError(messageFromVenueError(caught)),
                )
            }}
          >
            {confirmingPoint ? 'Confirmar posição' : 'Registrar esta posição'}
          </Button>
        </div>
      ) : null}
      {location ? <DirectionsActions point={location} /> : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {editing ? (
        <VenueForm
          mode="edit"
          initial={{
            name: venue.name,
            address: venue.address,
            details: venue.details,
          }}
          pending={pending}
          submitLabel={pending ? 'Salvando…' : 'Salvar local'}
          onCancel={() => setEditing(false)}
          onSubmit={(draft) => {
            setError('')
            void onUpdate(venue.id, {
              name: draft.name,
              details: draft.details,
            })
              .then(() => setEditing(false))
              .catch((caught: unknown) =>
                setError(messageFromVenueError(caught)),
              )
          }}
        />
      ) : null}
      <div className="flex flex-wrap gap-2">
        {canManage && active && !editing ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => setEditing(true)}
          >
            Editar local
          </Button>
        ) : null}
        {canManage && active ? (
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              if (!confirming) {
                setConfirming(true)
                return
              }
              setError('')
              void onArchive(venue.id)
                .then(() => setConfirming(false))
                .catch((caught: unknown) =>
                  setError(messageFromVenueError(caught)),
                )
            }}
          >
            {confirming ? 'Confirmar arquivamento' : 'Arquivar local'}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          onClick={() => setShowMeetups((current) => !current)}
        >
          {showMeetups ? 'Ocultar encontros' : 'Ver encontros'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setShowStatistics((current) => !current)}
        >
          {showStatistics ? 'Ocultar desempenho' : 'Ver desempenho'}
        </Button>
      </div>
      {showStatistics ? <VenueStatisticsPanel venueId={venue.id} /> : null}
      {showMeetups ? <VenueMeetups venueId={venue.id} /> : null}
    </article>
  )
}

function VenueMeetups({ venueId }: { venueId: string }) {
  const [offset, setOffset] = useState(0)
  const meetups = useVenueMeetups(venueId, true, 20, offset)

  if (meetups.isPending) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Carregando encontros
      </p>
    )
  }
  if (meetups.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Não foi possível carregar os encontros deste local.
      </p>
    )
  }
  if (meetups.data.meetups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum encontro seu usa este local.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {meetups.data.meetups.map((meetup) => (
          <li key={meetup.id}>
            <Link to={`/encontros/${meetup.id}`} className="text-sm underline">
              {meetup.title}
            </Link>
            <p className="text-sm text-muted-foreground">
              {meetup.locationName}
              {meetup.locationAddress ? ` · ${meetup.locationAddress}` : ''}
            </p>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {offset > 0 ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => setOffset((current) => Math.max(0, current - 20))}
          >
            Encontros anteriores
          </Button>
        ) : null}
        {offset + meetups.data.meetups.length < meetups.data.total ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => setOffset((current) => current + 20)}
          >
            Próximos encontros
          </Button>
        ) : null}
      </div>
    </div>
  )
}
