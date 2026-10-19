import { Link } from 'react-router'

import {
  groupCommunityMeetups,
  type CommunityMeetup,
} from '@/domains/meetups/model/community-meetup.ts'
import { formatMeetupInstant } from '@/domains/meetups/model/schedule.ts'
import { Button, buttonClassName } from '@/shared/ui/button.tsx'

const phaseLabels = {
  upcoming: 'Próximos',
  past: 'Anteriores',
  cancelled: 'Cancelados',
} as const

type CommunityMeetupsProps = {
  slug: string
  state: 'hidden' | 'loading' | 'error' | 'ready'
  meetups: CommunityMeetup[]
  total: number
  canPropose: boolean
  onMore: () => void
}

export function CommunityMeetups({
  slug,
  state,
  meetups,
  total,
  canPropose,
  onMore,
}: CommunityMeetupsProps) {
  if (state === 'hidden') return null
  const groups = groupCommunityMeetups(meetups)

  return (
    <section
      className="flex flex-col gap-3"
      aria-labelledby="community-meetups"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="community-meetups" className="text-xl font-semibold">
          Encontros
        </h2>
        {canPropose ? (
          <Link
            to={`/encontros/novo?comunidade=${slug}`}
            className={buttonClassName('primary', 'w-full sm:w-auto')}
          >
            Propor encontro
          </Link>
        ) : null}
      </div>
      {state === 'loading' ? (
        <p role="status" className="text-sm text-muted-foreground">
          Carregando encontros
        </p>
      ) : null}
      {state === 'error' ? (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível carregar os encontros.
        </p>
      ) : null}
      {state === 'ready' && meetups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum encontro publicado.
        </p>
      ) : null}
      {state === 'ready'
        ? (['upcoming', 'past', 'cancelled'] as const).map((phase) =>
            groups[phase].length > 0 ? (
              <div key={phase} className="flex flex-col gap-2">
                <h3 className="text-sm font-medium text-muted-foreground">
                  {phaseLabels[phase]}
                </h3>
                <ul className="flex flex-col gap-3">
                  {groups[phase].map((meetup) => (
                    <li key={meetup.id}>
                      <Link
                        to={`/encontros/${meetup.id}`}
                        className="flex flex-col gap-1 rounded-xl border p-4 text-sm"
                      >
                        <span className="font-medium">{meetup.title}</span>
                        <span>
                          {meetup.sportName} · {meetup.formatName}
                        </span>
                        <span>
                          {formatMeetupInstant(
                            meetup.startsAt,
                            meetup.timeZone,
                          )}
                        </span>
                        <span>{meetup.locationName}</span>
                        <span>Organização: {meetup.organizerUsername}</span>
                        <span>
                          {meetup.confirmedCount} confirmados ·{' '}
                          {meetup.openSpots === 1
                            ? '1 vaga disponível'
                            : `${meetup.openSpots} vagas disponíveis`}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null,
          )
        : null}
      {state === 'ready' && total > meetups.length ? (
        <Button
          variant="secondary"
          className="w-full sm:w-auto"
          onClick={onMore}
        >
          Mais encontros
        </Button>
      ) : null}
    </section>
  )
}
