import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { listCommunityMessages } from '@/domains/chat/api/messages.ts'
import {
  communityMessageKey,
  useCommunityMessages,
  useDeleteCommunityMessage,
  useSendCommunityMessage,
} from '@/domains/chat/api/queries.ts'
import { CommunityMessageRow } from '@/domains/chat/components/community-message.tsx'
import {
  isChatAuthorizationError,
  mergeCommunityMessages,
  messageFromChatError,
  type CommunityMessage,
} from '@/domains/chat/model/message.ts'
import type { CommunityMeetup } from '@/domains/meetups/model/community-meetup.ts'
import { Button } from '@/shared/ui/button.tsx'
import { Label } from '@/shared/ui/label.tsx'

type CommunityChatProps = {
  slug: string
  meetups: CommunityMeetup[]
}

export function CommunityChat({ slug, meetups }: CommunityChatProps) {
  const queryClient = useQueryClient()
  const latest = useCommunityMessages(slug, true)
  const send = useSendCommunityMessage(slug)
  const remove = useDeleteCommunityMessage(slug)
  const [older, setOlder] = useState<CommunityMessage[]>([])
  const [olderHasMore, setOlderHasMore] = useState(false)
  const [loadedOlder, setLoadedOlder] = useState(false)
  const [body, setBody] = useState('')
  const [meetupId, setMeetupId] = useState('')
  const [error, setError] = useState('')
  const [loadingOlder, setLoadingOlder] = useState(false)
  const requestId = useRef(crypto.randomUUID())
  const listRef = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  const seen = useRef(false)
  const authorizationLost = isChatAuthorizationError(latest.error)
  const newest = authorizationLost ? [] : (latest.data?.messages ?? [])
  const messages = mergeCommunityMessages([...older, ...newest])
  const pending = send.isPending || remove.isPending || loadingOlder
  const hasOlder = loadedOlder ? olderHasMore : (latest.data?.hasOlder ?? false)

  useEffect(() => {
    return () => {
      queryClient.removeQueries({ queryKey: communityMessageKey(slug) })
    }
  }, [queryClient, slug])

  useEffect(() => {
    const list = listRef.current
    if (!list || messages.length === 0) return
    if (!seen.current || pinned.current) {
      list.scrollTop = list.scrollHeight
      seen.current = true
    }
  }, [messages])

  function onScroll() {
    const list = listRef.current
    if (!list) return
    pinned.current = list.scrollHeight - list.scrollTop - list.clientHeight < 48
  }

  async function loadOlder() {
    const oldest = messages[0]
    if (!oldest || loadingOlder) return
    const list = listRef.current
    const previousHeight = list?.scrollHeight ?? 0
    setLoadingOlder(true)
    setError('')
    try {
      const page = await queryClient.fetchQuery({
        queryKey: [
          ...communityMessageKey(slug),
          'before',
          oldest.createdAt,
          oldest.id,
        ],
        queryFn: () =>
          listCommunityMessages(slug, oldest.createdAt, oldest.id, 50),
      })
      pinned.current = false
      setOlder((current) =>
        mergeCommunityMessages([...page.messages, ...current]),
      )
      setLoadedOlder(true)
      setOlderHasMore(page.hasOlder)
      requestAnimationFrame(() => {
        if (!list) return
        list.scrollTop = list.scrollHeight - previousHeight
      })
    } catch (caught) {
      if (isChatAuthorizationError(caught)) {
        queryClient.removeQueries({ queryKey: communityMessageKey(slug) })
        setOlder([])
      }
      setError(messageFromChatError(caught))
    } finally {
      setLoadingOlder(false)
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      await send.mutateAsync({
        slug,
        body,
        meetupId: meetupId || null,
        clientRequestId: requestId.current,
      })
      requestId.current = crypto.randomUUID()
      setBody('')
      setMeetupId('')
      pinned.current = true
    } catch (caught) {
      setError(messageFromChatError(caught))
    }
  }

  async function onDelete(messageId: string) {
    setError('')
    try {
      await remove.mutateAsync(messageId)
      setOlder((current) =>
        current.map((message) =>
          message.id === messageId
            ? {
                ...message,
                deleted: true,
                body: '',
                meetup: null,
                canModerate: false,
              }
            : message,
        ),
      )
    } catch (caught) {
      if (isChatAuthorizationError(caught)) {
        queryClient.removeQueries({ queryKey: communityMessageKey(slug) })
        setOlder([])
      }
      setError(messageFromChatError(caught))
    }
  }

  const shownError =
    error || (latest.isError ? messageFromChatError(latest.error) : '')

  return (
    <section className="flex flex-col gap-3" aria-labelledby="community-chat">
      <div className="flex items-center justify-between gap-3">
        <h2 id="community-chat" className="text-xl font-semibold">
          Chat
        </h2>
        <Button
          type="button"
          variant="secondary"
          disabled={latest.isFetching}
          onClick={() => void latest.refetch()}
        >
          Atualizar
        </Button>
      </div>
      {latest.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Carregando mensagens
        </p>
      ) : null}
      {shownError ? (
        <p role="alert" className="text-sm text-destructive">
          {shownError}
        </p>
      ) : null}
      {!authorizationLost && !latest.isPending && messages.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma mensagem ainda.</p>
      ) : null}
      {messages.length > 0 ? (
        <div
          ref={listRef}
          onScroll={onScroll}
          className="flex max-h-80 flex-col overflow-y-auto rounded-md border px-3"
        >
          {hasOlder ? (
            <Button
              type="button"
              variant="secondary"
              className="my-3"
              disabled={pending}
              onClick={() => void loadOlder()}
            >
              Mensagens anteriores
            </Button>
          ) : null}
          {messages.map((message) => (
            <CommunityMessageRow
              key={message.id}
              message={message}
              pending={pending}
              onDelete={(messageId) => void onDelete(messageId)}
            />
          ))}
        </div>
      ) : null}
      <form
        className="sticky bottom-[var(--padre-overlay-bottom)] z-10 flex flex-col gap-3 border-t border-border bg-background py-3 md:bottom-0"
        onSubmit={(event) => void submit(event)}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="community-message">Mensagem</Label>
          <textarea
            id="community-message"
            className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
            maxLength={2000}
            value={body}
            disabled={pending || authorizationLost}
            onChange={(event) => setBody(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="community-message-meetup">Encontro</Label>
          <select
            id="community-message-meetup"
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={meetupId}
            disabled={pending || authorizationLost}
            onChange={(event) => setMeetupId(event.target.value)}
          >
            <option value="">Não compartilhar</option>
            {meetups.map((meetup) => (
              <option key={meetup.id} value={meetup.id}>
                {meetup.title}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={pending || authorizationLost}>
          Enviar
        </Button>
      </form>
    </section>
  )
}
