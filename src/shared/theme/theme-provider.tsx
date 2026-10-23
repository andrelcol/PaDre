import { useEffect, useState, type ReactNode } from 'react'

import { applyNativeChrome } from '@/shared/platform/native-chrome.ts'
import { ThemeContext } from '@/shared/theme/theme-context.ts'
import {
  applyTheme,
  readStoredTheme,
  systemPrefersDark,
  themeStorageKey,
  type ThemeMode,
} from '@/shared/theme/theme.ts'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(() =>
    readStoredTheme(window.localStorage.getItem(themeStorageKey)),
  )
  const [systemDark, setSystemDark] = useState(systemPrefersDark)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent) => {
      setSystemDark(event.matches)
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    window.localStorage.setItem(themeStorageKey, mode)
    applyTheme(mode, systemDark)
    const resolved = document.documentElement.classList.contains('dark')
      ? 'dark'
      : 'light'
    void applyNativeChrome(resolved)
  }, [mode, systemDark])

  return (
    <ThemeContext.Provider value={{ mode, setMode }}>
      {children}
    </ThemeContext.Provider>
  )
}
