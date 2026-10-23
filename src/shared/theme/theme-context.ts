import { createContext, useContext, useEffect, useState } from 'react'

import type { ThemeMode } from '@/shared/theme/theme.ts'

export type ThemeContextValue = {
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme() {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('Tema indisponível')
  return value
}

export function useResolvedTheme(): 'light' | 'dark' {
  const [resolved, setResolved] = useState<'light' | 'dark'>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  )

  useEffect(() => {
    const root = document.documentElement
    const sync = () => {
      setResolved(root.classList.contains('dark') ? 'dark' : 'light')
    }
    const observer = new MutationObserver(sync)
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  return resolved
}
