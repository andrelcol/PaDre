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
  useSetMeetupPlace,
  useUpdateMeetup,
} from '@/domains/meetups/api/queries.ts'
import { MeetupDetailView } from '@/domains/meetups/components/meetup-detail.tsx'
import { MeetupInviteLinkPanel } from '@/domains/meetups/components/meetup-invite-link.tsx'
import { inviteShareUrl } from '@/domains/meetups/model/invite-link.ts'
import { MeetupForm } from '@/domains/meetups/components/meetup-form.tsx'
import {
  canChangeStructure,
  meetupLoadError,
  meetupPlaceChanged,
  messageFromMeetupError,
  type MeetupDraft,
  type MeetupFormValues,
} from '@/domains/meetups/model/meetup.ts'
import { useCommunity } from '@/domains/communities/api/queries.ts'
import { wallClockInZone } from '@/domains/meetups/model/schedule.ts'
import { MatchSection } from '@/domains/matches/components/match-section.tsx'
import { readPublicWebOrigin } from '@/shared/lib/env.ts'
import { MeetupPerformance } from '@/domains/statistics/components/meetup-performance.tsx'
import { MeetupRelationships } from '@/domains/statistics/components/meetup-relationships.tsx'
import { useCatalog } from '@/domains/sports/api/queries.ts'
import {
  useCommunityVenues,
  useMyVenues,
} from '@/domains/venues/api/queries.ts'

export function MeetupPage() {
  const { id } = useParams()
  const { session } = useSession()
  const meetup = useMeetup(id)
  const catalog = useCatalog()
  const friends = useFriendships(Boolean(session))
  const update = useUpdateMeetup(id ?? '')
  const setPlace = useSetMeetupPlace(id ?? '')
  const personalVenues = useMyVenues(
    Boolean(meetup.data && !meetup.data.communitySlug),
  )
  const communityVenues = useCommunityVenues(
    meetup.data?.communitySlug ?? '',
    Boolean(meetup.data?.communitySlug),
  )
  const command = useMeetupCommand(id)
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [shareExpiry, setShareExpiry] = useState<string | null>(null)
  const [linkNotice, setLinkNotice] = useState('')
  const [linkError, setLinkError] = useState('')
  const organizer =
    Boolean(meetup.data?.isOrganizer) &&
    meetup.data?.status === 'scheduled' &&
    !meetup.data.communitySlug
  const origin = useCommunity(meetup.data?.communitySlug ?? '')
  const inviteLink = useMeetupInviteLink(id, organizer && !editing)
  const createLink = useCreateMeetupInviteLink(id ?? '')
  const revokeLink = useRevokeMeetupInviteLink(id ?? '')

  const detail = meetup.data
  const pending = update.isPending || setPlace.isPending || command.isPending
  const venueChoices = (
    detail?.communitySlug ? communityVenues.data : personalVenues.data
  )
    ?.filter((venue) => venue.status === 'active')
    .map((venue) => ({
      id: venue.id,
      name: venue.name,
      address: venue.address,
      details: venue.details,
      latitude: venue.latitude,
      longitude: venue.longitude,
    }))

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
    const payload = sameSchedule
      ? { ...draft, startsAt: detail.startsAt, endsAt: detail.endsAt }
      : draft
    run(() => {
      update.mutate(payload, {
        onSuccess: () => {
          if (!meetupPlaceChanged(detail, draft)) {
            setEditing(false)
            setNotice('Encontro atualizado.')
            return
          }
          setPlace.mutate(draft, {
            onSuccess: () => {
              setEditing(false)
              setNotice('Encontro atualizado.')
            },
            onError: (caught) => setError(messageFromMeetupError(caught)),
          })
        },
        onError: (caught) => setError(messageFromMeetupError(caught)),
      })
    })
  }

  const initial: MeetupFormValues | null = detail
    ? {
        sportId: detail.sportId,
        sportFormatId: detail.sportFormatId,
        title: detail.title,
        description: detail.description,
        placeMode: detail.venueId ? 'venue' : 'manual',
        venueId: detail.venueId ?? '',
        locationName: detail.locationName,
        locationAddress: detail.locationAddress,
        locationDetails: detail.locationDetails,
        locationLatitude: detail.locationLatitude,
        locationLongitude: detail.locationLongitude,
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
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      {meetup.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Carregando encontro
        </p>
      ) : null}
      {meetup.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {meetupLoadError(meetup.error)}
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
          venues={venueChoices ?? []}
          sports={
            detail.communitySlug
              ? catalog.data.filter((sport) =>
                  origin.data
                    ? origin.data.sports.some((item) => item.id === sport.id)
                    : sport.id === detail.sportId,
                )
              : catalog.data
          }
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
          onJoin={() =>
            run(() => {
              command.mutate(
                { type: 'join' },
                {
                  onSuccess: () => setNotice('Presença confirmada.'),
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
      {detail &&
      !editing &&
      (detail.isOrganizer || detail.myParticipation === 'confirmed') ? (
        <>
          <MeetupPerformance meetupId={detail.id} />
          <MeetupRelationships meetupId={detail.id} />
        </>
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
                const url = inviteShareUrl(readPublicWebOrigin(), issued.token)
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
