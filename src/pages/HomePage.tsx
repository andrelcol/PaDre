import { initialSports } from '@/domains/sports/initial-sports.ts'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui/card.tsx'

export function HomePage() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-10 px-6 py-16">
      <header className="flex flex-col gap-3">
        <p className="text-sm font-medium text-muted-foreground">Fundação</p>
        <h1 className="text-4xl font-semibold tracking-tight">PaDre</h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          Plataforma para organizar encontros esportivos presenciais.
        </p>
      </header>

      <section className="flex flex-col gap-4" aria-labelledby="sports-heading">
        <div className="flex flex-col gap-1">
          <h2 id="sports-heading" className="text-xl font-semibold">
            Modalidades iniciais
          </h2>
          <p className="text-sm text-muted-foreground">
            Cada uma terá formato e regra de pontuação próprios.
          </p>
        </div>
        <ul
          aria-label="Modalidades iniciais"
          className="grid gap-3 sm:grid-cols-2"
        >
          {initialSports.map((sport) => (
            <li key={sport.slug}>
              <Card>
                <CardHeader>
                  <CardTitle>{sport.name}</CardTitle>
                  <CardDescription>Catálogo inicial</CardDescription>
                </CardHeader>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-sm text-muted-foreground">
        Contas, encontros e partidas entram nas próximas etapas.
      </p>
    </main>
  )
}
