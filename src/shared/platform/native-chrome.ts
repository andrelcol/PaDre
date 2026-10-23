import { isNativeAndroid } from '@/shared/platform/runtime.ts'

const lightBackground = '#f4f7f6'
const darkBackground = '#243038'

export async function applyNativeChrome(resolved: 'light' | 'dark') {
  if (!isNativeAndroid()) return
  const { StatusBar, Style } = await import('@capacitor/status-bar')
  await StatusBar.setStyle({
    style: resolved === 'dark' ? Style.Dark : Style.Light,
  })
  await StatusBar.setBackgroundColor({
    color: resolved === 'dark' ? darkBackground : lightBackground,
  }).catch(() => undefined)
}
