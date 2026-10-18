import { Link } from 'react-router'

import {
  openSpots,
  type MeetupSummary,
} from '@/domains/meetups/model/meetup.ts'
import { formatMeetupInstant } from '@/domains/meetups/model/schedule.ts'

const statusLabels = {
  scheduled: 'Agendado',
  cancelled: 'Cancelado',
} as const

type MeetupListProps = {
  title: string
  empty: string
  items: MeetupSummary[]
}

export function MeetupList({ title, empty, items }: MeetupListProps) {
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
            <li key={`${title}-${item.id}`}>
              <Link
                to={`/encontros/${item.id}`}
                className="flex flex-col gap-1 rounded-xl border p-4 hover:bg-accent"
              >
                <span className="font-medium">{item.title}</span>
                <span className="text-sm text-muted-foreground">
                  {item.sportName} · {item.formatName} ·{' '}
                  {formatMeetupInstant(item.startsAt, item.timeZone)} ·{' '}
                  {statusLabels[item.status]} ·{' '}
                  {openSpots(item.maxParticipants, item.confirmedCount)}{' '}
                  {openSpots(item.maxParticipants, item.confirmedCount) === 1
                    ? 'vaga disponível'
                    : 'vagas disponíveis'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
