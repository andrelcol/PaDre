import { useState } from 'react'

import type { CatalogSport } from '@/domains/sports/model/catalog.ts'
import {
  describeRoster,
  describeScoringRule,
} from '@/domains/sports/model/scoring.ts'
import { Button } from '@/shared/ui/button.tsx'

type CatalogViewProps = {
  status: 'loading' | 'error' | 'ready'
  sports: CatalogSport[]
}

export function CatalogView({ status, sports }: CatalogViewProps) {
  const [sportId, setSportId] = useState<string | null>(null)
  const [formatId, setFormatId] = useState<string | null>(null)
  const sport = sports.find((item) => item.id === sportId) ?? sports[0] ?? null
  const format = sport?.formats.find((item) => item.id === formatId) ?? null

  if (status === 'loading') {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Carregando catálogo
      </p>
    )
  }

  if (status === 'error') {
    return (
      <p role="alert" className="text-sm text-destructive">
        Não foi possível carregar o catálogo.
      </p>
    )
  }

  if (!sport) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma modalidade ativa no catálogo.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <ul aria-label="Modalidades" className="grid gap-3 sm:grid-cols-2">
        {sports.map((item) => {
          const selected = item.id === sport.id
          return (
            <li
              key={item.id}
              className={`flex h-full flex-col gap-2 rounded-xl border p-4 ${
                selected ? 'ring-2 ring-ring' : ''
              }`}
            >
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setSportId(item.id)
                  setFormatId(null)
                }}
                className="text-left text-base font-semibold"
              >
                {item.name}
              </button>
              {item.description ? (
                <p className="text-sm text-muted-foreground">
                  {item.description}
                </p>
              ) : null}
            </li>
          )
        })}
      </ul>

      <section
        className="flex flex-col gap-3"
        aria-labelledby="formats-heading"
      >
        <h3 id="formats-heading" className="text-lg font-semibold">
          Formatos de {sport.name}
        </h3>
        {sport.formats.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum formato ativo nesta modalidade.
          </p>
        ) : (
          <ul
            aria-label={`Formatos de ${sport.name}`}
            className="flex flex-wrap gap-2"
          >
            {sport.formats.map((item) => (
              <li key={item.id}>
                <Button
                  variant={item.id === format?.id ? 'primary' : 'secondary'}
                  aria-pressed={item.id === format?.id}
                  onClick={() => setFormatId(item.id)}
                >
                  {item.name}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="scoring-heading"
        className="flex flex-col gap-2"
      >
        <h3 id="scoring-heading" className="text-lg font-semibold">
          Pontuação
        </h3>
        {format ? (
          <div className="flex flex-col gap-2 rounded-xl border p-4">
            <p className="font-medium">{format.name}</p>
            <p className="text-sm text-muted-foreground">
              {describeRoster({
                sideCount: format.sideCount,
                playersPerSideMin: format.playersPerSideMin,
                playersPerSideMax: format.playersPerSideMax,
              })}
            </p>
            <ul
              aria-label={`Pontuação de ${format.name}`}
              className="flex flex-col gap-1"
            >
              {describeScoringRule(format.rule).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Escolha um formato para ver a pontuação.
          </p>
        )}
      </section>
    </div>
  )
}
