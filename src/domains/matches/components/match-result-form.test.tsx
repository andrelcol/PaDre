import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { MatchResultForm } from './match-result-form.tsx'

const teams = [
  {
    id: 'a1000000-0000-4000-8000-000000000031',
    side: 1 as const,
    name: 'Azul',
    players: [],
  },
  {
    id: 'a1000000-0000-4000-8000-000000000032',
    side: 2 as const,
    name: 'Verde',
    players: [],
  },
]

describe('MatchResultForm', () => {
  it('asks for sets on a set-based rule', () => {
    render(
      <MatchResultForm
        idPrefix="set"
        rule={{
          rule_type: 'set_based',
          config: {
            sets_to_win: 2,
            points_to_win_set: 21,
            minimum_point_difference: 2,
            deciding_set_points: 15,
            point_cap: null,
          },
        }}
        teams={teams}
        initial={undefined}
        pending={false}
        submitLabel="Salvar placar"
        onSubmit={() => undefined}
      />,
    )
    expect(screen.getByLabelText('Pontos de Azul no set 1')).toBeVisible()
    expect(screen.queryByLabelText('Gols de Azul')).not.toBeInTheDocument()
  })

  it('asks for goals on a goal-based rule', () => {
    render(
      <MatchResultForm
        idPrefix="goal"
        rule={{
          rule_type: 'goal_based',
          config: { allows_draw: true, tie_break: 'none' },
        }}
        teams={teams}
        initial={undefined}
        pending={false}
        submitLabel="Salvar placar"
        onSubmit={() => undefined}
      />,
    )
    expect(screen.getByLabelText('Gols de Azul')).toBeVisible()
    expect(screen.queryByText('Set 1')).not.toBeInTheDocument()
    expect(screen.getByText(/Empate é um resultado válido/)).toBeVisible()
  })

  it('asks for games on a game-based rule', () => {
    render(
      <MatchResultForm
        idPrefix="game"
        rule={{
          rule_type: 'game_based',
          config: {
            games_to_win_set: 6,
            minimum_game_difference: 2,
            sets_to_win: 2,
            tiebreak_points: 7,
            deciding_set_points: 10,
          },
        }}
        teams={teams}
        initial={undefined}
        pending={false}
        submitLabel="Salvar placar"
        onSubmit={() => undefined}
      />,
    )
    expect(screen.getByLabelText('Games de Azul no set 1')).toBeVisible()
    expect(screen.getByLabelText('Teve tiebreak no set 1')).toBeVisible()
    expect(screen.queryByLabelText('Gols de Azul')).not.toBeInTheDocument()
  })
})
