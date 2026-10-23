import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { ThemeControl } from '@/shared/theme/theme-control.tsx'
import { ThemeProvider } from '@/shared/theme/theme-provider.tsx'
import { themeStorageKey } from '@/shared/theme/theme.ts'

function installMatchMedia(initial: boolean) {
  let matches = initial
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: () => ({
      matches,
      media: '(prefers-color-scheme: dark)',
      addEventListener: (
        _type: string,
        listener: (event: MediaQueryListEvent) => void,
      ) => {
        listeners.add(listener)
      },
      removeEventListener: (
        _type: string,
        listener: (event: MediaQueryListEvent) => void,
      ) => {
        listeners.delete(listener)
      },
    }),
  })
  return {
    change(next: boolean) {
      matches = next
      listeners.forEach((listener) =>
        listener({ matches: next } as MediaQueryListEvent),
      )
    },
  }
}

function renderTheme() {
  return render(
    <ThemeProvider>
      <ThemeControl />
    </ThemeProvider>,
  )
}

describe('ThemeControl', () => {
  afterEach(() => {
    window.localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  it('starts from the system preference and can switch to dark and light', async () => {
    const user = userEvent.setup()
    installMatchMedia(false)
    renderTheme()

    expect(screen.getByRole('radio', { name: 'Sistema' })).toBeChecked()
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    await user.click(screen.getByRole('radio', { name: 'Escuro' }))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(window.localStorage.getItem(themeStorageKey)).toBe('dark')

    await user.click(screen.getByRole('radio', { name: 'Claro' }))
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(window.localStorage.getItem(themeStorageKey)).toBe('light')
  })

  it('restores the saved choice and ignores the system while it is explicit', async () => {
    const user = userEvent.setup()
    const media = installMatchMedia(true)
    window.localStorage.setItem(themeStorageKey, 'light')
    renderTheme()

    expect(screen.getByRole('radio', { name: 'Claro' })).toBeChecked()
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    act(() => media.change(true))
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    await user.click(screen.getByRole('radio', { name: 'Sistema' }))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    act(() => media.change(false))
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('keeps the theme when a surrounding session flag changes', async () => {
    const user = userEvent.setup()
    installMatchMedia(false)

    function SessionFrame() {
      const [signedIn, setSignedIn] = useState(false)
      return (
        <ThemeProvider>
          <button type="button" onClick={() => setSignedIn((value) => !value)}>
            {signedIn ? 'Sair' : 'Entrar'}
          </button>
          <ThemeControl />
        </ThemeProvider>
      )
    }

    render(<SessionFrame />)
    await user.click(screen.getByRole('radio', { name: 'Escuro' }))
    await user.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(screen.getByRole('radio', { name: 'Escuro' })).toBeChecked()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Sair' }))
    expect(screen.getByRole('radio', { name: 'Escuro' })).toBeChecked()
    expect(window.localStorage.getItem(themeStorageKey)).toBe('dark')
  })
})
