import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PlaceBrowser } from './place-browser.tsx'

vi.mock('@/domains/maps/components/sports-map.tsx', () => ({
  SportsMap: ({
    markers,
    onSelect,
  }: {
    markers: { id: string; label: string }[]
    onSelect?: (id: string) => void
  }) => (
    <div>
      <p>Mapa de teste</p>
      {markers.map((marker) => (
        <button
          key={marker.id}
          type="button"
          onClick={() => onSelect?.(marker.id)}
        >
          {marker.label}
        </button>
      ))}
    </div>
  ),
}))

const places = [
  {
    id: 'a',
    name: 'Quadra do José',
    address: 'Rua São João, 10',
    details: 'Coberta',
    status: 'active',
    latitude: -23.5,
    longitude: -46.6,
  },
  {
    id: 'b',
    name: 'Quadra sem ponto',
    address: 'Rua 2',
    details: '',
    status: 'active',
    latitude: null,
    longitude: null,
  },
]

describe('place browser', () => {
  it('switches between the list and the map and opens the selected venue', () => {
    render(
      <PlaceBrowser places={places}>
        <p>Lista de locais</p>
      </PlaceBrowser>,
    )
    expect(screen.getByText('Lista de locais')).toBeVisible()
    fireEvent.click(screen.getByRole('tab', { name: 'Mapa' }))
    expect(screen.queryByText('Lista de locais')).toBeNull()
    expect(screen.getByText('Mapa de teste')).toBeVisible()
    expect(screen.getByText(/1 local continua/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Quadra do José' }))
    expect(screen.getByText('Rua São João, 10')).toBeVisible()
    expect(screen.getByText('Coberta')).toBeVisible()
    expect(screen.getByText('Ativo')).toBeVisible()
    fireEvent.click(screen.getByRole('tab', { name: 'Lista' }))
    expect(screen.getByText('Lista de locais')).toBeVisible()
  })
})
