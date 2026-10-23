import { afterEach, describe, expect, it, vi } from 'vitest'

import { deviceLocationMessage, readDeviceLocation } from './device-location.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('device location', () => {
  it('reports missing support without throwing', async () => {
    vi.stubGlobal('navigator', {})
    await expect(readDeviceLocation()).resolves.toEqual({
      ok: false,
      reason: 'unsupported',
    })
    expect(deviceLocationMessage('unsupported')).toMatch(/não informa/)
  })

  it('maps permission, timeout and unavailable errors', async () => {
    const cases = [
      { code: 1, reason: 'denied' },
      { code: 3, reason: 'timeout' },
      { code: 2, reason: 'unavailable' },
    ] as const
    for (const item of cases) {
      vi.stubGlobal('navigator', {
        geolocation: {
          getCurrentPosition: (
            _success: PositionCallback,
            failure: PositionErrorCallback,
          ) => {
            failure({
              code: item.code,
              PERMISSION_DENIED: 1,
              POSITION_UNAVAILABLE: 2,
              TIMEOUT: 3,
              message: '',
            } as GeolocationPositionError)
          },
        },
      })
      await expect(readDeviceLocation()).resolves.toEqual({
        ok: false,
        reason: item.reason,
      })
    }
  })
})
