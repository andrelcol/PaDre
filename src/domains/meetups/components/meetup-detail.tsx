import { useState } from 'react'
import { Link } from 'react-router'

import {
  canChangeStructure,
  type MeetupDetail,
} from '@/domains/meetups/model/meetup.ts'
import { formatMeetupInstant } from '@/domains/meetups/model/schedule.ts'
import { describeScoringRule } from '@/domains/sports/model/scoring.ts'
import { Button } from '@/shared/ui/button.tsx'
import { Label } from '@/shared/ui/label.tsx'

const statusLabels = {
  scheduled: 'Agendado',
  cancelled: 'Cancelado',
} as const

const invitationLabels = {
  pending: 'Pendente',
  accepted: 'Aceito',
  declined: 'Recusado',
  cancelled: 'Cancelado',
} as const

type MeetupDetailViewProps = {
  meetup: MeetupDetail
  friends: { username: string }[]
  pending: boolean
  onInvite: (username: string) => void
  onCancelInvitation: (invitationId: string) => void
  onRespond: (invitationId: string, action: 'accept' | 'decline') => void
  onLeave: () => void
  onJoin: () => void
  onCancelMeetup: () => void
  onEdit: () => void
}

export function MeetupDetailView({
  meetup,
  friends,
  pending,
  onInvite,
  onCancelInvitation,
  onRespond,
  onLeave,
  onJoin,
  onCancelMeetup,
  onEdit,
}: MeetupDetailViewProps) {
  const [username, setUsername] = useState(friends[0]?.username ?? '')
  const [confirming, setConfirming] = useState<string | null>(null)
  const spotLabel =
    meetup.openSpots === 1
      ? '1 vaga disponível'
      : `${meetup.openSpots} vagas disponíveis`

  function confirm(key: string, run: () => void) {
    if (confirming === key) {
      setConfirming(null)
      run()
      return
    }
    setConfirming(key)
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          {statusLabels[meetup.status]}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {meetup.title}
        </h1>
        {meetup.communitySlug && meetup.communityName ? (
          <p className="text-sm">
            Comunidade:{' '}
            <Link
              to={`/comunidades/${meetup.communitySlug}`}
              className="font-medium underline"
            >
              {meetup.communityName}
            </Link>
          </p>
        ) : null}
        {meetup.description ? <p>{meetup.description}</p> : null}
        {meetup.myParticipation === 'confirmed' ? (
          <p className="text-sm text-muted-foreground">
            Sua presença está confirmada.
          </p>
        ) : null}
        {meetup.status === 'cancelled' ? (
          <p className="text-sm text-muted-foreground">
            Este encontro foi cancelado.
          </p>
        ) : null}
      </header>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Modalidade</dt>
          <dd>{meetup.sportName}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Formato</dt>
          <dd>{meetup.formatName}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Início</dt>
          <dd>{formatMeetupInstant(meetup.startsAt, meetup.timeZone)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Término</dt>
          <dd>{formatMeetupInstant(meetup.endsAt, meetup.timeZone)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Fuso</dt>
          <dd>{meetup.timeZone}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Local</dt>
          <dd>
            {meetup.locationName}
            {meetup.locationAddress ? ` · ${meetup.locationAddress}` : ''}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Organização</dt>
          <dd>{meetup.organizerUsername}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Vagas</dt>
          <dd>
            {meetup.confirmedCount} de {meetup.maxParticipants} · {spotLabel}
          </dd>
        </div>
      </dl>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Regra preservada</h2>
        <ul className="text-sm text-muted-foreground">
          {describeScoringRule(meetup.rule).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Participantes confirmados</h2>
        <ul
          aria-label="Participantes confirmados"
          className="flex flex-col gap-1"
        >
          {meetup.participants.map((person) => (
            <li key={person.username}>{person.username}</li>
          ))}
        </ul>
      </section>

      {meetup.isOrganizer &&
      !meetup.communitySlug &&
      meetup.status === 'scheduled' ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Convidar amigo</h2>
          {friends.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Adicione um amigo antes de convidar.
            </p>
          ) : (
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={(event) => {
                event.preventDefault()
                if (username) onInvite(username)
              }}
            >
              <Label htmlFor="invite-friend" className="sr-only">
                Amigo
              </Label>
              <select
                id="invite-friend"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              >
                {friends.map((friend) => (
                  <option key={friend.username} value={friend.username}>
                    {friend.username}
                  </option>
                ))}
              </select>
              <Button
                type="submit"
                disabled={pending}
                className="w-full sm:w-auto"
              >
                Convidar
              </Button>
            </form>
          )}
          <ul aria-label="Convites" className="flex flex-col gap-2">
            {meetup.invitations.map((invitation) => (
              <li
                key={invitation.id}
                className="flex flex-col gap-2 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <span>
                  {invitation.username} · {invitationLabels[invitation.status]}
                </span>
                {invitation.status === 'pending' ? (
                  <Button
                    variant="secondary"
                    disabled={pending}
                    onClick={() =>
                      confirm(`invite-${invitation.id}`, () =>
                        onCancelInvitation(invitation.id),
                      )
                    }
                  >
                    {confirming === `invite-${invitation.id}`
                      ? 'Confirmar cancelamento'
                      : 'Cancelar convite'}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {meetup.isOrganizer && meetup.status === 'scheduled' ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={pending} onClick={onEdit}>
              Editar encontro
            </Button>
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => confirm('cancel-meetup', onCancelMeetup)}
            >
              {confirming === 'cancel-meetup'
                ? 'Confirmar cancelamento'
                : 'Cancelar encontro'}
            </Button>
          </div>
          {canChangeStructure(meetup.confirmedCount) ? null : (
            <p className="text-sm text-muted-foreground">
              Com outros confirmados, modalidade, regra e horário ficam
              travados.
            </p>
          )}
        </div>
      ) : null}

      {meetup.canModerate &&
      !meetup.isOrganizer &&
      meetup.status === 'scheduled' ? (
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => confirm('cancel-meetup', onCancelMeetup)}
        >
          {confirming === 'cancel-meetup'
            ? 'Confirmar cancelamento'
            : 'Cancelar encontro'}
        </Button>
      ) : null}

      {meetup.communitySlug &&
      meetup.myParticipation === null &&
      meetup.status === 'scheduled' ? (
        meetup.openSpots === 0 ? (
          <p className="text-sm text-muted-foreground">Encontro lotado.</p>
        ) : (
          <Button disabled={pending} onClick={onJoin}>
            Confirmar presença
          </Button>
        )
      ) : null}

      {meetup.myInvitation?.status === 'pending' &&
      meetup.status === 'scheduled' ? (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={pending}
            onClick={() => onRespond(meetup.myInvitation?.id ?? '', 'accept')}
          >
            Aceitar convite
          </Button>
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() =>
              confirm('decline', () =>
                onRespond(meetup.myInvitation?.id ?? '', 'decline'),
              )
            }
          >
            {confirming === 'decline' ? 'Confirmar recusa' : 'Recusar convite'}
          </Button>
        </div>
      ) : null}

      {meetup.myParticipation === 'confirmed' &&
      !meetup.isOrganizer &&
      meetup.status === 'scheduled' ? (
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => confirm('leave', onLeave)}
        >
          {confirming === 'leave' ? 'Confirmar desistência' : 'Desistir'}
        </Button>
      ) : null}
    </div>
  )
}
