import type { MouseEvent } from 'react'

import { navigationLinks } from '@/domains/maps/model/navigation.ts'
import type { Coordinates } from '@/domains/maps/model/coordinates.ts'
import { openExternalUrl } from '@/shared/platform/external-url.ts'
import { isNativeAndroid } from '@/shared/platform/runtime.ts'

export function DirectionsActions({ point }: { point: Coordinates }) {
  const links = navigationLinks(point)

  function open(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (!isNativeAndroid()) return
    event.preventDefault()
    void openExternalUrl(href)
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Como chegar</p>
      <div className="flex flex-wrap gap-2">
        {links.map((link) => (
          <a
            key={link.label}
            className="inline-flex min-h-11 items-center rounded-md border bg-card px-3 text-sm"
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => open(event, link.href)}
          >
            {link.label}
          </a>
        ))}
      </div>
    </div>
  )
}
