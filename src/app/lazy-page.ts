import { createElement, type ComponentType } from 'react'

const reloadKey = 'padre:module-reload'

export function lazyPage(
  load: () => Promise<Record<string, unknown>>,
  name: string,
) {
  let component: ComponentType | undefined
  let pending: Promise<void> | undefined

  function Page() {
    if (!component) {
      if (!pending) {
        pending = load()
          .then((module) => {
            const loaded = module[name]
            if (typeof loaded !== 'function') {
              throw new Error(`A página ${name} não está disponível.`)
            }
            component = loaded as ComponentType
          })
          .catch((error: unknown) => {
            pending = undefined
            if (isChunkLoadError(error) && reloadOnce()) {
              return new Promise<void>(() => undefined)
            }
            throw error
          })
      }
      throw pending
    }
    return createElement(component)
  }

  Page.displayName = name
  return Page
}

export function isChunkLoadError(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  return (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('error loading dynamically imported module') ||
    message.includes('Importing a module script failed')
  )
}

export function clearChunkReload() {
  window.setTimeout(() => {
    sessionStorage.removeItem(reloadKey)
  }, 5000)
}

function reloadOnce() {
  if (sessionStorage.getItem(reloadKey)) return false
  sessionStorage.setItem(reloadKey, '1')
  window.location.reload()
  return true
}
