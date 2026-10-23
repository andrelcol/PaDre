import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router'

import {
  useCancelCommunityInvitation,
  useCommunity,
  useInviteToCommunity,
  useJoinPublicCommunity,
  useLeaveCommunity,
  useRemoveCommunityMember,
  useSetCommunityMemberRole,
  useSetCommunitySports,
  useUpdateCommunity,
} from '@/domains/communities/api/queries.ts'
import { CommunityDetailView } from '@/domains/communities/components/community-detail.tsx'
import {
  messageFromCommunityError,
  type CommunityDraft,
} from '@/domains/communities/model/community.ts'
import { useSession } from '@/domains/identity/components/session.tsx'
import { CommunityCards } from '@/domains/cards/components/community-cards.tsx'
import { CommunityChat } from '@/domains/chat/components/community-chat.tsx'
import { CommunityPolls } from '@/domains/polls/components/community-polls.tsx'
import { CommunityVenues } from '@/domains/venues/components/community-venues.tsx'
import { useCommunityMeetups } from '@/domains/meetups/api/queries.ts'
import { useCatalog } from '@/domains/sports/api/queries.ts'

export function CommunityPage() {
  const { slug = '' } = useParams()
  const [params] = useSearchParams()
  const { session, loading } = useSession()
  const community = useCommunity(slug)
  const catalog = useCatalog()
  const join = useJoinPublicCommunity()
  const leave = useLeaveCommunity()
  const invite = useInviteToCommunity(slug)
  const cancel = useCancelCommunityInvitation()
  const setRole = useSetCommunityMemberRole(slug)
  const remove = useRemoveCommunityMember(slug)
  const update = useUpdateCommunity(slug)
  const setSports = useSetCommunitySports(slug)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [meetupLimit, setMeetupLimit] = useState(20)
  const meetups = useCommunityMeetups(
    slug,
    Boolean(community.data?.myRole),
    meetupLimit,
  )
  const pending =
    join.isPending ||
    leave.isPending ||
    invite.isPending ||
    cancel.isPending ||
    setRole.isPending ||
    remove.isPending ||
    update.isPending ||
    setSports.isPending

  function fail(caught: unknown) {
    setNotice('')
    setError(messageFromCommunityError(caught))
  }

  async function save(draft: CommunityDraft) {
    setNotice('')
    setError('')
    try {
      await update.mutateAsync(draft)
      await setSports.mutateAsync(draft.sportIds)
      setNotice('Comunidade atualizada.')
    } catch (caught) {
      fail(caught)
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      {community.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Carregando comunidade
        </p>
      ) : null}
      {community.isError ? (
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">Comunidade</h1>
          <p role="alert" className="text-sm text-destructive">
            {messageFromCommunityError(community.error)}
          </p>
        </header>
      ) : null}
      {community.data ? (
        <>
          <header className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">
              {community.data.name}
            </h1>
          </header>
          <CommunityDetailView
            community={community.data}
            initialTab={params.get('mapa') ? 'locais' : undefined}
            sports={
              catalog.data?.map((sport) => ({
                id: sport.id,
                name: sport.name,
              })) ?? []
            }
            currentUserId={session?.user.id ?? null}
            sessionLoading={loading}
            notice={notice}
            error={error}
            pending={pending}
            onJoin={() => {
              setNotice('')
              setError('')
              join.mutate(slug, {
                onSuccess: () => setNotice('Você entrou na comunidade.'),
                onError: fail,
              })
            }}
            onLeave={() => {
              setNotice('')
              setError('')
              leave.mutate(slug, {
                onSuccess: () => setNotice('Você saiu da comunidade.'),
                onError: fail,
              })
            }}
            onInvite={(username) => {
              setNotice('')
              setError('')
              invite.mutate(username, {
                onSuccess: () => setNotice('Convite enviado.'),
                onError: fail,
              })
            }}
            onCancelInvite={(invitationId) => {
              setNotice('')
              setError('')
              cancel.mutate(invitationId, {
                onSuccess: () => setNotice('Convite cancelado.'),
                onError: fail,
              })
            }}
            onSetRole={(username, role) => {
              setNotice('')
              setError('')
              setRole.mutate(
                { username, role },
                {
                  onSuccess: () =>
                    setNotice(
                      role === 'admin'
                        ? 'Administrador promovido.'
                        : 'Administrador rebaixado.',
                    ),
                  onError: fail,
                },
              )
            }}
            onRemove={(username) => {
              setNotice('')
              setError('')
              remove.mutate(username, {
                onSuccess: () => setNotice('Integrante removido.'),
                onError: fail,
              })
            }}
            onUpdate={(draft) => void save(draft)}
            meetupsState={
              community.data.myRole
                ? meetups.isPending
                  ? 'loading'
                  : meetups.isError
                    ? 'error'
                    : 'ready'
                : 'hidden'
            }
            meetups={meetups.data?.meetups ?? []}
            meetupTotal={meetups.data?.total ?? 0}
            onMoreMeetups={() =>
              setMeetupLimit((current) => Math.min(current + 20, 50))
            }
            venues={
              community.data.myRole ? (
                <CommunityVenues
                  slug={slug}
                  canManage={
                    community.data.myRole === 'owner' ||
                    community.data.myRole === 'admin'
                  }
                />
              ) : null
            }
            polls={
              community.data.myRole ? (
                <CommunityPolls slug={slug} sports={community.data.sports} />
              ) : null
            }
            cards={
              community.data.myRole ? (
                <CommunityCards
                  slug={slug}
                  canConfigure={
                    community.data.myRole === 'owner' ||
                    community.data.myRole === 'admin'
                  }
                />
              ) : null
            }
            chat={
              community.data.myRole ? (
                <CommunityChat
                  slug={slug}
                  meetups={meetups.data?.meetups ?? []}
                />
              ) : null
            }
          />
        </>
      ) : null}
    </main>
  )
}
