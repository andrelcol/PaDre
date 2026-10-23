import { DirectionsActions } from '@/domains/maps/components/directions-actions.tsx'
import { SportsMap } from '@/domains/maps/components/sports-map.tsx'
import { parseCoordinatePair } from '@/domains/maps/model/coordinates.ts'

type VenueMapPreviewProps = {
  id: string
  name: string
  latitude: number | null
  longitude: number | null
}

export function VenueMapPreview({
  id,
  name,
  latitude,
  longitude,
}: VenueMapPreviewProps) {
  const point = parseCoordinatePair(latitude, longitude)
  if (!point) {
    return <p className="text-sm text-muted-foreground">Sem posição no mapa.</p>
  }
  return (
    <div className="flex flex-col gap-3">
      <SportsMap markers={[{ id, label: name, ...point }]} selectedId={id} />
      <DirectionsActions point={point} />
    </div>
  )
}
