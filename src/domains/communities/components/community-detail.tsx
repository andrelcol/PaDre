import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'

import { CommunityMeetups } from '@/domains/communities/components/community-meetups.tsx'
import { CommunityForm } from '@/domains/communities/components/community-form.tsx'
import {
  canChangeVisibility,
  canEditCommunity,
  canInvite,
  canLeave,
  canRemoveMember,
  canSetMemberRole,
  communityInviteSchema,
  communityRoleLabels,
  communityVisibilityLabels,
  memberCountLabel,
  type CommunityDetail,
  type CommunityDraft,
  type CommunityMember,
  type CommunityRole,
  type CommunitySport,
} from '@/domains/communities/model/community.ts'
import type { CommunityMeetup } from '@/domains/meetups/model/community-meetup.ts'
import { Button } from '@/shared/ui/button.tsx'
import { Input } from '@/shared/ui/input.tsx'
import { Label } from '@/shared/ui/label.tsx'

type CommunityDetailViewProps = {
  community: CommunityDetail
  sports: CommunitySport[]
  currentUserId: string | null
  sessionLoading: boolean
  notice: string
  error: string
  pending: boolean
  onJoin: () => void
  onLeave: () => void
  onInvite: (username: string) => void
  onCancelInvite: (invitationId: string) => void
  onSetRole: (username: string, role: 'admin' | 'member') => void
  onRemove: (username: string) => void
  onUpdate: (draft: CommunityDraft) => void
  meetupsState?: 'hidden' | 'loading' | 'error' | 'ready'
  meetups?: CommunityMeetup[]
  meetupTotal?: number
  onMoreMeetups?: () => void
  chat?: ReactNode
  polls?: ReactNode
}

