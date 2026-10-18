export type InitialSport = {
  slug: string
  name: string
}

/**
 * Modalidades exibidas na casca inicial.
 * O catálogo persistido chega na fase do catálogo; esta lista não simula uma API.
 */
export const initialSports = [
  { slug: 'volleyball', name: 'Vôlei' },
  { slug: 'beach-volleyball', name: 'Vôlei de areia' },
  { slug: 'futsal', name: 'Futsal' },
  { slug: 'beach-tennis', name: 'Beach tennis' },
  { slug: 'footvolley', name: 'Futevôlei' },
] as const satisfies readonly InitialSport[]
