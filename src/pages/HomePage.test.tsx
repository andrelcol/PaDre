import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SessionStateProvider } from '@/domains/identity/components/session.tsx'
import type { CatalogSport } from '@/domains/sports/model/catalog.ts'
import { HomePage } from './HomePage.tsx'

const { getCatalog } = vi.hoisted(() => ({
  getCatalog: vi.fn(),
}))

vi.mock('@/domains/sports/api/catalog.ts', () => ({
  getCatalog,
}))

const sports: CatalogSport[] = [
  {
    id: 'a1000000-0000-4000-8000-000000000001',
    slug: 'volleyball',
    name: 'Vôlei',
    description: 'Esporte de quadra.',
    displayOrder: 1,
    formats: [],
  },
  {
    id: 'a1000000-0000-4000-8000-000000000002',
    slug: 'beach-volleyball',
    name: 'Vôlei de areia',
    description: 'Esporte de areia.',
    displayOrder: 2,
    formats: [],
  },
  {
    id: 'a1000000-0000-4000-8000-000000000005',
    slug: 'footvolley',
    name: 'Futevôlei',
    description: 'Esporte próprio.',
    displayOrder: 5,
    formats: [],
  },
]

function renderHome() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <SessionStateProvider value={{ session: null, loading: false }}>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </SessionStateProvider>
    </QueryClientProvider>,
  )
}

describe('HomePage', () => {
  beforeEach(() => {
    getCatalog.mockReset()
  })

  it('shows the product and the sports returned by the catalog', async () => {
    getCatalog.mockResolvedValue(sports)
    renderHome()

    expect(
      screen.getByRole('heading', { name: 'PaDre', level: 1 }),
    ).toBeVisible()
    expect(
      await screen.findByRole('heading', { name: 'Modalidades', level: 2 }),
    ).toBeVisible()
    expect(
      await screen.findByRole('button', { name: /Vôlei de areia/ }),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: /Futevôlei/ })).toBeVisible()
    expect(screen.getByText(/Organize encontros presenciais/)).toBeVisible()
  })

  it('shows an error when the catalog request fails', async () => {
    getCatalog.mockRejectedValue(new Error('rede'))
    renderHome()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar o catálogo.',
    )
  })
})
