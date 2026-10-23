import type { Coordinates } from './coordinates.ts'

export type NavigationLink = {
  label: string
  href: string
}

export function navigationLinks(point: Coordinates): NavigationLink[] {
  const pair = `${point.latitude},${point.longitude}`
  return [
    {
      label: 'Google Maps',
      href: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(pair)}`,
    },
    {
      label: 'OpenStreetMap',
      href: `https://www.openstreetmap.org/directions?to=${encodeURIComponent(`${point.latitude},${point.longitude}`)}`,
    },
  ]
}
