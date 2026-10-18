import { useState } from 'react'
import { useParams } from 'react-router'

import { useSession } from '@/domains/identity/components/session.tsx'
import { useFriendships } from '@/domains/friendships/api/queries.ts'
import {
  useCreateMeetupInviteLink,
  useMeetup,
  useMeetupCommand,
  useMeetupInviteLink,
  useRevokeMeetupInviteLink,
  useUpdateMeetup,
} from '@/domains/meetups/api/queries.ts'
import { MeetupDetailView } from '@/domains/meetups/components/meetup-detail.tsx'
import { MeetupInviteLinkPanel } from '@/domains/meetups/components/meetup-invite-link.tsx'
import { inviteShareUrl } from '@/domains/meetups/model/invite-link.ts'
import { MeetupForm } from '@/domains/meetups/components/meetup-form.tsx'
import {
  canChangeStructure,
  messageFromMeetupError,
  type MeetupDraft,
  type MeetupFormValues,
} from '@/domains/meetups/model/meetup.ts'
import { wallClockInZone } from '@/domains/meetups/model/schedule.ts'
import { MatchSection } from '@/domains/matches/components/match-section.tsx'
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
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [shareExpiry, setShareExpiry] = useState<string | null>(null)
  const [linkNotice, setLinkNotice] = useState('')
  const [linkError, setLinkError] = useState('')
  const organizer =
    Boolean(meetup.data?.isOrganizer) && meetup.data?.status === 'scheduled'
  const inviteLink = useMeetupInviteLink(id, organizer && !editing)
  const createLink = useCreateMeetupInviteLink(id ?? '')
  const revokeLink = useRevokeMeetupInviteLink(id ?? '')

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
      {detail && !editing ? (
        <MatchSection
          meetupId={detail.id}
          organizer={detail.isOrganizer}
          meetupStatus={detail.status}
          playersPerSideMin={
            catalog.data
              ?.flatMap((sport) => sport.formats)
              .find((format) => format.id === detail.sportFormatId)
              ?.playersPerSideMin ?? null
          }
          playersPerSideMax={
            catalog.data
              ?.flatMap((sport) => sport.formats)
              .find((format) => format.id === detail.sportFormatId)
              ?.playersPerSideMax ?? null
          }
        />
      ) : null}
      {detail && !editing && organizer ? (
        <MeetupInviteLinkPanel
          link={inviteLink.data}
          loading={inviteLink.isPending}
          shareUrl={shareUrl}
          expiresAt={shareExpiry}
          timeZone={detail.timeZone}
          pending={createLink.isPending || revokeLink.isPending}
          notice={linkNotice}
          error={linkError}
          onCreate={() => {
            setLinkNotice('')
            setLinkError('')
            createLink.mutate(undefined, {
              onSuccess: (issued) => {
                const url = inviteShareUrl(window.location.origin, issued.token)
                setShareUrl(url)
                setShareExpiry(issued.expires_at)
                setLinkNotice(
                  'Link gerado. Copie agora; ele não poderá ser recuperado depois.',
                )
              },
              onError: (caught) => setLinkError(messageFromMeetupError(caught)),
            })
          }}
          onRevoke={() => {
            setLinkNotice('')
            setLinkError('')
            revokeLink.mutate(undefined, {
              onSuccess: () => {
                setShareUrl(null)
                setShareExpiry(null)
                setLinkNotice(
                  'Link revogado. Quem já entrou continua no encontro.',
                )
              },
              onError: (caught) => setLinkError(messageFromMeetupError(caught)),
            })
          }}
          onCopy={() => {
            if (!shareUrl) return
            void navigator.clipboard.writeText(shareUrl).then(
              () => setLinkNotice('Link copiado.'),
              () =>
                setLinkError(
                  'Não foi possível copiar. Selecione o link e copie manualmente.',
                ),
            )
          }}
        />
      ) : null}
    </main>
  )
}
