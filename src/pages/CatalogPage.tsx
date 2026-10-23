import { CatalogBrowser } from '@/domains/sports/components/catalog-browser.tsx'

export function CatalogPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Catálogo</h1>
        <p className="text-muted-foreground">
          Modalidades, formatos e a pontuação de cada formato.
        </p>
      </header>
      <CatalogBrowser />
    </main>
  )
}
