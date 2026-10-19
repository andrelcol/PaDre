import { useState } from 'react'

import { formatMeetupInstant } from '@/domains/meetups/model/schedule.ts'
import {
  describePollResult,
  formatPollPercent,
  pollKindLabels,
  pollStatusLabels,
  pollTimeZone,
  selectionModeLabels,
  type CommunityPoll,
} from '@/domains/polls/model/poll.ts'
import { Button } from '@/shared/ui/button.tsx'

type PollCardProps = {
  poll: CommunityPoll
  pending: boolean
  onVote: (optionIds: string[]) => void
  onClose: () => void
  onCancel: () => void
}

export function PollCard({
  poll,
  pending,
  onVote,
  onClose,
  onCancel,
}: PollCardProps) {
  const [selected, setSelected] = useState(poll.myOptionIds)
  const [confirming, setConfirming] = useState<'close' | 'cancel' | null>(null)
  const open = poll.effectiveStatus === 'open'
  const result = describePollResult(poll)
  const choiceLimit =
    poll.selectionMode === 'single'
      ? 'Escolha uma opção.'
      : `Escolha até ${poll.maxSelections} opções.`

  function toggle(optionId: string) {
    setSelected((current) => {
      if (poll.selectionMode === 'single') return [optionId]
      if (current.includes(optionId)) {
        return current.filter((id) => id !== optionId)
      }
      if (current.length >= poll.maxSelections) return current
      return [...current, optionId]
    })
  }

  return (
    <article className="flex flex-col gap-3 rounded-lg border p-4">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">
          {pollKindLabels[poll.kind]} ·{' '}
          {selectionModeLabels[poll.selectionMode]} ·{' '}
          {pollStatusLabels[poll.effectiveStatus]}
        </p>
        <h3 className="text-lg font-semibold">{poll.question}</h3>
        {poll.description ? (
          <p className="text-sm whitespace-pre-wrap">{poll.description}</p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          {open
            ? `Encerra ${formatMeetupInstant(poll.closesAt, pollTimeZone)} (${pollTimeZone})`
            : poll.effectiveStatus === 'cancelled'
              ? 'Votação cancelada'
              : `Encerrada ${formatMeetupInstant(poll.closedAt ?? poll.closesAt, pollTimeZone)} (${pollTimeZone})`}
        </p>
        {poll.createdByUsername ? (
          <p className="text-sm text-muted-foreground">
            Criada por {poll.createdByUsername}
          </p>
        ) : null}
      </header>

      {open ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm">{choiceLimit}</legend>
          {poll.options.map((option) => {
            const checked = selected.includes(option.id)
            return (
              <label key={option.id} className="flex items-start gap-2 text-sm">
                <input
                  className="mt-1"
                  type={poll.selectionMode === 'single' ? 'radio' : 'checkbox'}
                  name={`poll-${poll.id}`}
                  checked={checked}
                  onChange={() => toggle(option.id)}
                />
                <span>
                  {option.label}
                  {option.startsAt && option.timeZone
                    ? ` · ${formatMeetupInstant(option.startsAt, option.timeZone)} (${option.timeZone})`
                    : ''}
                  {poll.myOptionIds.includes(option.id) ? ' · Sua escolha' : ''}
                </span>
              </label>
            )
          })}
        </fieldset>
      ) : (
        <ul className="flex flex-col gap-2">
          {poll.options.map((option) => (
            <li key={option.id} className="text-sm">
              {option.label}
              {option.startsAt && option.timeZone
                ? ` · ${formatMeetupInstant(option.startsAt, option.timeZone)} (${option.timeZone})`
                : ''}
              {poll.myOptionIds.includes(option.id) ? ' · Sua escolha' : ''}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-1">
        <p className="text-sm">
          {poll.participantCount === 1
            ? '1 pessoa votou.'
            : `${poll.participantCount} pessoas votaram.`}
        </p>
        <ul className="flex flex-col gap-1">
          {poll.options.map((option) => (
            <li key={option.id} className="text-sm">
              {option.label}: {option.voteCount}{' '}
              {option.voteCount === 1 ? 'voto' : 'votos'}
              {option.percent !== null
                ? ` (${formatPollPercent(option.percent)})`
                : ''}
              {poll.effectiveStatus === 'closed' && option.leading
                ? poll.options.filter((item) => item.leading).length > 1
                  ? ' · Empatada'
                  : ' · Mais votada'
                : ''}
            </li>
          ))}
        </ul>
        {poll.selectionMode === 'multiple' ? (
          <p className="text-sm text-muted-foreground">
            O percentual é de quem votou. Cada pessoa pode marcar mais de uma
            opção, então a soma pode passar de 100%.
          </p>
        ) : null}
        {result ? <p className="text-sm font-medium">{result}</p> : null}
      </div>

      {open ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            disabled={pending || selected.length === 0}
            onClick={() => onVote(selected)}
          >
            Salvar voto
          </Button>
          {poll.myOptionIds.length > 0 ? (
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => onVote([])}
            >
              Retirar meu voto
            </Button>
          ) : null}
        </div>
      ) : null}

      {open && (poll.canClose || poll.canCancel) ? (
        <div className="flex flex-col gap-2">
          {confirming === null ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              {poll.canClose ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => setConfirming('close')}
                >
                  Encerrar enquete
                </Button>
              ) : null}
              {poll.canCancel ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => setConfirming('cancel')}
                >
                  Cancelar enquete
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                disabled={pending}
                onClick={confirming === 'close' ? onClose : onCancel}
              >
                {confirming === 'close'
                  ? 'Confirmar encerramento'
                  : 'Confirmar cancelamento'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => setConfirming(null)}
              >
                Voltar
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </article>
  )
}
