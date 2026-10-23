import { Link } from 'react-router'

import { MeetupList } from '@/domains/meetups/components/meetup-list.tsx'
import { useMeetups } from '@/domains/meetups/api/queries.ts'
import { splitMeetups } from '@/domains/meetups/model/meetup.ts'
import { useSession } from '@/domains/identity/components/session.tsx'
import { buttonClassName } from '@/shared/ui/button.tsx'

export function MeetupsPage() {
  const { session } = useSession()
  const meetups = useMeetups(Boolean(session))
  const groups = splitMeetups(meetups.data ?? [])

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">Encontros</h1>
          <p className="text-muted-foreground">
            Organize um horário e convide amigos.
          </p>
        </div>
        <Link to="/encontros/novo" className={buttonClassName('primary')}>
          Novo encontro
        </Link>
      </header>
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
      {meetups.isSuccess ? (
        <>
          <MeetupList
            title="Meus próximos encontros"
            empty="Nenhum encontro futuro."
            items={groups.upcoming}
          />
          <MeetupList
            title="Encontros que organizo"
            empty="Nenhum encontro futuro que você organiza."
            items={groups.organizing}
          />
          <MeetupList
            title="Convites pendentes"
            empty="Nenhum convite pendente."
            items={groups.invited}
          />
          <MeetupList
            title="Anteriores ou cancelados"
            empty="Nenhum encontro anterior ou cancelado."
            items={groups.earlier}
          />
        </>
      ) : null}
    </main>
  )
}
