import { describe, expect, it } from 'vitest'

import {
  applyTheme,
  readStoredTheme,
  resolveTheme,
  themeStorageKey,
} from '@/shared/theme/theme.ts'

describe('theme preference', () => {
  it('uses the system theme when nothing was stored', () => {
    expect(readStoredTheme(null)).toBe('system')
    expect(readStoredTheme('outro')).toBe('system')
  })

  it('keeps an explicit light or dark choice', () => {
    expect(readStoredTheme('light')).toBe('light')
    expect(readStoredTheme('dark')).toBe('dark')
    expect(readStoredTheme('system')).toBe('system')
  })

  it('follows the operating system only in system mode', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('applies the resolved theme on the document', () => {
    applyTheme('dark', false)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.dataset.resolvedTheme).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')

    applyTheme('light', true)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(document.documentElement.dataset.resolvedTheme).toBe('light')

    applyTheme('system', true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.dataset.theme).toBe('system')
    expect(themeStorageKey).toBe('padre.theme')
  })
})
