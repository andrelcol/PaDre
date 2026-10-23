import { useEffect, useRef, useState } from 'react'

import {
  deviceLocationMessage,
  readDeviceLocation,
} from '@/domains/maps/lib/device-location.ts'
import {
  roundCoordinate,
  type Coordinates,
} from '@/domains/maps/model/coordinates.ts'
import { mapAttribution, mapStyleUrl } from '@/domains/maps/providers/styles.ts'
import { useResolvedTheme } from '@/shared/theme/theme-context.ts'
import { Button } from '@/shared/ui/button.tsx'

export type MapMarker = Coordinates & {
  id: string
  label: string
}

type SportsMapProps = {
  markers?: MapMarker[]
  selectedId?: string | null
  onSelect?: (id: string) => void
  draft?: Coordinates | null
  onDraft?: (point: Coordinates) => void
  picking?: boolean
  className?: string
}

type MapLibre = typeof import('maplibre-gl')

const markerLimit = 200
const viewOrigin = { longitude: -46.633308, latitude: -23.55052 }

export function SportsMap({
  markers = [],
  selectedId = null,
  onSelect,
  draft = null,
  onDraft,
  picking = false,
  className = 'h-72',
}: SportsMapProps) {
  const theme = useResolvedTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<import('maplibre-gl').Map | null>(null)
  const maplibreRef = useRef<MapLibre | null>(null)
  const markersRef = useRef<import('maplibre-gl').Marker[]>([])
  const observerRef = useRef<ResizeObserver | null>(null)
  const onSelectRef = useRef(onSelect)
  const onDraftRef = useRef(onDraft)
  const pickingRef = useRef(picking)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [userPoint, setUserPoint] = useState<Coordinates | null>(null)
  const [locationMessage, setLocationMessage] = useState('')

  useEffect(() => {
    onSelectRef.current = onSelect
    onDraftRef.current = onDraft
    pickingRef.current = picking
  })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let disposed = false
    let loaded = false
    setStatus('loading')

    void (async () => {
      try {
        const [maplibre, worker] = await Promise.all([
          import('maplibre-gl'),
          import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'),
          import('maplibre-gl/dist/maplibre-gl.css'),
        ])
        if (disposed || !containerRef.current) return
        maplibre.setWorkerUrl(worker.default)
        maplibreRef.current = maplibre
        const map = new maplibre.Map({
          container: containerRef.current,
          style: mapStyleUrl(theme),
          center: [viewOrigin.longitude, viewOrigin.latitude],
          zoom: 12,
          cooperativeGestures: true,
          attributionControl: { compact: false },
        })
        map.addControl(
          new maplibre.NavigationControl({ showCompass: false }),
          'top-right',
        )
        map.on('load', () => {
          loaded = true
          if (!disposed) setStatus('ready')
        })
        map.on('error', () => {
          if (!loaded && !disposed) setStatus('error')
        })
        map.on('click', (event) => {
          if (!pickingRef.current || !onDraftRef.current) return
          onDraftRef.current({
            latitude: roundCoordinate(event.lngLat.lat),
            longitude: roundCoordinate(event.lngLat.lng),
          })
        })
        mapRef.current = map
        const observer = new ResizeObserver(() => map.resize())
        observer.observe(containerRef.current)
        observerRef.current = observer
        if (disposed) {
          observer.disconnect()
          map.remove()
        }
      } catch {
        if (!disposed) setStatus('error')
      }
    })()

    return () => {
      disposed = true
      observerRef.current?.disconnect()
      observerRef.current = null
      for (const marker of markersRef.current) marker.remove()
      markersRef.current = []
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [theme])

  useEffect(() => {
    const map = mapRef.current
    const maplibre = maplibreRef.current
    if (!map || !maplibre || status !== 'ready') return
    for (const marker of markersRef.current) marker.remove()
    markersRef.current = []

    for (const point of markers.slice(0, markerLimit)) {
      const selected = point.id === selectedId
      markersRef.current.push(
        placeMarker(maplibre, map, point, selected, () => {
          onSelectRef.current?.(point.id)
        }),
      )
    }
    if (draft) {
      const marker = placeMarker(
        maplibre,
        map,
        { ...draft, id: 'draft', label: 'Posição selecionada' },
        true,
        () => undefined,
        true,
      )
      marker.on('dragend', () => {
        const next = marker.getLngLat()
        onDraftRef.current?.({
          latitude: roundCoordinate(next.lat),
          longitude: roundCoordinate(next.lng),
        })
      })
      markersRef.current.push(marker)
    }
    if (userPoint) {
      markersRef.current.push(
        placeMarker(
          maplibre,
          map,
          { ...userPoint, id: 'device', label: 'Minha localização' },
          false,
          () => undefined,
        ),
      )
    }
  }, [markers, selectedId, draft, userPoint, status])

  function useMapCenter() {
    const center = mapRef.current?.getCenter()
    if (!center || !onDraft) return
    onDraft({
      latitude: roundCoordinate(center.lat),
      longitude: roundCoordinate(center.lng),
    })
  }

  async function showMyLocation() {
    setLocationMessage('')
    const result = await readDeviceLocation()
    if (!result.ok) {
      setLocationMessage(deviceLocationMessage(result.reason))
      return
    }
    const point = {
      latitude: roundCoordinate(result.latitude),
      longitude: roundCoordinate(result.longitude),
    }
    setUserPoint(point)
    mapRef.current?.flyTo({
      center: [point.longitude, point.latitude],
      zoom: 15,
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={containerRef}
        className={`w-full overflow-hidden rounded-xl border ${className}`}
      />
      {status === 'loading' ? (
        <p role="status" className="text-sm text-muted-foreground">
          Carregando mapa
        </p>
      ) : null}
      {status === 'error' ? (
        <p role="alert" className="text-sm text-destructive">
          O mapa não carregou. Dá para continuar sem marcar a posição.
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">{mapAttribution}</p>
      <p className="text-xs text-muted-foreground">
        No celular, use dois dedos para mover o mapa.
      </p>
      {markers.length > markerLimit ? (
        <p className="text-sm text-muted-foreground">
          Mostrando os primeiros {markerLimit} locais com posição.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {picking ? (
          <Button
            type="button"
            variant="secondary"
            disabled={status !== 'ready'}
            onClick={useMapCenter}
          >
            Usar o centro do mapa
          </Button>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          disabled={status !== 'ready'}
          onClick={() => void showMyLocation()}
        >
          Mostrar minha localização
        </Button>
      </div>
      {locationMessage ? (
        <p role="status" className="text-sm text-muted-foreground">
          {locationMessage}
        </p>
      ) : null}
    </div>
  )
}

function placeMarker(
  maplibre: MapLibre,
  map: import('maplibre-gl').Map,
  point: MapMarker,
  selected: boolean,
  onClick: () => void,
  draggable = false,
) {
  const element = document.createElement('button')
  element.type = 'button'
  element.setAttribute('aria-label', point.label)
  element.className =
    'size-5 rounded-full border-2 border-background shadow ' +
    (selected ? 'bg-primary' : 'bg-pitch')
  element.addEventListener('click', (event) => {
    event.stopPropagation()
    onClick()
  })
  return new maplibre.Marker({ element, draggable })
    .setLngLat([point.longitude, point.latitude])
    .addTo(map)
}
