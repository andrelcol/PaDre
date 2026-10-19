import { useState } from 'react'

import { useMeetupStatistics } from '@/domains/statistics/api/queries.ts'
import { StatisticsPanel } from '@/domains/statistics/components/statistics-panel.tsx'
import { messageFromStatisticError } from '@/domains/statistics/model/statistics.ts'
import { Label } from '@/shared/ui/label.tsx'

export function MeetupPerformance({ meetupId }: { meetupId: string }) {
  const stats = useMeetupStatistics(meetupId)
  const participants = stats.data?.participants ?? []
  const [userId, setUserId] = useState('')
  const selected =
    participants.find((person) => person.user_id === userId) ?? participants[0]

  return (
    <section
      className="flex flex-col gap-3"
      aria-labelledby="meetup-performance"
    >
      <h2 id="meetup-performance" className="text-lg font-semibold">
        Desempenho dos confirmados
      </h2>
      <p className="text-sm text-muted-foreground">
        Quem está confirmado neste encontro pode ver o desempenho esportivo dos
        outros confirmados. E-mail, preferências e o restante do perfil
        continuam privados.
      </p>
      {stats.isPending ? (
        <p className="text-sm text-muted-foreground">Carregando desempenho</p>
      ) : null}
      {stats.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {messageFromStatisticError(stats.error)}
        </p>
      ) : null}
      {stats.data && participants.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Ninguém confirmado neste encontro.
        </p>
      ) : null}
      {selected ? (
        <div className="flex flex-col gap-3">
          {participants.length > 1 ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor="performance-player">Participante</Label>
              <select
                id="performance-player"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={selected.user_id}
                onChange={(event) => setUserId(event.target.value)}
              >
                {participants.map((person) => (
                  <option key={person.user_id} value={person.user_id}>
                    {person.username}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <h3 className="text-base font-medium">{selected.username}</h3>
          )}
          <StatisticsPanel
            sports={selected.sports}
            empty="Nenhuma partida confirmada ainda."
          />
        </div>
      ) : null}
    </section>
  )
}
