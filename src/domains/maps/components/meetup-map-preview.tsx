import { DirectionsActions } from '@/domains/maps/components/directions-actions.tsx'
import { SportsMap } from '@/domains/maps/components/sports-map.tsx'
import { parseCoordinatePair } from '@/domains/maps/model/coordinates.ts'

type MeetupMapPreviewProps = {
  name: string
  latitude: number | null
  longitude: number | null
}

export function MeetupMapPreview({
  name,
  latitude,
  longitude,
}: MeetupMapPreviewProps) {
  const point = parseCoordinatePair(latitude, longitude)
  if (!point) {
    return (
      <p className="text-sm text-muted-foreground">
        Este encontro não tem posição no mapa.
      </p>
    )
  }
  return (
    <section className="flex flex-col gap-3" aria-label="Mapa do encontro">
      <SportsMap
        markers={[{ id: 'meetup', label: name, ...point }]}
        selectedId="meetup"
      />
      <DirectionsActions point={point} />
    </section>
  )
}
