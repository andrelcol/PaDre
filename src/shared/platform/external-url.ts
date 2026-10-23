import { isNativeAndroid } from '@/shared/platform/runtime.ts'

export async function openExternalUrl(href: string) {
  if (!href.startsWith('https://')) return
  if (!isNativeAndroid()) {
    window.open(href, '_blank', 'noopener,noreferrer')
    return
  }
  const { Browser } = await import('@capacitor/browser')
  await Browser.open({ url: href })
}
