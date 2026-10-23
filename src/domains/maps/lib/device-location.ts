import { isNativeAndroid } from '@/shared/platform/runtime.ts'

export type DeviceLocationReason =
  'denied' | 'unavailable' | 'timeout' | 'unsupported'

export type DeviceLocationResult =
  | { ok: true; latitude: number; longitude: number }
  | { ok: false; reason: DeviceLocationReason }

/**
 * Leitura única, só depois de um pedido explícito.
 * Não grava a posição e não observa o aparelho.
 * No Android, usa o Capacitor Geolocation só neste pedido.
 * Precisão alta fica desligada: uma posição aproximada já serve.
 */
export function readDeviceLocation(): Promise<DeviceLocationResult> {
  if (isNativeAndroid()) return readAndroidLocation()
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve({ ok: false, reason: 'unsupported' })
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          ok: true,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        })
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          resolve({ ok: false, reason: 'denied' })
          return
        }
        if (error.code === error.TIMEOUT) {
          resolve({ ok: false, reason: 'timeout' })
          return
        }
        resolve({ ok: false, reason: 'unavailable' })
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 0 },
    )
  })
}

async function readAndroidLocation(): Promise<DeviceLocationResult> {
  try {
    const { Geolocation } = await import('@capacitor/geolocation')
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: false,
      timeout: 8000,
      maximumAge: 0,
    })
    return {
      ok: true,
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : ''
    if (message.includes('denied') || message.includes('permission')) {
      return { ok: false, reason: 'denied' }
    }
    if (message.includes('timeout')) return { ok: false, reason: 'timeout' }
    return { ok: false, reason: 'unavailable' }
  }
}

export function deviceLocationMessage(reason: DeviceLocationReason) {
  if (reason === 'denied') return 'A permissão de localização foi recusada.'
  if (reason === 'timeout') return 'A localização demorou demais.'
  if (reason === 'unsupported') {
    return 'Este aparelho não informa a localização.'
  }
  return 'A localização não está disponível.'
}
