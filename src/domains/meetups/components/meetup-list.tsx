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
        <ul aria-label={title} className="flex flex-col gap-3">
          {items.map((item) => {
            const spots = openSpots(item.maxParticipants, item.confirmedCount)
            const spotLabel =
              spots === 1 ? '1 vaga disponível' : `${spots} vagas disponíveis`
            return (
              <li key={`${title}-${item.id}`}>
                <Link
                  to={`/encontros/${item.id}`}
                  className="flex flex-col gap-3 rounded-2xl border bg-card p-4 text-card-foreground hover:border-primary"
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-primary">
                      {item.sportName}
                    </span>
                    <span className="rounded-full border px-2 py-1 text-xs font-semibold">
                      {statusLabels[item.status]}
                    </span>
                  </span>
                  <span className="font-display text-xl font-semibold">
                    {item.title}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {item.formatName} ·{' '}
                    {formatMeetupInstant(item.startsAt, item.timeZone)}
                  </span>
                  <span className="text-sm">
                    <span className="text-muted-foreground">Local · </span>
                    {item.locationName}
                  </span>
                  <span className="text-sm font-semibold">{spotLabel}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
