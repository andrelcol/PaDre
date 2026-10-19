import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { RelationshipBoard } from './relationship-board.tsx'
import type {
  RelationshipHighlights,
  RelationshipPerson,
} from '@/domains/statistics/model/relationships.ts'

const bia: RelationshipPerson = {
  user_id: 'a1000000-0000-4000-8000-000000000002',
  username: 'bia',
  matches_played: 5,
  wins: 4,
  losses: 1,
  draws: 0,
  win_rate: 80,
}

const highlights: RelationshipHighlights = {
  sport_id: 'a1000000-0000-4000-8000-000000000010',
  sport_format_id: null,
  minimum_matches: 5,
  most_frequent_teammate: bia,
  most_frequent_teammate_status: 'selected',
  best_teammate: bia,
  best_teammate_status: 'selected',
  most_frequent_opponent: null,
  most_frequent_opponent_status: 'none',
  most_defeated_opponent: null,
  most_defeated_opponent_status: 'none',
  hardest_opponent: null,
  hardest_opponent_status: 'insufficient_sample',
}

describe('RelationshipBoard', () => {
  it('shows a real teammate and refuses a highlight without enough matches', async () => {
    const user = userEvent.setup()
    render(
      <RelationshipBoard
        highlights={highlights}
        teammates={[bia]}
        opponents={[]}
        teammateTotal={1}
        opponentTotal={0}
        teammateOffset={0}
        opponentOffset={0}
        pageSize={20}
        onTeammatePage={() => undefined}
        onOpponentPage={() => undefined}
      />,
    )
    expect(
      screen.getByText('bia — 5 partidas juntos', { exact: true }),
    ).toBeVisible()
    expect(screen.getByText('bia — 80,0% em 5 partidas juntos')).toBeVisible()
    expect(screen.getByText(/Amostra insuficiente/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: /bia/ }))
    expect(screen.getByText('Partidas juntos')).toBeVisible()
    expect(screen.getByText('80,0%')).toBeVisible()
  })
})
