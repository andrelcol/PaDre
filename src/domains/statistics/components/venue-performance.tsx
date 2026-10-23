import { useState } from 'react'
import { Link } from 'react-router'

import {
  useMyVenueStatistic,
  useMyVenueStatistics,
} from '@/domains/statistics/api/queries.ts'
import { StatisticsPanel } from '@/domains/statistics/components/statistics-panel.tsx'
import {
  formatWinRate,
  messageFromStatisticError,
  type StatisticSport,
} from '@/domains/statistics/model/statistics.ts'
import {
  comparisonHighlight,
  venueHighlightMinimum,
  venueLabel,
  venueMapPath,
  type VenuePerformance,
} from '@/domains/statistics/model/venue-statistics.ts'
import { Label } from '@/shared/ui/label.tsx'

export function VenuePerformanceSummary({ venueId }: { venueId: string }) {
  const statistics = useMyVenueStatistic(venueId)

  if (statistics.isPending) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Carregando desempenho neste local
      </p>
    )
  }
  if (statistics.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {messageFromStatisticError(statistics.error)}
      </p>
    )
  }
  if (statistics.data.sports.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma partida confirmada neste local.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-1 text-sm">
      {statistics.data.sports.map((sport) => (
        <li key={`${sport.sport_id}:${sport.rule_type}`}>
          {sport.sport_name}: {sport.matches_played} partidas, {sport.wins}{' '}
          vitórias, {formatWinRate(sport.win_rate)}
        </li>
      ))}
    </ul>
  )
}

export function VenueStatisticsPanel({ venueId }: { venueId: string }) {
  const statistics = useMyVenueStatistic(venueId)

  if (statistics.isPending) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Carregando desempenho neste local
      </p>
    )
  }
  if (statistics.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {messageFromStatisticError(statistics.error)}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <VenueSportMetrics
        sports={statistics.data.sports}
        empty="Você ainda não tem partida confirmada neste local."
      />
      {statistics.data.status === 'archived' ? (
        <p className="text-sm text-muted-foreground">
          Este local está arquivado. O histórico permanece.
        </p>
      ) : null}
    </div>
  )
}

export function VenueSportMetrics({
  sports,
  empty,
}: {
  sports: StatisticSport[]
  empty: string
}) {
  return <StatisticsPanel sports={sports} empty={empty} />
}

export function VenuePerformanceComparison({
  sports,
}: {
  sports: StatisticSport[] | undefined
}) {
  const [sportId, setSportId] = useState('')
  const [formatId, setFormatId] = useState('')
  const selected = sports?.find((sport) => sport.sport_id === sportId)
  const statistics = useMyVenueStatistics(
    sportId || null,
    sportId && formatId ? formatId : null,
    true,
  )
  const highlight =
    sportId && statistics.data
      ? comparisonHighlight(statistics.data.venues)
      : null

  return (
    <section
      className="flex flex-col gap-3"
      aria-labelledby="venue-performance"
    >
      <h2 id="venue-performance" className="text-lg font-semibold">
        Desempenho por local
      </h2>
      <p className="text-sm text-muted-foreground">
        Cada local cadastrado é o próprio cadastro, não o nome. Partidas sem
        local ficam à parte. A comparação usa a mesma modalidade
        {formatId ? ' e o mesmo formato' : ''}. Menos de {venueHighlightMinimum}{' '}
        partidas não vira destaque.
      </p>
      {sports && sports.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="venue-statistic-sport">Modalidade</Label>
            <select
              id="venue-statistic-sport"
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={sportId}
              onChange={(event) => {
                setSportId(event.target.value)
                setFormatId('')
              }}
            >
              <option value="">Todas</option>
              {sports.map((sport) => (
                <option key={sport.sport_id} value={sport.sport_id}>
                  {sport.sport_name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="venue-statistic-format">Formato</Label>
            <select
              id="venue-statistic-format"
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={formatId}
              disabled={!selected}
              onChange={(event) => setFormatId(event.target.value)}
            >
              <option value="">Todos os formatos</option>
              {selected?.formats.map((format) => (
                <option
                  key={format.sport_format_id}
                  value={format.sport_format_id}
                >
                  {format.format_name}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}
      {statistics.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Carregando desempenho por local
        </p>
      ) : null}
      {statistics.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {messageFromStatisticError(statistics.error)}
        </p>
      ) : null}
      {statistics.data ? (
        <>
          {statistics.data.venues.length === 0 &&
          statistics.data.unassigned.sports.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Você ainda não tem partidas confirmadas neste recorte.
            </p>
          ) : null}
          <ul className="flex flex-col gap-3">
            {statistics.data.venues.map((venue) => (
              <li key={venue.venue_id}>
                <VenueComparisonCard
                  venue={venue}
                  highlighted={highlight === venue.venue_id}
                  comparable={Boolean(sportId)}
                />
              </li>
            ))}
          </ul>
          {statistics.data.unassigned.sports.length > 0 ? (
            <div className="flex flex-col gap-2 rounded-xl border bg-card p-4">
              <h3 className="font-medium">Sem local cadastrado</h3>
              <p className="text-sm text-muted-foreground">
                Estas partidas continuam no desempenho geral. Elas não formam um
                local.
              </p>
              <VenueSportMetrics
                sports={statistics.data.unassigned.sports}
                empty=""
              />
            </div>
          ) : null}
          {statistics.data.truncated ? (
            <p className="text-sm text-muted-foreground">
              A lista mostra os 100 locais com mais partidas neste recorte.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  )
}

function VenueComparisonCard({
  venue,
  highlighted,
  comparable,
}: {
  venue: VenuePerformance
  highlighted: boolean
  comparable: boolean
}) {
  const sport = venue.sports[0]
  const path = venueMapPath(venue)
  const small =
    comparable &&
    sport !== undefined &&
    sport.matches_played < venueHighlightMinimum

  return (
    <article className="flex flex-col gap-2 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">{venueLabel(venue)}</h3>
        {venue.status === 'archived' ? (
          <span className="text-xs text-muted-foreground">Arquivado</span>
        ) : null}
      </div>
      {highlighted ? (
        <p className="text-sm text-pitch">
          Maior aproveitamento nesta modalidade
        </p>
      ) : null}
      {small ? (
        <p className="text-sm text-muted-foreground">
          Amostra pequena para comparar.
        </p>
      ) : null}
      {sport ? (
        <p className="text-sm">
          {sport.sport_name}: {sport.matches_played} partidas, {sport.wins}{' '}
          vitórias, {sport.losses} derrotas, {formatWinRate(sport.win_rate)}
        </p>
      ) : null}
      {venue.sports.length > 1 ? (
        <VenueSportMetrics sports={venue.sports} empty="" />
      ) : null}
      {path ? (
        <Link
          to={path}
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          Abrir no mapa
        </Link>
      ) : null}
    </article>
  )
}
