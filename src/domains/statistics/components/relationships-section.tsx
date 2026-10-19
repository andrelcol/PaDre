import { useState } from 'react'

import {
  useMyOpponents,
  useMyRelationshipHighlights,
  useMyTeammates,
} from '@/domains/statistics/api/queries.ts'
import { RelationshipBoard } from '@/domains/statistics/components/relationship-board.tsx'
import { messageFromRelationshipError } from '@/domains/statistics/model/relationships.ts'
import type { StatisticSport } from '@/domains/statistics/model/statistics.ts'
import { Label } from '@/shared/ui/label.tsx'

const pageSize = 20

type RelationshipsSectionProps = {
  loading: boolean
  error: unknown
  sports: StatisticSport[] | undefined
}

export function RelationshipsSection({
  loading,
  error,
  sports,
}: RelationshipsSectionProps) {
  const [sportId, setSportId] = useState('')
  const [formatId, setFormatId] = useState('')
  const [teammateOffset, setTeammateOffset] = useState(0)
  const [opponentOffset, setOpponentOffset] = useState(0)
  const sport = sports?.find((item) => item.sport_id === sportId) ?? sports?.[0]
  const format = sport?.formats.find(
    (item) => item.sport_format_id === formatId,
  )
  const activeFormat = format?.sport_format_id ?? null
  const highlights = useMyRelationshipHighlights(sport?.sport_id, activeFormat)
  const teammates = useMyTeammates(
    sport?.sport_id,
    activeFormat,
    teammateOffset,
  )
  const opponents = useMyOpponents(
    sport?.sport_id,
    activeFormat,
    opponentOffset,
  )
  const failed = error ?? highlights.error ?? teammates.error ?? opponents.error

  return (
    <section
      className="flex flex-col gap-3"
      aria-labelledby="relationships-heading"
    >
      <h2 id="relationships-heading" className="text-lg font-semibold">
        Companheiros e adversários
      </h2>
      <p className="text-sm text-muted-foreground">
        Calculado só com quem jogou na mesma partida confirmada. O nome de
        usuário de quem jogou com você aparece aqui. E-mail e a lista de
        encontros continuam privados.
      </p>
      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando relações</p>
      ) : null}
      {failed ? (
        <p role="alert" className="text-sm text-destructive">
          {messageFromRelationshipError(failed)}
        </p>
      ) : null}
      {sports && sports.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Você ainda não tem partidas confirmadas com outras pessoas.
        </p>
      ) : null}
      {sport ? (
        <div className="flex flex-col gap-3">
          {sports && sports.length > 1 ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor="relationship-sport">Modalidade</Label>
              <select
                id="relationship-sport"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={sport.sport_id}
                onChange={(event) => {
                  setSportId(event.target.value)
                  setFormatId('')
                  setTeammateOffset(0)
                  setOpponentOffset(0)
                }}
              >
                {sports.map((item) => (
                  <option key={item.sport_id} value={item.sport_id}>
                    {item.sport_name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <h3 className="text-base font-medium">{sport.sport_name}</h3>
          )}
          <div className="flex flex-col gap-1">
            <Label htmlFor="relationship-format">Formato</Label>
            <select
              id="relationship-format"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={activeFormat ?? ''}
              onChange={(event) => {
                setFormatId(event.target.value)
                setTeammateOffset(0)
                setOpponentOffset(0)
              }}
            >
              <option value="">Todos os formatos</option>
              {sport.formats.map((item) => (
                <option key={item.sport_format_id} value={item.sport_format_id}>
                  {item.format_name}
                </option>
              ))}
            </select>
          </div>
          {highlights.isPending ||
          teammates.isPending ||
          opponents.isPending ? (
            <p className="text-sm text-muted-foreground">Carregando relações</p>
          ) : null}
          {highlights.data && teammates.data && opponents.data ? (
            <RelationshipBoard
              key={`${sport.sport_id}:${activeFormat ?? ''}`}
              highlights={highlights.data}
              teammates={teammates.data.relationships}
              opponents={opponents.data.relationships}
              teammateTotal={teammates.data.total}
              opponentTotal={opponents.data.total}
              teammateOffset={teammateOffset}
              opponentOffset={opponentOffset}
              pageSize={pageSize}
              onTeammatePage={setTeammateOffset}
              onOpponentPage={setOpponentOffset}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
