export const themeModes = ['light', 'dark', 'system'] as const

export type ThemeMode = (typeof themeModes)[number]

export const themeStorageKey = 'padre.theme'

export function readStoredTheme(value: string | null): ThemeMode {
  if (value === 'light' || value === 'dark' || value === 'system') return value
  return 'system'
}

export function resolveTheme(
  mode: ThemeMode,
  systemDark: boolean,
): 'light' | 'dark' {
  if (mode === 'dark') return 'dark'
  if (mode === 'light') return 'light'
  return systemDark ? 'dark' : 'light'
}

export function applyTheme(mode: ThemeMode, systemDark: boolean) {
  const resolved = resolveTheme(mode, systemDark)
  document.documentElement.classList.toggle('dark', resolved === 'dark')
  document.documentElement.style.colorScheme = resolved
  document.documentElement.dataset.theme = mode
  document.documentElement.dataset.resolvedTheme = resolved
}

export function systemPrefersDark() {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
}
