export type MapTheme = 'light' | 'dark'

const liberty = 'https://tiles.openfreemap.org/styles/liberty'
const dark = 'https://tiles.openfreemap.org/styles/dark'

export function mapStyleUrl(theme: MapTheme) {
  if (theme === 'dark') {
    return import.meta.env.VITE_MAP_STYLE_DARK || dark
  }
  return import.meta.env.VITE_MAP_STYLE_LIGHT || liberty
}

export const mapAttribution =
  'OpenFreeMap © OpenMapTiles · Dados © OpenStreetMap'
