import { StatisticsPanel } from '@/domains/statistics/components/statistics-panel.tsx'
import {
  messageFromStatisticError,
  type StatisticSport,
} from '@/domains/statistics/model/statistics.ts'

type PerformanceSectionProps = {
  title: string
  loading: boolean
  error: unknown
  sports: StatisticSport[] | undefined
  empty: string
  note?: string
}

export function PerformanceSection({
  title,
  loading,
  error,
  sports,
  empty,
  note,
}: PerformanceSectionProps) {
  return (
    <section
      className="flex flex-col gap-3"
      aria-labelledby="performance-heading"
    >
      <h2 id="performance-heading" className="text-lg font-semibold">
        {title}
      </h2>
      {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando desempenho</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {messageFromStatisticError(error)}
        </p>
      ) : null}
      {sports ? <StatisticsPanel sports={sports} empty={empty} /> : null}
    </section>
  )
}
