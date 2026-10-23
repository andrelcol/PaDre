import {
  formatAverage,
  type PlayerCard,
} from '@/domains/cards/model/player-card.ts'

export function PadrePlayerCard({
  card,
  communityName,
}: {
  card: PlayerCard
  communityName: string
}) {
  const initial = card.display_name.slice(0, 1).toUpperCase()

  return (
    <article
      aria-label={`Cartinha de ${card.display_name}`}
      className="flex min-w-0 flex-col gap-4 rounded-3xl border border-primary/40 bg-card p-4 text-foreground shadow-lg"
    >
      <div className="flex items-start justify-between gap-3 rounded-2xl bg-ink p-3 text-ink-foreground">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="inline-flex size-16 items-center justify-center rounded-2xl bg-primary text-2xl font-bold text-primary-foreground"
          >
            {initial}
          </span>
          <div>
            <p className="text-xs uppercase tracking-widest text-pitch">
              PaDre Player Card
            </p>
            <h3 className="text-lg font-semibold">{card.display_name}</h3>
            <p className="text-sm text-ink-foreground/80">@{card.username}</p>
          </div>
        </div>
        <p className="flex flex-col items-end">
          <span className="text-xs">Overall</span>
          <span className="text-4xl font-bold text-pitch">
            {card.overall == null ? '—' : card.overall}
          </span>
        </p>
      </div>
      <p className="text-sm">{communityName}</p>
      {card.state === 'pending' ? (
        <p className="text-sm text-foreground">
          Aguardando avaliações suficientes
        </p>
      ) : null}
      <ul className="grid gap-2">
        {card.attributes.map((attribute) => (
          <li
            key={attribute.id}
            className="flex items-center justify-between gap-3 rounded-xl bg-background/80 px-3 py-2 text-sm text-foreground"
          >
            <span>{attribute.name}</span>
            <span className="font-semibold">
              {attribute.average == null
                ? 'Em avaliação'
                : formatAverage(attribute.average)}
            </span>
          </li>
        ))}
      </ul>
    </article>
  )
}
