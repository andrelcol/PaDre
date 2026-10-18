import { useState } from 'react'
import { useParams } from 'react-router'

import { useSession } from '@/domains/identity/components/session.tsx'
import { useFriendships } from '@/domains/friendships/api/queries.ts'
import {
  useMeetup,
  useMeetupCommand,
  useUpdateMeetup,
} from '@/domains/meetups/api/queries.ts'
import { MeetupDetailView } from '@/domains/meetups/components/meetup-detail.tsx'
import { MeetupForm } from '@/domains/meetups/components/meetup-form.tsx'
import {
  canChangeStructure,
  messageFromMeetupError,
  type MeetupDraft,
  type MeetupFormValues,
} from '@/domains/meetups/model/meetup.ts'
import { wallClockInZone } from '@/domains/meetups/model/schedule.ts'
import { useCatalog } from '@/domains/sports/api/queries.ts'

export function MeetupPage() {
  const { id } = useParams()
  const { session } = useSession()
  const meetup = useMeetup(id)
  const catalog = useCatalog()
  const friends = useFriendships(Boolean(session))
  const update = useUpdateMeetup(id ?? '')
  const command = useMeetupCommand(id)
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const detail = meetup.data
  const pending = update.isPending || command.isPending

  function run(task: () => void) {
    setNotice('')
    setError('')
    task()
  }

  function save(draft: MeetupDraft) {
    if (!detail) return
    const start = wallClockInZone(new Date(detail.startsAt), detail.timeZone)
    const end = wallClockInZone(new Date(detail.endsAt), detail.timeZone)
    const sameSchedule =
      draft.startDate === start.date &&
      draft.startTime === start.time &&
      draft.endDate === end.date &&
      draft.endTime === end.time &&
      draft.timeZone === detail.timeZone
    run(() => {
      update.mutate(
        sameSchedule
          ? { ...draft, startsAt: detail.startsAt, endsAt: detail.endsAt }
          : draft,
        {
          onSuccess: () => {
            setEditing(false)
            setNotice('Encontro atualizado.')
          },
          onError: (caught) => setError(messageFromMeetupError(caught)),
        },
      )
    })
  }

  const initial: MeetupFormValues | null = detail
    ? {
        sportId: detail.sportId,
        sportFormatId: detail.sportFormatId,
        title: detail.title,
        description: detail.description,
        locationName: detail.locationName,
        locationAddress: detail.locationAddress,
        timeZone: detail.timeZone,
        startDate: wallClockInZone(new Date(detail.startsAt), detail.timeZone)
          .date,
        startTime: wallClockInZone(new Date(detail.startsAt), detail.timeZone)
          .time,
        endDate: wallClockInZone(new Date(detail.endsAt), detail.timeZone).date,
        endTime: wallClockInZone(new Date(detail.endsAt), detail.timeZone).time,
        maxParticipants: detail.maxParticipants,
      }
    : null

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      {meetup.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Carregando encontro
        </p>
      ) : null}
      {meetup.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível carregar o encontro.
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {detail && editing && catalog.data && initial ? (
        <MeetupForm
          sports={catalog.data}
          initial={initial}
          structureLocked={!canChangeStructure(detail.confirmedCount)}
          pending={pending}
          submitLabel={update.isPending ? 'Salvando…' : 'Salvar alterações'}
          onSubmit={save}
        />
      ) : null}
      {detail && !editing ? (
        <MeetupDetailView
          meetup={detail}
          friends={(friends.data ?? [])
            .filter((item) => item.side === 'friend')
            .map((item) => ({ username: item.otherUsername }))}
          pending={pending}
          onInvite={(username) =>
            run(() => {
              command.mutate(
                { type: 'invite', username },
                {
                  onSuccess: () => setNotice('Convite enviado.'),
                  onError: (caught) => setError(messageFromMeetupError(caught)),
                },
              )
            })
          }
          onCancelInvitation={(invitationId) =>
            run(() => {
              command.mutate(
                { type: 'cancel-invitation', invitationId },
                {
                  onSuccess: () => setNotice('Convite cancelado.'),
                  onError: (caught) => setError(messageFromMeetupError(caught)),
                },
              )
            })
          }
          onRespond={(invitationId, action) =>
            run(() => {
              command.mutate(
                { type: 'respond', invitationId, action },
                {
                  onSuccess: () =>
                    setNotice(
                      action === 'accept'
                        ? 'Presença confirmada.'
                        : 'Convite recusado.',
                    ),
                  onError: (caught) => setError(messageFromMeetupError(caught)),
                },
              )
            })
          }
          onLeave={() =>
            run(() => {
              command.mutate(
                { type: 'leave' },
                {
                  onSuccess: () => setNotice('Você saiu do encontro.'),
                  onError: (caught) => setError(messageFromMeetupError(caught)),
                },
              )
            })
          }
          onCancelMeetup={() =>
            run(() => {
              command.mutate(
                { type: 'cancel' },
                {
                  onSuccess: () => setNotice('Encontro cancelado.'),
                  onError: (caught) => setError(messageFromMeetupError(caught)),
                },
              )
            })
          }
          onEdit={() => setEditing(true)}
        />
      ) : null}
    </main>
  )
}
