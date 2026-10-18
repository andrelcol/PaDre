import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HomePage } from './HomePage.tsx'

describe('HomePage', () => {
  it('shows the product and the opening sports', () => {
    render(<HomePage />)

    expect(
      screen.getByRole('heading', { name: 'PaDre', level: 1 }),
    ).toBeVisible()
    expect(
      screen.getByRole('heading', { name: 'Modalidades iniciais', level: 2 }),
    ).toBeVisible()
    expect(
      screen.getByRole('list', { name: 'Modalidades iniciais' }),
    ).toBeVisible()
    expect(screen.getByText('Vôlei de areia')).toBeVisible()
    expect(screen.getByText('Futevôlei')).toBeVisible()
    expect(
      screen.getByText(
        'Contas, encontros e partidas entram nas próximas etapas.',
      ),
    ).toBeVisible()
  })
})
