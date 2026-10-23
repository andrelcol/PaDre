import { useState } from 'react'

import {
  useMyCommunities,
  useMyCommunityInvitations,
  usePublicCommunities,
  useRespondToCommunityInvitation,
} from '@/domains/communities/api/queries.ts'
import { CommunitiesView } from '@/domains/communities/components/communities-view.tsx'
import { messageFromCommunityError } from '@/domains/communities/model/community.ts'
import { useSession } from '@/domains/identity/components/session.tsx'

export function CommunitiesPage() {
  const { session, loading } = useSession()
  const signedIn = Boolean(session)
  const discovered = usePublicCommunities()
  const mine = useMyCommunities(signedIn)
  const invitations = useMyCommunityInvitations(signedIn)
  const respond = useRespondToCommunityInvitation()
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const sectionStatus = (query: {
    isPending: boolean
    isError: boolean
  }): 'loading' | 'error' | 'ready' | 'signed-out' => {
    if (!signedIn) return loading ? 'loading' : 'signed-out'
    if (query.isPending) return 'loading'
    if (query.isError) return 'error'
    return 'ready'
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Comunidades</h1>
        <p className="text-muted-foreground">
          Grupos públicos podem ser encontrados. Grupos privados pedem convite.
        </p>
      </header>
      <CommunitiesView
        signedIn={signedIn}
        publicStatus={
          discovered.isPending
            ? 'loading'
            : discovered.isError
              ? 'error'
              : 'ready'
        }
        mineStatus={sectionStatus(mine)}
        inviteStatus={sectionStatus(invitations)}
        discovered={discovered.data ?? []}
        mine={mine.data ?? []}
        invitations={invitations.data ?? []}
        notice={notice}
        error={error}
        pending={respond.isPending}
        onAccept={(invitationId) => {
          setNotice('')
          setError('')
          respond.mutate(
            { invitationId, action: 'accept' },
            {
              onSuccess: () => setNotice('Convite aceito.'),
              onError: (caught) => setError(messageFromCommunityError(caught)),
            },
          )
        }}
        onDecline={(invitationId) => {
          setNotice('')
          setError('')
          respond.mutate(
            { invitationId, action: 'decline' },
            {
              onSuccess: () => setNotice('Convite recusado.'),
              onError: (caught) => setError(messageFromCommunityError(caught)),
            },
          )
        }}
      />
    </main>
  )
}
