import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { CatalogSport } from '@/domains/sports/model/catalog.ts'
import { CatalogView } from './catalog-view.tsx'

const volleyball: CatalogSport = {
  id: 'a1000000-0000-4000-8000-000000000001',
  slug: 'volleyball',
  name: 'Vôlei',
  description: 'Esporte de quadra jogado com as mãos, por cima de uma rede.',
  displayOrder: 1,
  formats: [
    {
      id: 'a2000000-0000-4000-8000-000000000001',
      slug: 'indoor-6x6',
      name: 'Vôlei 6x6',
      sideCount: 2,
      playersPerSideMin: 6,
      playersPerSideMax: 6,
      displayOrder: 1,
      rule: {
        id: 'a3000000-0000-4000-8000-000000000001',
        version: 1,
        rule_type: 'set_based',
        origin: 'official_summary',
        config: {
          sets_to_win: 3,
          points_to_win_set: 25,
          minimum_point_difference: 2,
          deciding_set_points: 15,
          point_cap: null,
        },
      },
    },
  ],
}

const futsal: CatalogSport = {
  id: 'a1000000-0000-4000-8000-000000000003',
  slug: 'futsal',
  name: 'Futsal',
  description: 'Esporte de quadra jogado com os pés.',
  displayOrder: 3,
  formats: [
    {
      id: 'a2000000-0000-4000-8000-000000000005',
      slug: 'futsal-5x5',
      name: 'Futsal 5x5',
      sideCount: 2,
      playersPerSideMin: 5,
      playersPerSideMax: 5,
      displayOrder: 1,
      rule: {
        id: 'a3000000-0000-4000-8000-000000000005',
        version: 1,
        rule_type: 'goal_based',
        origin: 'official_summary',
        config: { allows_draw: true, tie_break: 'none' },
      },
    },
  ],
}

describe('CatalogView', () => {
  it('shows a loading message', () => {
    render(<CatalogView status="loading" sports={[]} />)
    expect(screen.getByRole('status')).toHaveTextContent('Carregando catálogo')
  })

  it('shows an error message', () => {
    render(<CatalogView status="error" sports={[]} />)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Não foi possível carregar o catálogo.',
    )
  })

  it('shows an empty catalog', () => {
    render(<CatalogView status="ready" sports={[]} />)
    expect(
      screen.getByText('Nenhuma modalidade ativa no catálogo.'),
    ).toBeVisible()
  })

  it('shows the formats of the selected sport and the scoring summary', async () => {
    const user = userEvent.setup()
    render(<CatalogView status="ready" sports={[volleyball, futsal]} />)

    expect(screen.getByText('Formatos de Vôlei')).toBeVisible()
    expect(
      screen.getByText('Escolha um formato para ver a pontuação.'),
    ).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Vôlei 6x6' }))

    expect(screen.getByText('2 lados, 6 jogadores por lado')).toBeVisible()
    expect(
      screen.getByText('Cada set vai a 25 pontos, com diferença mínima de 2.'),
    ).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Futsal' }))
    expect(screen.getByText('Formatos de Futsal')).toBeVisible()
    expect(
      screen.getByText('Escolha um formato para ver a pontuação.'),
    ).toBeVisible()
  })
})