export function CommunityDetailView({
  community,
  sports,
  currentUserId,
  sessionLoading,
  notice,
  error,
  pending,
  onJoin,
  onLeave,
  onInvite,
  onCancelInvite,
  onSetRole,
  onRemove,
  onUpdate,
  meetupsState = 'hidden',
  meetups = [],
  meetupTotal = 0,
  onMoreMeetups = () => undefined,
  chat = null,
  polls = null,
}: CommunityDetailViewProps) {
  const [confirmingLeave, setConfirmingLeave] = useState(false)
  const [username, setUsername] = useState('')
  const [formError, setFormError] = useState('')
  const role = community.myRole

  function invite(event: FormEvent) {
    event.preventDefault()
    const parsed = communityInviteSchema.safeParse({ username })
    if (!parsed.success) {
      setFormError(
        parsed.error.issues[0]?.message ?? 'Nome de usuário inválido.',
      )
      return
    }
    setFormError('')
    onInvite(parsed.data.username)
    setUsername('')
  }

  function leave() {
    if (!confirmingLeave) {
      setConfirmingLeave(true)
      return
    }
    setConfirmingLeave(false)
    onLeave()
  }

  return (
    <div className="flex flex-col gap-8">
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

      <section className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          {[
            communityVisibilityLabels[community.visibility],
            role ? communityRoleLabels[role] : null,
            memberCountLabel(community.memberCount),
          ]
            .filter((part) => part !== null)
            .join(' · ')}
        </p>
        {community.description ? <p>{community.description}</p> : null}
        <ul aria-label="Modalidades" className="flex flex-wrap gap-2">
          {community.sports.map((sport) => (
            <li
              key={sport.id}
              className="rounded-full border px-2 py-1 text-xs"
            >
              {sport.name}
            </li>
          ))}
        </ul>
        {role === null && !sessionLoading ? (
          community.visibility === 'public' && currentUserId ? (
            <Button
              className="w-full sm:w-auto"
              disabled={pending}
              onClick={onJoin}
            >
              Entrar
            </Button>
          ) : (
            <Link to="/entrar" className="text-sm font-medium underline">
              Entre para participar
            </Link>
          )
        ) : null}
        {canLeave(role) ? (
          <Button
            variant="secondary"
            className="w-full sm:w-auto"
            disabled={pending}
            onClick={leave}
          >
            {confirmingLeave ? 'Confirmar saída' : 'Sair da comunidade'}
          </Button>
        ) : null}
        {role === 'owner' ? (
          <p className="text-sm text-muted-foreground">
            O proprietário permanece na comunidade.
          </p>
        ) : null}
      </section>

      <CommunityMeetups
        slug={community.slug}
        state={meetupsState}
        meetups={meetups}
        total={meetupTotal}
        canPropose={role !== null}
        onMore={onMoreMeetups}
      />

      {polls}
      {chat}

      <section
        className="flex flex-col gap-3"
        aria-labelledby="community-members"
      >
        <h2 id="community-members" className="text-xl font-semibold">
          Integrantes
        </h2>
        {community.members ? (
          <ul className="flex flex-col gap-3">
            {community.members.map((member) => (
              <MemberRow
                key={member.userId}
                member={member}
                actorRole={role}
                currentUserId={currentUserId}
                pending={pending}
                onSetRole={onSetRole}
                onRemove={onRemove}
              />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            A lista de integrantes aparece para quem participa.
          </p>
        )}
      </section>

      {canInvite(role) ? (
        <section
          className="flex flex-col gap-3"
          aria-labelledby="community-invite"
        >
          <h2 id="community-invite" className="text-xl font-semibold">
            Convidar
          </h2>
          <form onSubmit={invite} className="flex flex-col gap-3">
            <Label htmlFor="community-invite-username">Nome de usuário</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="community-invite-username"
                value={username}
                autoComplete="off"
                disabled={pending}
                onChange={(event) => setUsername(event.target.value)}
              />
              <Button
                type="submit"
                disabled={pending}
                className="w-full sm:w-auto"
              >
                Convidar
              </Button>
            </div>
            {formError ? (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            ) : null}
          </form>
          {community.invitations && community.invitations.length > 0 ? (
            <ul aria-label="Convites pendentes" className="flex flex-col gap-2">
              {community.invitations.map((invitation) => (
                <li
                  key={invitation.id}
                  className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="text-sm">{invitation.username}</span>
                  <Button
                    variant="secondary"
                    className="w-full sm:w-auto"
                    disabled={pending}
                    onClick={() => onCancelInvite(invitation.id)}
                  >
                    Cancelar convite
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {canEditCommunity(role) && sports.length > 0 ? (
        <section
          className="flex flex-col gap-3"
          aria-labelledby="community-edit"
        >
          <h2 id="community-edit" className="text-xl font-semibold">
            Editar comunidade
          </h2>
          <CommunityForm
            key={community.slug}
            sports={sports}
            visibilityLocked={!canChangeVisibility(role)}
            pending={pending}
            submitLabel={pending ? 'Salvando…' : 'Salvar alterações'}
            initial={{
              name: community.name,
              description: community.description,
              visibility: community.visibility,
              sportIds: community.sports.map((sport) => sport.id),
            }}
            onSubmit={onUpdate}
          />
        </section>
      ) : null}
    </div>
  )
}

function MemberRow({
  member,
  actorRole,
  currentUserId,
  pending,
  onSetRole,
  onRemove,
}: {
  member: CommunityMember
  actorRole: CommunityRole | null
  currentUserId: string | null
  pending: boolean
  onSetRole: (username: string, role: 'admin' | 'member') => void
  onRemove: (username: string) => void
}) {
  const [confirming, setConfirming] = useState(false)
  const mine = member.userId === currentUserId
  const showRole =
    canSetMemberRole(actorRole) && !mine && member.role !== 'owner'
  const showRemove = canRemoveMember(actorRole, member.role) && !mine

  function remove() {
    if (!confirming) {
      setConfirming(true)
      return
    }
    setConfirming(false)
    onRemove(member.username)
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col">
        <span className="font-medium">{member.username}</span>
        <span className="text-sm text-muted-foreground">
          {communityRoleLabels[member.role]}
        </span>
      </div>
      {showRole || showRemove ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          {showRole && member.role === 'member' ? (
            <Button
              variant="secondary"
              className="w-full sm:w-auto"
              disabled={pending}
              onClick={() => onSetRole(member.username, 'admin')}
            >
              {`Promover ${member.username}`}
            </Button>
          ) : null}
          {showRole && member.role === 'admin' ? (
            <Button
              variant="secondary"
              className="w-full sm:w-auto"
              disabled={pending}
              onClick={() => onSetRole(member.username, 'member')}
            >
              {`Rebaixar ${member.username}`}
            </Button>
          ) : null}
          {showRemove ? (
            <Button
              variant="secondary"
              className="w-full sm:w-auto"
              disabled={pending}
              onClick={remove}
            >
              {confirming
                ? `Confirmar remoção de ${member.username}`
                : `Remover ${member.username}`}
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}
