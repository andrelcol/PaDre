import { useState } from 'react'

import { SportsMap } from '@/domains/maps/components/sports-map.tsx'
import {
  formatCoordinates,
  type Coordinates,
} from '@/domains/maps/model/coordinates.ts'
import { Button } from '@/shared/ui/button.tsx'

type VenueLocationPickerProps = {
  point: Coordinates | null
  onChange: (point: Coordinates | null) => void
}

export function VenueLocationPicker({
  point,
  onChange,
}: VenueLocationPickerProps) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setOpen((current) => !current)}
        >
          {open ? 'Fechar mapa' : 'Marcar no mapa'}
        </Button>
        {open ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? 'Reduzir mapa' : 'Ampliar mapa'}
          </Button>
        ) : null}
        {point ? (
          <Button type="button" variant="ghost" onClick={() => onChange(null)}>
            Limpar seleção
          </Button>
        ) : null}
      </div>
      {open ? (
        <SportsMap
          picking
          draft={point}
          onDraft={onChange}
          className={expanded ? 'h-[70vh]' : 'h-72'}
        />
      ) : null}
      {point ? (
        <p className="text-sm text-muted-foreground">
          Posição selecionada: {formatCoordinates(point)}. Ela ainda não foi
          salva.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Abrir o mapa não grava a posição. Escolha um ponto para marcá-la.
        </p>
      )}
    </div>
  )
}
