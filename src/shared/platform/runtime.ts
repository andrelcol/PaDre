import { Capacitor } from '@capacitor/core'

export function isNativeAndroid() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}
