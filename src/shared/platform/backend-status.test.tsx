import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { readSupabaseEnv } from '@/shared/lib/env.ts'

import { BackendStatus } from './backend-status.tsx'

vi.mock('@/shared/lib/env.ts', () => ({
  readSupabaseEnv: vi.fn(),
}))

const env = {
  url: 'https://example.supabase.co',
  anonKey: 'sb_publishable_test',
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('BackendStatus', () => {
  it('sends the public client key and stays quiet when health succeeds', async () => {
    vi.mocked(readSupabaseEnv).mockReturnValue(env)
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)

    render(<BackendStatus />)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'https://example.supabase.co/auth/v1/health',
        expect.objectContaining({
          headers: { apikey: env.anonKey },
          signal: expect.any(AbortSignal),
        }),
      )
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows the unreachable message when health is rejected', async () => {
    vi.mocked(readSupabaseEnv).mockReturnValue(env)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    )

    render(<BackendStatus />)

    expect(await screen.findByRole('status')).toHaveTextContent(
      'o servidor não respondeu',
    )
  })

  it('does not call health when the public client is missing', () => {
    vi.mocked(readSupabaseEnv).mockReturnValue(null)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    render(<BackendStatus />)

    expect(screen.getByRole('status')).toHaveTextContent(
      'o servidor não está configurado',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
