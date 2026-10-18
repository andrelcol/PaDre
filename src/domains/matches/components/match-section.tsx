import { useState } from 'react'

import {
  useMatchCommand,
  useMeetupMatches,
} from '@/domains/matches/api/queries.ts'
import { MatchLineupForm } from '@/domains/matches/components/match-lineup-form.tsx'
import { MatchResultForm } from '@/domains/matches/components/match-result-form.tsx'
import {
  confirmedSides,
  describeScore,
  matchActionLabel,
  matchStatusLabel,
  messageFromMatchError,
  outcomeLabel,
  type MatchRecord,
} from '@/domains/matches/model/match.ts'
import { Button } from '@/shared/ui/button.tsx'

type MatchSectionProps = {
  meetupId: string
  organizer: boolean
  meetupStatus: 'scheduled' | 'cancelled'
  playersPerSideMin: number | null
  playersPerSideMax: number | null
}

export function MatchSection({
  meetupId,
  organizer,
  meetupStatus,
  playersPerSideMin,
  playersPerSideMax,
}: MatchSectionProps) {
  const board = useMeetupMatches(meetupId)
  const command = useMatchCommand(meetupId)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [voiding, setVoiding] = useState<string | null>(null)

  function run(task: Parameters<typeof command.mutate>[0], success: string) {
    setNotice('')
    setError('')
    command.mutate(task, {
      onSuccess: () => {
        setVoiding(null)
        setNotice(success)
      },
      onError: (caught) => setError(messageFromMatchError(caught)),
    })
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="matches-heading">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="matches-heading" className="text-lg font-semibold">
          Partidas
        </h2>
        {organizer && meetupStatus === 'scheduled' ? (
          <Button
            disabled={command.isPending}
            onClick={() => run({ type: 'create' }, 'Partida criada.')}
            className="w-full sm:w-auto"
          >
            {command.isPending ? 'Criando partida…' : 'Nova partida'}
          </Button>
        ) : null}
      </div>
      {notice ? (
        <p className="text-sm text-muted-foreground">{notice}</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {board.isPending ? (
        <p className="text-sm text-muted-foreground">Carregando partidas</p>
      ) : null}
      {board.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível carregar as partidas.
        </p>
      ) : null}
      {board.data && board.data.matches.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma partida neste encontro.
        </p>
      ) : null}
      <ol className="flex flex-col gap-4">
        {board.data?.matches.map((match, index) => (
          <MatchCard
            key={match.id}
            match={match}
            index={index + 1}
            organizer={organizer}
            roster={board.data?.roster ?? []}
            minimum={playersPerSideMin}
            maximum={playersPerSideMax}
            pending={command.isPending}
            voiding={voiding === match.id}
            onLineup={(value) =>
              run(
                {
                  type: 'lineup',
                  matchId: match.id,
                  side1Name: value.side1Name,
                  side1Players: value.side1,
                  side2Name: value.side2Name,
                  side2Players: value.side2,
                },
                'Equipes salvas.',
              )
            }
            onResult={(payload) =>
              run(
                { type: 'result', matchId: match.id, payload },
                'Placar salvo.',
              )
            }
            onRevise={(payload) =>
              run(
                { type: 'revise', matchId: match.id, payload },
                'Placar reenviado. As confirmações anteriores não valem mais.',
              )
            }
            onSubmit={() =>
              run(
                { type: 'submit', matchId: match.id },
                'Placar enviado para confirmação.',
              )
            }
            onConfirm={() =>
              run(
                { type: 'confirm', matchId: match.id },
                'Confirmação registrada.',
              )
            }
            onDispute={() =>
              run({ type: 'dispute', matchId: match.id }, 'Placar contestado.')
            }
            onVoid={() => {
              if (voiding !== match.id) {
                setVoiding(match.id)
                return
              }
              run({ type: 'void', matchId: match.id }, 'Partida anulada.')
            }}
          />
        ))}
      </ol>
    </section>
  )
}

