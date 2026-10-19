import { useState } from 'react'

import { formatWinRate } from '@/domains/statistics/model/statistics.ts'
import {
  relationshipStatusCopy,
  type RelationshipHighlights,
  type RelationshipPerson,
  type RelationshipStatus,
} from '@/domains/statistics/model/relationships.ts'
import { Button } from '@/shared/ui/button.tsx'

type RelationshipBoardProps = {
  highlights: RelationshipHighlights
  teammates: RelationshipPerson[]
  opponents: RelationshipPerson[]
  teammateTotal: number
  opponentTotal: number
  teammateOffset: number
  opponentOffset: number
  pageSize: number
  onTeammatePage: (offset: number) => void
  onOpponentPage: (offset: number) => void
}

export function RelationshipBoard({
  highlights,
  teammates,
  opponents,
  teammateTotal,
  opponentTotal,
  teammateOffset,
  opponentOffset,
  pageSize,
  onTeammatePage,
  onOpponentPage,
}: RelationshipBoardProps) {
  const [selected, setSelected] = useState<{
    id: string
    kind: 'teammate' | 'opponent'
  } | null>(null)
  const selectedPerson =
    (selected?.kind === 'teammate' ? teammates : opponents).find(
      (person) => person.user_id === selected?.id,
    ) ?? null

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <Highlight
          label="Companheiro mais frequente"
          status={highlights.most_frequent_teammate_status}
          person={highlights.most_frequent_teammate}
          minimum={highlights.minimum_matches}
          summary={(person) =>
            `${person.username} — ${countLabel(person.matches_played, true)}`
          }
        />
        <Highlight
          label="Melhor companheiro"
          status={highlights.best_teammate_status}
          person={highlights.best_teammate}
          minimum={highlights.minimum_matches}
          summary={(person) =>
            `${person.username} — ${formatWinRate(person.win_rate)} em ${countLabel(person.matches_played, true)}`
          }
        />
        <Highlight
          label="Adversário mais frequente"
          status={highlights.most_frequent_opponent_status}
          person={highlights.most_frequent_opponent}
          minimum={highlights.minimum_matches}
          summary={(person) =>
            `${person.username} — ${countLabel(person.matches_played, false)}`
          }
        />
        <Highlight
          label="Mais vitórias contra"
          status={highlights.most_defeated_opponent_status}
          person={highlights.most_defeated_opponent}
          minimum={highlights.minimum_matches}
          summary={(person) =>
            `${person.username} — ${person.wins} vitórias em ${countLabel(person.matches_played, false)}`
          }
        />
        <Highlight
          label="Adversário mais difícil"
          status={highlights.hardest_opponent_status}
          person={highlights.hardest_opponent}
          minimum={highlights.minimum_matches}
          summary={(person) =>
            `${person.username} — ${formatWinRate(person.win_rate)} em ${countLabel(person.matches_played, false)}`
          }
        />
      </dl>
      <RelationshipList
        title="Companheiros"
        people={teammates}
        total={teammateTotal}
        offset={teammateOffset}
        pageSize={pageSize}
        selectedId={selected?.kind === 'teammate' ? selected.id : null}
        empty="Nenhuma partida confirmada com um companheiro nesta modalidade."
        onSelect={(id) => setSelected({ id, kind: 'teammate' })}
        onPage={onTeammatePage}
      />
      <RelationshipList
        title="Adversários"
        people={opponents}
        total={opponentTotal}
        offset={opponentOffset}
        pageSize={pageSize}
        selectedId={selected?.kind === 'opponent' ? selected.id : null}
        empty="Nenhum confronto confirmado nesta modalidade."
        onSelect={(id) => setSelected({ id, kind: 'opponent' })}
        onPage={onOpponentPage}
      />
      {selected && selectedPerson ? (
        <RelationshipDetail person={selectedPerson} kind={selected.kind} />
      ) : null}
    </div>
  )
}

function Highlight({
  label,
  status,
  person,
  minimum,
  summary,
}: {
  label: string
  status: RelationshipStatus
  person: RelationshipPerson | null
  minimum: number
  summary: (person: RelationshipPerson) => string
}) {
  const note = relationshipStatusCopy(status, minimum)
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{person ? summary(person) : note}</dd>
    </div>
  )
}

function countLabel(count: number, together: boolean) {
  if (together)
    return count === 1 ? '1 partida juntos' : `${count} partidas juntos`
  return count === 1 ? '1 confronto' : `${count} confrontos`
}

function RelationshipList({
  title,
  people,
  total,
  offset,
  pageSize,
  selectedId,
  empty,
  onSelect,
  onPage,
}: {
  title: string
  people: RelationshipPerson[]
  total: number
  offset: number
  pageSize: number
  selectedId: string | null
  empty: string
  onSelect: (userId: string) => void
  onPage: (offset: number) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-base font-medium">{title}</h3>
      {people.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {people.map((person) => (
            <li key={person.user_id}>
              <button
                type="button"
                className="w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-accent"
                aria-pressed={selectedId === person.user_id}
                onClick={() => onSelect(person.user_id)}
              >
                {person.username} — {person.matches_played}{' '}
                {title === 'Companheiros' ? 'partidas juntos' : 'confrontos'},{' '}
                {formatWinRate(person.win_rate)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {total > pageSize ? (
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={offset === 0}
            onClick={() => onPage(Math.max(0, offset - pageSize))}
          >
            Anterior
          </Button>
          <Button
            variant="secondary"
            disabled={offset + pageSize >= total}
            onClick={() => onPage(offset + pageSize)}
          >
            Próxima
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function RelationshipDetail({
  person,
  kind,
}: {
  person: RelationshipPerson
  kind: 'teammate' | 'opponent'
}) {
  const rows = [
    [
      kind === 'teammate' ? 'Partidas juntos' : 'Confrontos',
      String(person.matches_played),
    ],
    ['Vitórias', String(person.wins)],
    ['Derrotas', String(person.losses)],
    ['Empates', String(person.draws)],
    ['Aproveitamento', formatWinRate(person.win_rate)],
  ]
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-base font-medium">{person.username}</h3>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
