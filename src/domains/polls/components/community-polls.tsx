import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { listCommunityPolls } from '@/domains/polls/api/polls.ts'
import {
  communityPollKey,
  useCancelCommunityPoll,
  useCloseCommunityPoll,
  useCommunityPolls,
  useCreateCommunityPoll,
  useVoteCommunityPoll,
} from '@/domains/polls/api/queries.ts'
import { PollCard } from '@/domains/polls/components/poll-card.tsx'
import { PollForm } from '@/domains/polls/components/poll-form.tsx'
import {
  defaultPollDraft,
  isPollAuthorizationError,
  messageFromPollError,
  pollFilterLabels,
  pollStatuses,
  type CommunityPoll,
  type PollStatus,
  type PollWrite,
} from '@/domains/polls/model/poll.ts'
import { Button } from '@/shared/ui/button.tsx'

type SportChoice = { id: string; name: string }

type CommunityPollsProps = {
  slug: string
  sports: SportChoice[]
}

export function CommunityPolls({ slug, sports }: CommunityPollsProps) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<PollStatus>('open')
  const [creating, setCreating] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [older, setOlder] = useState<CommunityPoll[]>([])
  const [loadedOlder, setLoadedOlder] = useState(false)
  const [olderHasMore, setOlderHasMore] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const polls = useCommunityPolls(slug, status, slug.length > 0)
  const create = useCreateCommunityPoll(slug)
  const vote = useVoteCommunityPoll(slug)
  const close = useCloseCommunityPoll(slug)
  const cancel = useCancelCommunityPoll(slug)
  const pending =
    create.isPending || vote.isPending || close.isPending || cancel.isPending
  const visible = isPollAuthorizationError(polls.error)
    ? []
    : [...(polls.data?.polls ?? []), ...older]
  const hasOlder = loadedOlder ? olderHasMore : (polls.data?.hasOlder ?? false)

  useEffect(() => {
    return () => {
      queryClient.removeQueries({ queryKey: communityPollKey(slug) })
    }
  }, [queryClient, slug])

  useEffect(() => {
    if (!isPollAuthorizationError(polls.error)) return
    queryClient.removeQueries({ queryKey: communityPollKey(slug) })
  }, [polls.error, queryClient, slug])

  function showStatus(next: PollStatus) {
    setStatus(next)
    setOlder([])
    setLoadedOlder(false)
    setOlderHasMore(false)
    setNotice('')
    setError('')
  }

  async function publish(draft: PollWrite) {
    setNotice('')
    setError('')
    try {
      await create.mutateAsync({ slug, draft })
      setCreating(false)
      setOlder([])
      setLoadedOlder(false)
      showStatus('open')
      setNotice('Enquete publicada.')
    } catch (caught) {
      setError(messageFromPollError(caught))
    }
  }

  async function loadOlder() {
    const cursor = visible[visible.length - 1]
    if (!cursor) return
    setLoadingOlder(true)
    setError('')
    try {
      const page = await listCommunityPolls(
        slug,
        status,
        20,
        cursor.createdAt,
        cursor.id,
      )
      setOlder((current) => [...current, ...page.polls])
      setLoadedOlder(true)
      setOlderHasMore(page.hasOlder)
    } catch (caught) {
      if (isPollAuthorizationError(caught)) {
        queryClient.removeQueries({ queryKey: communityPollKey(slug) })
        setOlder([])
      }
      setError(messageFromPollError(caught))
    } finally {
      setLoadingOlder(false)
    }
  }

  async function saveVote(pollId: string, optionIds: string[]) {
    setNotice('')
    setError('')
    try {
      await vote.mutateAsync({ pollId, optionIds })
      setOlder([])
      setLoadedOlder(false)
      setNotice(optionIds.length === 0 ? 'Voto retirado.' : 'Voto registrado.')
    } catch (caught) {
      setError(messageFromPollError(caught))
    }
  }

  async function finish(pollId: string, action: 'close' | 'cancel') {
    setNotice('')
    setError('')
    try {
      if (action === 'close') await close.mutateAsync(pollId)
      else await cancel.mutateAsync(pollId)
      setOlder([])
      setLoadedOlder(false)
      setNotice(
        action === 'close' ? 'Enquete encerrada.' : 'Enquete cancelada.',
      )
    } catch (caught) {
      setError(messageFromPollError(caught))
    }
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="community-polls">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="community-polls" className="text-xl font-semibold">
          Enquetes
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => void polls.refetch()}
          >
            Recarregar enquetes
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setCreating((current) => !current)}
          >
            {creating ? 'Fechar formulário' : 'Nova enquete'}
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtro">
        {pollStatuses.map((item) => (
          <Button
            key={item}
            type="button"
            variant={item === status ? 'primary' : 'secondary'}
            aria-pressed={item === status}
            onClick={() => showStatus(item)}
          >
            {pollFilterLabels[item]}
          </Button>
        ))}
      </div>
      {notice ? (
        <p className="text-sm" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {creating ? (
        <PollForm
          sports={sports}
          initial={defaultPollDraft()}
          pending={pending}
          onSubmit={(draft) => void publish(draft)}
        />
      ) : null}
      {polls.isPending ? (
        <p className="text-sm text-muted-foreground">Carregando enquetes.</p>
      ) : polls.isError ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-destructive" role="alert">
            {messageFromPollError(polls.error)}
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void polls.refetch()}
          >
            Tentar de novo
          </Button>
        </div>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {status === 'open'
            ? 'Nenhuma enquete aberta.'
            : status === 'closed'
              ? 'Nenhuma enquete encerrada.'
              : 'Nenhuma enquete cancelada.'}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((poll) => (
            <PollCard
              key={`${poll.id}:${poll.myOptionIds.join()}:${poll.effectiveStatus}:${poll.participantCount}`}
              poll={poll}
              pending={pending}
              onVote={(optionIds) => void saveVote(poll.id, optionIds)}
              onClose={() => void finish(poll.id, 'close')}
              onCancel={() => void finish(poll.id, 'cancel')}
            />
          ))}
          {hasOlder ? (
            <Button
              type="button"
              variant="secondary"
              disabled={loadingOlder}
              onClick={() => void loadOlder()}
            >
              {loadingOlder ? 'Carregando enquetes.' : 'Enquetes anteriores'}
            </Button>
          ) : null}
        </div>
      )}
    </section>
  )
}
