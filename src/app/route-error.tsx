import { isRouteErrorResponse, Link, useRouteError } from 'react-router'

import { isChunkLoadError } from '@/app/lazy-page.ts'
import { buttonClassName } from '@/shared/ui/button.tsx'

export function RouteError() {
  const error = useRouteError()
  const detail = errorDetail(error)

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-lg flex-col justify-center gap-4 px-6 py-16">
      <p className="text-sm font-semibold text-primary">PaDre</p>
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        Não foi possível abrir esta página
      </h1>
      <p className="text-muted-foreground">
        A navegação foi interrompida. Recarregue para continuar.
      </p>
      {detail ? (
        <p role="alert" className="text-sm text-destructive">
          {detail}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={buttonClassName('primary')}
          onClick={() => window.location.reload()}
        >
          Recarregar
        </button>
        <Link to="/" className={buttonClassName('secondary')}>
          Ir para o início
        </Link>
      </div>
    </main>
  )
}

function errorDetail(error: unknown) {
  if (isChunkLoadError(error)) return ''
  if (isRouteErrorResponse(error)) return `${error.status} ${error.statusText}`
  if (error instanceof Error && error.message) return error.message
  return ''
}
