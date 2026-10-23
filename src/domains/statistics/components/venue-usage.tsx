import { useCommunityVenueUsage } from '@/domains/statistics/api/queries.ts'
import { messageFromStatisticError } from '@/domains/statistics/model/statistics.ts'
import { venueStatusLabel } from '@/domains/venues/model/venue.ts'

export function VenueUsageSummary({ slug }: { slug: string }) {
  const usage = useCommunityVenueUsage(slug, true)

  return (
    <section className="flex flex-col gap-3" aria-labelledby="venue-usage">
      <h3 id="venue-usage" className="text-lg font-semibold">
        Utilização dos locais
      </h3>
      <p className="text-sm text-muted-foreground">
        Números do local, sem resultado individual. Uma partida conta uma vez,
        qualquer que seja a escalação. Encontro cancelado fica separado da
        partida que já estava confirmada.
      </p>
      {usage.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Carregando utilização
        </p>
      ) : null}
      {usage.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {messageFromStatisticError(usage.error)}
        </p>
      ) : null}
      {usage.data && usage.data.venues.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Esta comunidade ainda não tem locais.
        </p>
      ) : null}
      {usage.data && usage.data.venues.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {usage.data.venues.map((venue) => (
            <li
              key={venue.venue_id}
              className="flex flex-col gap-1 rounded-xl border bg-card p-4 text-sm"
            >
              <p className="font-medium">
                {venue.name}{' '}
                <span className="font-normal text-muted-foreground">
                  {venueStatusLabel(venue.status)}
                </span>
              </p>
              <p>{venue.scheduled_meetups} encontros previstos</p>
              <p>{venue.cancelled_meetups} encontros cancelados</p>
              <p>
                {venue.meetups_with_confirmed_matches} encontros com partida
                confirmada
              </p>
              <p>{venue.confirmed_matches} partidas confirmadas</p>
              {venue.sports.length > 0 ? (
                <p>
                  Modalidades:{' '}
                  {venue.sports
                    .map(
                      (sport) =>
                        `${sport.sport_name} (${sport.confirmed_matches})`,
                    )
                    .join(', ')}
                </p>
              ) : (
                <p className="text-muted-foreground">
                  Nenhuma partida confirmada neste local.
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
