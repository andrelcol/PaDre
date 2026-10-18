import { useState } from 'react'

import {
  useFriendships,
  useRequestFriendship,
  useRespondToFriendship,
} from '@/domains/friendships/api/queries.ts'
import { FriendsView } from '@/domains/friendships/components/friends-view.tsx'
import {
  messageFromFriendshipError,
  type FriendshipAction,
} from '@/domains/friendships/model/friendship.ts'
import { useSession } from '@/domains/identity/components/session.tsx'

const successLabels: Record<FriendshipAction | 'request', string> = {
  request: 'Solicitação enviada.',
  accept: 'Amizade confirmada.',
  reject: 'Solicitação recusada.',
  cancel: 'Solicitação cancelada.',
  remove: 'Amizade removida.',
}

export function FriendsPage() {
  const { session } = useSession()
  const friendships = useFriendships(Boolean(session))
  const request = useRequestFriendship()
  const respond = useRespondToFriendship()
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const pending = request.isPending || respond.isPending

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Amigos</h1>
        <p className="text-muted-foreground">
          Encontre alguém pelo nome de usuário e responda às solicitações.
        </p>
      </header>
      <FriendsView
        status={
          friendships.isPending
            ? 'loading'
            : friendships.isError
              ? 'error'
              : 'ready'
        }
        friendships={friendships.data ?? []}
        notice={notice}
        error={error}
        pending={pending}
        onRequest={(username) => {
          setNotice('')
          setError('')
          request.mutate(username, {
            onSuccess: () => setNotice(successLabels.request),
            onError: (caught) => setError(messageFromFriendshipError(caught)),
          })
        }}
        onAction={(friendshipId, action) => {
          setNotice('')
          setError('')
          respond.mutate(
            { friendshipId, action },
            {
              onSuccess: () => setNotice(successLabels[action]),
              onError: (caught) => setError(messageFromFriendshipError(caught)),
            },
          )
        }}
      />
    </main>
  )
}
