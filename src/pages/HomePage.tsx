import { Link } from 'react-router'

import { useMyCommunities } from '@/domains/communities/api/queries.ts'
import { useSession } from '@/domains/identity/components/session.tsx'
import { useMeetups } from '@/domains/meetups/api/queries.ts'
import { splitMeetups } from '@/domains/meetups/model/meetup.ts'
import { CatalogBrowser } from '@/domains/sports/components/catalog-browser.tsx'
import { useMyStatistics } from '@/domains/statistics/api/queries.ts'
import { buttonClassName } from '@/shared/ui/button.tsx'

export function HomePage() {
  const { session, loading } = useSession()

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-5xl px-6 py-10">
        <p role="status" className="text-sm text-muted-foreground">
          Carregando
        </p>
      </main>
    )
  }

  if (!session) return <GuestHome />
  return <MemberHome />
}

function GuestHome() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-10">
      <header className="flex flex-col gap-4 rounded-3xl bg-ink px-6 py-8 text-ink-foreground">
        <p className="text-sm font-semibold tracking-wide text-pitch">
          PaDre — Sports Club
        </p>
        <h1 className="text-4xl font-bold tracking-tight">PaDre</h1>
        <p className="max-w-xl text-lg">
          Organize encontros presenciais, jogue com amigos, participe de
          comunidades e acompanhe o que já foi confirmado em quadra.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link to="/cadastrar" className={buttonClassName('primary')}>
            Criar conta
          </Link>
          <Link
            to="/entrar"
            className="inline-flex min-h-11 items-center rounded-full bg-ink-foreground/15 px-4 text-sm font-semibold"
          >
            Entrar
          </Link>
        </div>
      </header>

      <section
        className="grid gap-3 sm:grid-cols-2"
        aria-label="O que dá para fazer"
      >
        {[
          ['Encontros', 'Marque horário, local e vagas.'],
          ['Comunidades', 'Reúna o grupo e publique o jogo.'],
          ['Partidas', 'Registre o placar e confirme com o outro lado.'],
          ['Estatísticas', 'Veja o desempenho que nasceu desses resultados.'],
        ].map(([title, text]) => (
          <article key={title} className="rounded-2xl border bg-card p-4">
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-sm text-muted-foreground">{text}</p>
          </article>
        ))}
      </section>

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
    </main>
  )
}

function MemberHome() {
  const meetups = useMeetups(true)
  const communities = useMyCommunities(true)
  const statistics = useMyStatistics(true)
  const groups = splitMeetups(meetups.data ?? [])
  const next = groups.upcoming[0]
  const invites = groups.invited.length
  const sport = statistics.data?.sports[0]

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-primary">Seu clube</p>
        <h1 className="text-4xl font-bold tracking-tight">PaDre</h1>
        <p className="text-muted-foreground">
          O que está marcado e o que já foi jogado.
        </p>
      </header>
      <section className="grid gap-3 sm:grid-cols-2" aria-label="Ações rápidas">
        <Link to="/encontros/novo" className={buttonClassName('primary')}>
          Criar encontro
        </Link>
        <Link to="/comunidades" className={buttonClassName('secondary')}>
          Encontrar comunidade
        </Link>
        <Link to="/amigos" className={buttonClassName('secondary')}>
          Adicionar amigo
        </Link>
        <Link to="/perfil" className={buttonClassName('secondary')}>
          Consultar estatísticas
        </Link>
      </section>
      <section className="grid gap-4 lg:grid-cols-3" aria-label="Resumo">
        <article className="rounded-2xl border bg-card p-4 lg:col-span-2">
          <h2 className="text-lg font-semibold">Próximo encontro</h2>
          {meetups.isPending ? (
            <p role="status" className="text-sm text-muted-foreground">
              Carregando encontros
            </p>
          ) : null}
          {meetups.isError ? (
            <p role="alert" className="text-sm text-destructive">
              Não foi possível carregar os encontros.
            </p>
          ) : null}
          {meetups.data && !next ? (
            <p className="text-sm text-muted-foreground">
              Você ainda não tem um encontro marcado.
            </p>
          ) : null}
          {next ? (
            <Link to={`/encontros/${next.id}`} className="mt-2 block">
              <p className="text-xl font-semibold">{next.title}</p>
              <p className="text-sm text-muted-foreground">
                {next.sportName} · {next.locationName}
              </p>
            </Link>
          ) : null}
          {invites > 0 ? (
            <p className="mt-3 text-sm">
              {invites === 1
                ? '1 convite pendente.'
                : `${invites} convites pendentes.`}
            </p>
          ) : null}
        </article>
        <article className="rounded-2xl bg-ink p-4 text-ink-foreground">
          <h2 className="text-lg font-semibold">Desempenho</h2>
          {statistics.isPending ? (
            <p role="status" className="text-sm">
              Carregando estatísticas
            </p>
          ) : null}
          {sport ? (
            <p className="mt-3">
              <span className="block text-4xl font-bold text-pitch">
                {sport.wins}
              </span>
              <span className="text-sm">
                vitórias em {sport.sport_name}, em {sport.matches_played}{' '}
                partidas confirmadas.
              </span>
            </p>
          ) : statistics.data ? (
            <p className="mt-3 text-sm">
              Ainda não há partida confirmada no seu histórico.
            </p>
          ) : null}
          <p className="mt-4 text-sm">
            {communities.data
              ? `${communities.data.length} comunidades suas.`
              : 'Comunidades carregando.'}
          </p>
        </article>
      </section>
    </main>
  )
}
