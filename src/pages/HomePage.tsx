import { CatalogBrowser } from '@/domains/sports/components/catalog-browser.tsx'

export function HomePage() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-10 px-6 py-16">
      <header className="flex flex-col gap-3">
        <p className="text-sm font-medium text-muted-foreground">
          Encontros esportivos
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">PaDre</h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          Plataforma para organizar encontros esportivos presenciais.
        </p>
      </header>

      <section className="flex flex-col gap-4" aria-labelledby="sports-heading">
        <div className="flex flex-col gap-1">
          <h2 id="sports-heading" className="text-xl font-semibold">
            Modalidades
          </h2>
          <p className="text-sm text-muted-foreground">
            Escolha um formato para ver a pontuação.
          </p>
        </div>
        <CatalogBrowser />
      </section>

      <p className="text-sm text-muted-foreground">
        Encontros e partidas entram nas próximas etapas.
      </p>
    </main>
  )
}
