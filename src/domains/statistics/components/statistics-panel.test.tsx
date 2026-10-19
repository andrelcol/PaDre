import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { StatisticsPanel } from './statistics-panel.tsx'

const base = {
  matches_played: 2,
  wins: 1,
  losses: 1,
  draws: 0,
  win_rate: 50,
  formats: [],
}

describe('StatisticsPanel', () => {
  it('shows volleyball points and hides goals', () => {
    render(
      <StatisticsPanel
        empty="vazio"
        sports={[
          {
            ...base,
            sport_id: 'a1000000-0000-4000-8000-000000000001',
            sport_name: 'Vôlei',
            rule_type: 'set_based',
            points_for: 75,
            points_against: 60,
            sets_won: 3,
            sets_lost: 0,
          },
        ]}
      />,
    )
    expect(screen.getByText('Pontos marcados')).toBeVisible()
    expect(screen.getByText('Sets vencidos')).toBeVisible()
    expect(screen.getByText('+15')).toBeVisible()
    expect(screen.queryByText('Gols marcados')).not.toBeInTheDocument()
    expect(screen.queryByText('Empates')).not.toBeInTheDocument()
    expect(screen.queryByText('Games vencidos')).not.toBeInTheDocument()
  })

  it('shows futsal goals and draws', () => {
    render(
      <StatisticsPanel
        empty="vazio"
        sports={[
          {
            ...base,
            sport_id: 'a1000000-0000-4000-8000-000000000003',
            sport_name: 'Futsal',
            rule_type: 'goal_based',
            draws: 1,
            goals_for: 5,
            goals_against: 4,
          },
        ]}
      />,
    )
    expect(screen.getByText('Gols marcados')).toBeVisible()
    expect(screen.getByText('Empates')).toBeVisible()
    expect(screen.queryByText('Pontos marcados')).not.toBeInTheDocument()
    expect(screen.queryByText('Sets vencidos')).not.toBeInTheDocument()
  })

  it('shows beach tennis games without treating a tiebreak as a game', () => {
    render(
      <StatisticsPanel
        empty="vazio"
        sports={[
          {
            ...base,
            sport_id: 'a1000000-0000-4000-8000-000000000004',
            sport_name: 'Beach tennis',
            rule_type: 'game_based',
            sets_won: 2,
            sets_lost: 0,
            games_won: 12,
            games_lost: 10,
            deciding_points_for: 0,
            deciding_points_against: 0,
          },
        ]}
      />,
    )
    expect(screen.getByText('Games vencidos')).toBeVisible()
    expect(screen.getByText('12')).toBeVisible()
    expect(screen.queryByText('Pontos do set decisivo')).not.toBeInTheDocument()
    expect(screen.queryByText('Gols marcados')).not.toBeInTheDocument()
  })
})