function MatchCard({
  match,
  index,
  organizer,
  roster,
  minimum,
  maximum,
  pending,
  voiding,
  onLineup,
  onResult,
  onRevise,
  onSubmit,
  onConfirm,
  onDispute,
  onVoid,
}: {
  match: MatchRecord
  index: number
  organizer: boolean
  roster: { userId: string; username: string }[]
  minimum: number | null
  maximum: number | null
  pending: boolean
  voiding: boolean
  onLineup: (value: {
    side1Name: string
    side2Name: string
    side1: string[]
    side2: string[]
  }) => void
  onResult: Parameters<typeof MatchResultForm>[0]['onSubmit']
  onRevise: Parameters<typeof MatchResultForm>[0]['onSubmit']
  onSubmit: () => void
  onConfirm: () => void
  onDispute: () => void
  onVoid: () => void
}) {
  const sides = confirmedSides(match)
  const side1 = match.teams.find((team) => team.side === 1)
  const side2 = match.teams.find((team) => team.side === 2)
  const open =
    match.status === 'draft' ||
    match.status === 'pending_confirmation' ||
    match.status === 'disputed'
  const mySideConfirmed =
    match.myTeamSide !== null && sides.has(match.myTeamSide)

  return (
    <li className="flex flex-col gap-4 rounded-xl border p-4">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">
          Partida {index} · {matchStatusLabel(match.status)}
        </p>
        <h3 className="font-medium">
          {side1?.name ?? 'Lado 1'} × {side2?.name ?? 'Lado 2'}
        </h3>
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        <TeamList team={side1} />
        <TeamList team={side2} />
      </div>
      {match.result ? (
        <div className="flex flex-col gap-1 text-sm">
          <p>
            Placar: {describeScore(match.rule, match.result.payload)} ·{' '}
            {outcomeLabel(match.result.outcome, match.teams)}
          </p>
          <p>
            Revisão {match.result.revision}
            {match.status === 'confirmed'
              ? ' · Resultado definitivo'
              : match.status === 'voided'
                ? ''
                : ' · Resultado ainda não é definitivo'}
          </p>
          {match.status === 'pending_confirmation' ? (
            <p>
              {sides.has(1)
                ? `${side1?.name ?? 'Lado 1'} confirmou.`
                : `${side1?.name ?? 'Lado 1'} ainda não confirmou.`}{' '}
              {sides.has(2)
                ? `${side2?.name ?? 'Lado 2'} confirmou.`
                : `${side2?.name ?? 'Lado 2'} ainda não confirmou.`}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Placar ainda não registrado.
        </p>
      )}
      {organizer &&
      match.status === 'draft' &&
      minimum !== null &&
      maximum !== null ? (
        <MatchLineupForm
          key={`${match.id}-lineup`}
          idPrefix={match.id}
          roster={roster}
          initialSide1Name={side1?.name ?? 'Lado 1'}
          initialSide2Name={side2?.name ?? 'Lado 2'}
          initialSide1={side1?.players.map((player) => player.userId) ?? []}
          initialSide2={side2?.players.map((player) => player.userId) ?? []}
          minimum={minimum}
          maximum={maximum}
          pending={pending}
          onSave={onLineup}
        />
      ) : null}
      {organizer && match.status === 'draft' ? (
        <MatchResultForm
          key={`${match.id}-result-${match.result?.revision ?? 0}`}
          idPrefix={match.id}
          rule={match.rule}
          teams={match.teams}
          initial={match.result?.payload}
          pending={pending}
          submitLabel="Salvar placar"
          onSubmit={onResult}
        />
      ) : null}
      {organizer &&
      (match.status === 'pending_confirmation' ||
        match.status === 'disputed') ? (
        <MatchResultForm
          key={`${match.id}-revise-${match.result?.revision ?? 0}`}
          idPrefix={`${match.id}-revise`}
          rule={match.rule}
          teams={match.teams}
          initial={match.result?.payload}
          pending={pending}
          submitLabel="Reenviar placar"
          onSubmit={onRevise}
        />
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {organizer && match.status === 'draft' ? (
          <Button
            disabled={pending || !match.result}
            onClick={onSubmit}
            className="w-full sm:w-auto"
          >
            Enviar para confirmação
          </Button>
        ) : null}
        {match.status === 'pending_confirmation' &&
        match.myTeamSide !== null &&
        !mySideConfirmed ? (
          <>
            <Button
              disabled={pending}
              onClick={onConfirm}
              className="w-full sm:w-auto"
            >
              Confirmar placar
            </Button>
            <Button
              variant="secondary"
              disabled={pending}
              onClick={onDispute}
              className="w-full sm:w-auto"
            >
              Contestar placar
            </Button>
          </>
        ) : null}
        {mySideConfirmed && match.status === 'pending_confirmation' ? (
          <p className="text-sm text-muted-foreground">
            Sua equipe já confirmou esta revisão.
          </p>
        ) : null}
        {organizer && open && match.status !== 'confirmed' ? (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={onVoid}
            className="w-full sm:w-auto"
          >
            {voiding ? 'Confirmar anulação' : 'Anular partida'}
          </Button>
        ) : null}
      </div>
      {organizer && match.status === 'draft' ? (
        <p className="text-sm text-muted-foreground">
          A confirmação só é aceita depois do início do encontro.
        </p>
      ) : null}
      <details>
        <summary className="cursor-pointer text-sm">
          Histórico da partida {index}
        </summary>
        <ul className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
          {match.audit.map((entry, entryIndex) => (
            <li key={`${entry.action}-${entry.createdAt}-${entryIndex}`}>
              {matchActionLabel(entry.action)} · {entry.username}
              {entry.revision ? ` · revisão ${entry.revision}` : ''}
            </li>
          ))}
        </ul>
      </details>
    </li>
  )
}

function TeamList({
  team,
}: {
  team: MatchRecord['teams'][number] | undefined
}) {
  if (!team) return null
  return (
    <div>
      <p className="text-sm font-medium">{team.name}</p>
      {team.players.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem jogadores</p>
      ) : (
        <ul className="text-sm">
          {team.players.map((player) => (
            <li key={player.userId}>{player.username}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
