import { useState, type FormEvent } from 'react'

import {
  availableActions,
  friendshipRequestSchema,
  type Friendship,
  type FriendshipAction,
} from '@/domains/friendships/model/friendship.ts'
import { Button } from '@/shared/ui/button.tsx'
import { Input } from '@/shared/ui/input.tsx'
import { Label } from '@/shared/ui/label.tsx'

const actionLabels: Record<FriendshipAction, string> = {
  accept: 'Aceitar',
  reject: 'Recusar',
  cancel: 'Cancelar solicitação',
  remove: 'Remover amizade',
}

const confirmLabels: Record<FriendshipAction, string> = {
  accept: 'Aceitar',
  reject: 'Confirmar recusa',
  cancel: 'Confirmar cancelamento',
  remove: 'Confirmar remoção',
}

type FriendsViewProps = {
  status: 'loading' | 'error' | 'ready'
  friendships: Friendship[]
  notice: string
  error: string
  pending: boolean
  onRequest: (username: string) => void
  onAction: (friendshipId: string, action: FriendshipAction) => void
}

export function FriendsView({
  status,
  friendships,
  notice,
  error,
  pending,
  onRequest,
  onAction,
}: FriendsViewProps) {
  const [username, setUsername] = useState('')
  const [formError, setFormError] = useState('')
  const [confirming, setConfirming] = useState<{
    id: string
    action: FriendshipAction
  } | null>(null)

  const incoming = friendships.filter((item) => item.side === 'incoming')
  const outgoing = friendships.filter((item) => item.side === 'outgoing')
  const friends = friendships.filter((item) => item.side === 'friend')

  function submit(event: FormEvent) {
    event.preventDefault()
    const parsed = friendshipRequestSchema.safeParse({ username })
    if (!parsed.success) {
      setFormError(
        parsed.error.issues[0]?.message ?? 'Nome de usuário inválido.',
      )
      return
    }
    setFormError('')
    onRequest(parsed.data.username)
    setUsername('')
  }

  function runAction(friendshipId: string, action: FriendshipAction) {
    if (action === 'accept') {
      onAction(friendshipId, action)
      return
    }
    if (confirming?.id === friendshipId && confirming.action === action) {
      setConfirming(null)
      onAction(friendshipId, action)
      return
    }
    setConfirming({ id: friendshipId, action })
  }

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Label htmlFor="friend-username">Nome de usuário</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="friend-username"
            value={username}
            autoComplete="off"
            onChange={(event) => setUsername(event.target.value)}
          />
          <Button type="submit" disabled={pending} className="w-full sm:w-auto">
            Enviar solicitação
          </Button>
        </div>
        {formError ? (
          <p role="alert" className="text-sm text-destructive">
            {formError}
          </p>
        ) : null}
      </form>

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

      {status === 'loading' ? (
        <p role="status" className="text-sm text-muted-foreground">
          Carregando amizades
        </p>
      ) : null}
      {status === 'error' ? (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível carregar as amizades.
        </p>
      ) : null}

      {status === 'ready' ? (
        <>
          <FriendshipSection
            title="Solicitações recebidas"
            empty="Nenhuma solicitação recebida."
            items={incoming}
            pending={pending}
            confirming={confirming}
            onAction={runAction}
            onDismiss={() => setConfirming(null)}
          />
          <FriendshipSection
            title="Solicitações enviadas"
            empty="Nenhuma solicitação enviada."
            items={outgoing}
            pending={pending}
            confirming={confirming}
            onAction={runAction}
            onDismiss={() => setConfirming(null)}
          />
          <FriendshipSection
            title="Meus amigos"
            empty="Você ainda não tem amigos confirmados."
            items={friends}
            pending={pending}
            confirming={confirming}
            onAction={runAction}
            onDismiss={() => setConfirming(null)}
          />
        </>
      ) : null}
    </div>
  )
}

function FriendshipSection({
  title,
  empty,
  items,
  pending,
  confirming,
  onAction,
  onDismiss,
}: {
  title: string
  empty: string
  items: Friendship[]
  pending: boolean
  confirming: { id: string; action: FriendshipAction } | null
  onAction: (friendshipId: string, action: FriendshipAction) => void
  onDismiss: () => void
}) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby={title}>
      <h2 id={title} className="text-lg font-semibold">
        {title}
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul aria-label={title} className="flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="flex items-center gap-3 font-medium">
                <span
                  aria-hidden="true"
                  className="inline-flex size-11 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
                >
                  {item.otherUsername.slice(0, 1).toUpperCase()}
                </span>
                {item.otherUsername}
              </span>
              <div className="flex flex-wrap gap-2">
                {availableActions(item).map((action) => {
                  const armed =
                    confirming?.id === item.id && confirming.action === action
                  return (
                    <Button
                      key={action}
                      variant={action === 'accept' ? 'primary' : 'secondary'}
                      disabled={pending}
                      onClick={() => onAction(item.id, action)}
                    >
                      {armed ? confirmLabels[action] : actionLabels[action]}
                    </Button>
                  )
                })}
                {confirming?.id === item.id ? (
                  <Button variant="ghost" onClick={onDismiss}>
                    Manter
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
