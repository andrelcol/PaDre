import { useState } from 'react'

import {
  useMeetupRelationships,
  useMeetupStatistics,
} from '@/domains/statistics/api/queries.ts'
import { RelationshipBoard } from '@/domains/statistics/components/relationship-board.tsx'
import { messageFromRelationshipError } from '@/domains/statistics/model/relationships.ts'
import { Label } from '@/shared/ui/label.tsx'

export function MeetupRelationships({ meetupId }: { meetupId: string }) {
  const roster = useMeetupStatistics(meetupId)
  const participants = roster.data?.participants ?? []
  const [playerId, setPlayerId] = useState('')
  const [sportId, setSportId] = useState('')
  const selected =
    participants.find((person) => person.user_id === playerId) ??
    participants[0]
  const relationships = useMeetupRelationships(meetupId, selected?.user_id)
  const sports = relationships.data?.sports ?? []
  const sport = sports.find((item) => item.sport_id === sportId) ?? sports[0]
  const failed = roster.isError
    ? roster.error
    : relationships.isError
      ? relationships.error
      : null

  return (
    <section
      className="flex flex-col gap-3"
      aria-labelledby="meetup-relationships"
    >
      <h2 id="meetup-relationships" className="text-lg font-semibold">
        Companheiros e adversários
      </h2>
      <p className="text-sm text-muted-foreground">
        Quem está confirmado pode ver os confrontos entre os confirmados. Os
        números reúnem as partidas confirmadas entre essas pessoas, sem listar
        os encontros. E-mail e quem jogou fora deste grupo não aparecem.
      </p>
      {roster.isPending || relationships.isPending ? (
        <p className="text-sm text-muted-foreground">Carregando relações</p>
      ) : null}
      {failed ? (
        <p role="alert" className="text-sm text-destructive">
          {messageFromRelationshipError(failed)}
        </p>
      ) : null}
      {roster.data && participants.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Ninguém confirmado neste encontro.
        </p>
      ) : null}
      {selected ? (
        <div className="flex flex-col gap-3">
          {participants.length > 1 ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor="relationship-player">Jogador</Label>
              <select
                id="relationship-player"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={selected.user_id}
                onChange={(event) => {
                  setPlayerId(event.target.value)
                  setSportId('')
                }}
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
          {sports.length > 1 ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor="meetup-relationship-sport">Modalidade</Label>
              <select
                id="meetup-relationship-sport"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={sport?.sport_id ?? ''}
                onChange={(event) => setSportId(event.target.value)}
              >
                {sports.map((item) => (
                  <option key={item.sport_id} value={item.sport_id}>
                    {item.sport_name}
                  </option>
                ))}
              </select>
            </div>
          ) : sport ? (
            <h3 className="text-base font-medium">{sport.sport_name}</h3>
          ) : relationships.data ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma partida confirmada com os outros confirmados.
            </p>
          ) : null}
          {sport ? (
            <RelationshipBoard
              key={`${selected.user_id}:${sport.sport_id}`}
              highlights={sport.highlights}
              teammates={sport.teammates}
              opponents={sport.opponents}
              teammateTotal={sport.teammates.length}
              opponentTotal={sport.opponents.length}
              teammateOffset={0}
              opponentOffset={0}
              pageSize={64}
              onTeammatePage={() => undefined}
              onOpponentPage={() => undefined}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
