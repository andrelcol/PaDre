import { Link } from 'react-router'

import type { CommunityMessage } from '@/domains/chat/model/message.ts'
import { formatMeetupInstant } from '@/domains/meetups/model/schedule.ts'
import { Button } from '@/shared/ui/button.tsx'

type CommunityMessageRowProps = {
  message: CommunityMessage
  pending: boolean
  onDelete: (messageId: string) => void
}

export function CommunityMessageRow({
  message,
  pending,
  onDelete,
}: CommunityMessageRowProps) {
  const sentAt = formatMessageTime(message.createdAt)

  return (
    <article
      className={
        message.mine
          ? 'ml-8 flex flex-col gap-1 rounded-2xl rounded-br-md bg-primary px-3 py-2 text-primary-foreground'
          : 'mr-8 flex flex-col gap-1 rounded-2xl rounded-bl-md bg-muted px-3 py-2'
      }
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{message.authorUsername}</p>
        <time
          className={
            message.mine
              ? 'text-xs text-primary-foreground/80'
              : 'text-xs text-muted-foreground'
          }
          dateTime={message.createdAt}
        >
          {sentAt}
        </time>
      </header>
      {message.deleted ? (
        <p
          className={
            message.mine
              ? 'text-sm text-primary-foreground/80'
              : 'text-sm text-muted-foreground'
          }
        >
          Mensagem removida
        </p>
      ) : (
        <p className="text-sm whitespace-pre-wrap break-words">
          {message.body}
        </p>
      )}
      {message.meetup ? (
        <Link
          to={`/encontros/${message.meetup.id}`}
          aria-label={`Encontro compartilhado ${message.meetup.title}`}
          className="flex flex-col gap-1 rounded-md border bg-card p-3 text-sm text-card-foreground"
        >
          <span className="font-medium">{message.meetup.title}</span>
          <span>
            {message.meetup.sportName} · {message.meetup.formatName}
          </span>
          <span>
            {formatMeetupInstant(
              message.meetup.startsAt,
              message.meetup.timeZone,
            )}
          </span>
          <span>{message.meetup.locationName}</span>
          <span>
            {message.meetup.status === 'cancelled'
              ? 'Cancelado'
              : `${message.meetup.openSpots} vagas`}
          </span>
        </Link>
      ) : null}
      {message.mine && !message.deleted ? (
        <Button
          type="button"
          variant="secondary"
          className="self-start"
          disabled={pending}
          aria-label={`Apagar mensagem ${message.id}`}
          onClick={() => onDelete(message.id)}
        >
          Apagar
        </Button>
      ) : null}
      {message.canModerate ? (
        <Button
          type="button"
          variant="secondary"
          className="self-start"
          disabled={pending}
          aria-label={`Remover mensagem ${message.id}`}
          onClick={() => onDelete(message.id)}
        >
          Remover
        </Button>
      ) : null}
    </article>
  )
}

function formatMessageTime(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso))
}
