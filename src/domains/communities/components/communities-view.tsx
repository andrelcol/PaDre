import { useState } from 'react'
import { Link } from 'react-router'

import {
  communityRoleLabels,
  communityVisibilityLabels,
  memberCountLabel,
  type CommunityInvite,
  type CommunitySummary,
  type MyCommunity,
} from '@/domains/communities/model/community.ts'
import { Button } from '@/shared/ui/button.tsx'

type SectionStatus = 'loading' | 'error' | 'ready' | 'signed-out'

type CommunitiesViewProps = {
  signedIn: boolean
  publicStatus: 'loading' | 'error' | 'ready'
  mineStatus: SectionStatus
  inviteStatus: SectionStatus
  discovered: CommunitySummary[]
  mine: MyCommunity[]
  invitations: CommunityInvite[]
  notice: string
  error: string
  pending: boolean
  onAccept: (invitationId: string) => void
  onDecline: (invitationId: string) => void
}

export function CommunitiesView({
  signedIn,
  publicStatus,
  mineStatus,
  inviteStatus,
  discovered,
  mine,
  invitations,
  notice,
  error,
  pending,
  onAccept,
  onDecline,
}: CommunitiesViewProps) {
  const [confirming, setConfirming] = useState<string | null>(null)

  function decline(invitationId: string) {
    if (confirming === invitationId) {
      setConfirming(null)
      onDecline(invitationId)
      return
    }
    setConfirming(invitationId)
  }

  return (
    <div className="flex flex-col gap-10">
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
      {signedIn ? (
        <Link to="/comunidades/nova" className="text-sm font-medium underline">
          Nova comunidade
        </Link>
      ) : null}

      <section className="flex flex-col gap-3" aria-labelledby="my-communities">
        <h2 id="my-communities" className="text-xl font-semibold">
          Minhas comunidades
        </h2>
        <SectionStatusMessage
          status={mineStatus}
          loading="Carregando suas comunidades"
          error="Não foi possível carregar suas comunidades."
          signedOut="Entre para ver as comunidades de que você participa."
          empty="Você ainda não participa de uma comunidade."
          count={mine.length}
        />
        {mineStatus === 'ready' && mine.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {mine.map((community) => (
              <li key={community.slug}>
                <CommunityCard community={community} role={community.role} />
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section
        className="flex flex-col gap-3"
        aria-labelledby="community-invites"
      >
        <h2 id="community-invites" className="text-xl font-semibold">
          Convites recebidos
        </h2>
        <SectionStatusMessage
          status={inviteStatus}
          loading="Carregando convites"
          error="Não foi possível carregar os convites."
          signedOut="Entre para responder aos convites."
          empty="Nenhum convite pendente."
          count={invitations.length}
        />
        {inviteStatus === 'ready' && invitations.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {invitations.map((invitation) => (
              <li
                key={invitation.id}
                className="flex flex-col gap-3 rounded-lg border p-4"
              >
                <div className="flex flex-col gap-1">
                  <h3 className="font-medium">{invitation.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {communityVisibilityLabels[invitation.visibility]}
                  </p>
                  {invitation.description ? (
                    <p className="text-sm">{invitation.description}</p>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    className="w-full sm:w-auto"
                    disabled={pending}
                    onClick={() => onAccept(invitation.id)}
                  >
                    Aceitar
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-full sm:w-auto"
                    disabled={pending}
                    onClick={() => decline(invitation.id)}
                  >
                    {confirming === invitation.id
                      ? 'Confirmar recusa'
                      : 'Recusar'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section
        className="flex flex-col gap-3"
        aria-labelledby="discover-communities"
      >
        <h2 id="discover-communities" className="text-xl font-semibold">
          Descobrir
        </h2>
        <SectionStatusMessage
          status={publicStatus}
          loading="Carregando comunidades públicas"
          error="Não foi possível carregar as comunidades públicas."
          signedOut=""
          empty="Nenhuma comunidade pública por aqui."
          count={discovered.length}
        />
        {publicStatus === 'ready' && discovered.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {discovered.map((community) => (
              <li key={community.slug}>
                <CommunityCard community={community} />
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  )
}

function SectionStatusMessage({
  status,
  loading,
  error,
  signedOut,
  empty,
  count,
}: {
  status: SectionStatus
  loading: string
  error: string
  signedOut: string
  empty: string
  count: number
}) {
  if (status === 'loading') {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {loading}
      </p>
    )
  }
  if (status === 'error') {
    return (
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
    )
  }
  if (status === 'signed-out') {
    return <p className="text-sm text-muted-foreground">{signedOut}</p>
  }
  if (count === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>
  }
  return null
}

function CommunityCard({
  community,
  role,
}: {
  community: CommunitySummary
  role?: MyCommunity['role']
}) {
  return (
    <article className="flex flex-col gap-2 rounded-lg border p-4">
      <div className="flex flex-col gap-1">
        <Link
          to={`/comunidades/${community.slug}`}
          className="text-base font-medium underline"
        >
          {community.name}
        </Link>
        <p className="text-sm text-muted-foreground">
          {[
            communityVisibilityLabels[community.visibility],
            role ? communityRoleLabels[role] : null,
            memberCountLabel(community.memberCount),
          ]
            .filter((part) => part !== null)
            .join(' · ')}
        </p>
      </div>
      {community.description ? (
        <p className="text-sm">{community.description}</p>
      ) : null}
      <ul
        aria-label={`Modalidades de ${community.name}`}
        className="flex flex-wrap gap-2"
      >
        {community.sports.map((sport) => (
          <li key={sport.id} className="rounded-full border px-2 py-1 text-xs">
            {sport.name}
          </li>
        ))}
      </ul>
    </article>
  )
}
