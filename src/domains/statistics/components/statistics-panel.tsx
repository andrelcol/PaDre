import { useState } from 'react'

import {
  formatWinRate,
  showsDecidingPoints,
  signedDifference,
  type StatisticBucket,
  type StatisticSport,
} from '@/domains/statistics/model/statistics.ts'
import { Label } from '@/shared/ui/label.tsx'

type StatisticsPanelProps = {
  sports: StatisticSport[]
  empty: string
}

export function StatisticsPanel({ sports, empty }: StatisticsPanelProps) {
  const [sportKey, setSportKey] = useState(
    sports[0] ? `${sports[0].sport_id}:${sports[0].rule_type}` : '',
  )
  const selected =
    sports.find(
      (sport) => `${sport.sport_id}:${sport.rule_type}` === sportKey,
    ) ?? sports[0]

  if (!selected) {
    return <p className="text-sm text-muted-foreground">{empty}</p>
  }

  const options = sports.filter(
    (sport, index, list) =>
      list.findIndex(
        (item) =>
          item.sport_id === sport.sport_id &&
          item.rule_type === sport.rule_type,
      ) === index,
  )

  return (
    <div className="flex flex-col gap-4">
      {options.length > 1 ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor="statistic-sport">Modalidade</Label>
          <select
            id="statistic-sport"
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={`${selected.sport_id}:${selected.rule_type}`}
            onChange={(event) => setSportKey(event.target.value)}
          >
            {options.map((sport) => (
              <option
                key={`${sport.sport_id}:${sport.rule_type}`}
                value={`${sport.sport_id}:${sport.rule_type}`}
              >
                {sport.sport_name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <h3 className="text-base font-medium">{selected.sport_name}</h3>
      )}
      <StatisticFigures bucket={selected} ruleType={selected.rule_type} />
      {selected.formats.length > 1 ? (
        <div className="flex flex-col gap-3">
          {selected.formats.map((format) => (
            <div key={format.sport_format_id} className="flex flex-col gap-2">
              <h4 className="text-sm font-medium">{format.format_name}</h4>
              <StatisticFigures bucket={format} ruleType={selected.rule_type} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function StatisticFigures({
  bucket,
  ruleType,
}: {
  bucket: StatisticBucket
  ruleType: StatisticSport['rule_type']
}) {
  const rows = [
    ['Partidas', String(bucket.matches_played)],
    ['Vitórias', String(bucket.wins)],
    ['Derrotas', String(bucket.losses)],
    ...(ruleType === 'goal_based' ? [['Empates', String(bucket.draws)]] : []),
    ['Aproveitamento', formatWinRate(bucket.win_rate)],
    ...pair(
      'Pontos marcados',
      'Pontos sofridos',
      'Saldo de pontos',
      bucket.points_for,
      bucket.points_against,
    ),
    ...pair(
      'Gols marcados',
      'Gols sofridos',
      'Saldo de gols',
      bucket.goals_for,
      bucket.goals_against,
    ),
    ...pair(
      'Sets vencidos',
      'Sets perdidos',
      null,
      bucket.sets_won,
      bucket.sets_lost,
    ),
    ...pair(
      'Games vencidos',
      'Games perdidos',
      null,
      bucket.games_won,
      bucket.games_lost,
    ),
    ...(showsDecidingPoints(bucket)
      ? pair(
          'Pontos do set decisivo',
          'Pontos sofridos no set decisivo',
          null,
          bucket.deciding_points_for,
          bucket.deciding_points_against,
        )
      : []),
  ]

  return (
    <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function pair(
  favorLabel: string,
  againstLabel: string,
  balanceLabel: string | null,
  favor: number | null | undefined,
  against: number | null | undefined,
) {
  if (favor == null || against == null) return []
  const rows = [
    [favorLabel, String(favor)],
    [againstLabel, String(against)],
  ]
  if (balanceLabel) rows.push([balanceLabel, signedDifference(favor, against)])
  return rows
}
