import { parseCoordinatePair, type Coordinates } from './coordinates.ts'

export type PlacePoint = {
  id: string
  name: string
  address: string
  details: string
  status: string
  latitude: number | null
  longitude: number | null
}

export type LocatedPlace = PlacePoint & Coordinates

export function splitLocated<T extends PlacePoint>(places: T[]) {
  const located: Array<T & Coordinates> = []
  const missing: T[] = []
  for (const place of places) {
    const point = parseCoordinatePair(place.latitude, place.longitude)
    if (point) located.push({ ...place, ...point })
    else missing.push(place)
  }
  return { located, missing }
}

export function selectPlace<T extends { id: string }>(
  places: T[],
  id: string | null,
) {
  if (!id) return null
  return places.find((place) => place.id === id) ?? null
}
