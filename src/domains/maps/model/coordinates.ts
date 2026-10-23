export type Coordinates = {
  latitude: number
  longitude: number
}

export function roundCoordinate(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000
}

export function parseCoordinatePair(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): Coordinates | null {
  if (latitude == null && longitude == null) return null
  if (
    latitude == null ||
    longitude == null ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null
  }
  return {
    latitude: roundCoordinate(latitude),
    longitude: roundCoordinate(longitude),
  }
}

export function formatCoordinates(point: Coordinates) {
  return `${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}`
}
