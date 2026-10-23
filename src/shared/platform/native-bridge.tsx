import { useEffect } from 'react'
import { useNavigate } from 'react-router'

import { appPathFromUrl } from '@/shared/platform/app-link.ts'
import { isNativeAndroid } from '@/shared/platform/runtime.ts'

export function NativeBridge() {
  const navigate = useNavigate()

  useEffect(() => {
    if (!isNativeAndroid()) return
    let removed = false
    const handles: Array<{ remove: () => Promise<void> }> = []

    void (async () => {
      const [{ App }, { Keyboard }] = await Promise.all([
        import('@capacitor/app'),
        import('@capacitor/keyboard'),
      ])
      if (removed) return

      handles.push(
        await App.addListener('backButton', () => {
          if (document.documentElement.dataset.keyboard === 'open') {
            void Keyboard.hide()
            return
          }
          const index = historyIndex()
          if (index > 0) {
            window.history.back()
            return
          }
          void App.exitApp()
        }),
      )
      handles.push(
        await App.addListener('appUrlOpen', (event) => {
          const path = appPathFromUrl(event.url)
          if (path) void navigate(path)
        }),
      )
      const launch = await App.getLaunchUrl()
      const path = launch?.url ? appPathFromUrl(launch.url) : null
      if (path) void navigate(path)

      handles.push(
        await Keyboard.addListener('keyboardDidShow', (info) => {
          document.documentElement.dataset.keyboard = 'open'
          document.documentElement.style.setProperty(
            '--padre-keyboard-inset',
            `${info.keyboardHeight}px`,
          )
        }),
      )
      handles.push(
        await Keyboard.addListener('keyboardDidHide', () => {
          delete document.documentElement.dataset.keyboard
          document.documentElement.style.setProperty(
            '--padre-keyboard-inset',
            '0px',
          )
        }),
      )
    })()

    return () => {
      removed = true
      for (const handle of handles) void handle.remove()
    }
  }, [navigate])

  return null
}

function historyIndex() {
  const state = window.history.state as { idx?: number } | null
  return typeof state?.idx === 'number' ? state.idx : 0
}
