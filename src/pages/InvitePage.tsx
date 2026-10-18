import { Link, useParams } from 'react-router'

import { useSession } from '@/domains/identity/components/session.tsx'
import {
  useInvitePreview,
  useJoinMeetupByInvite,
} from '@/domains/meetups/api/queries.ts'
import { inviteAuthPath } from '@/domains/meetups/model/invite-link.ts'
import { messageFromMeetupError } from '@/domains/meetups/model/meetup.ts'
import { formatMeetupInstant } from '@/domains/meetups/model/schedule.ts'
import { buttonClassName } from '@/shared/ui/button.tsx'
import { Button } from '@/shared/ui/button.tsx'

export function InvitePage() {
  const { token = '' } = useParams()
  const path = `/convite/${token}`
  const { session, loading } = useSession()
  const preview = useInvitePreview(token)
  const join = useJoinMeetupByInvite(token)
  const detail = preview.data
  const visible = detail && detail.status !== 'unavailable' ? detail : null
  const spotLabel =
    visible?.open_spots === 1
      ? 'Há 1 vaga'
      : visible
        ? `Há ${visible.open_spots} vagas`
        : ''

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-6 px-6 py-10">
      <meta name="referrer" content="no-referrer" />
      <meta name="robots" content="noindex, nofollow" />
      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">Convite</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {visible?.title ?? 'Convite de encontro'}
        </h1>
      </header>
      {preview.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Carregando convite
        </p>
      ) : null}
      {preview.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível abrir o convite.
        </p>
      ) : null}
      {detail?.status === 'unavailable' ? (
        <p role="status">Este convite não está mais disponível.</p>
      ) : null}
      {visible ? (
        <dl className="grid gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Modalidade</dt>
            <dd>{visible.sport_name}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Formato</dt>
            <dd>{visible.format_name}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Início</dt>
            <dd>{formatMeetupInstant(visible.starts_at, visible.time_zone)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Término</dt>
            <dd>{formatMeetupInstant(visible.ends_at, visible.time_zone)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Local</dt>
            <dd>{visible.location_name}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Vagas</dt>
            <dd>{visible.open_spots === 0 ? 'Não há vagas' : spotLabel}</dd>
          </div>
        </dl>
      ) : null}
      {detail?.status === 'expired' ? (
        <p role="status">Este convite não está mais disponível.</p>
      ) : null}
      {detail?.status === 'cancelled' ? (
        <p role="status">Este encontro foi cancelado.</p>
      ) : null}
      {detail?.status === 'confirmed' ? (
        <p role="status">Sua presença já está confirmada.</p>
      ) : null}
      {visible?.participation === 'left' ||
      visible?.participation === 'removed' ? (
        <p role="status">Quem saiu não volta a participar nesta versão.</p>
      ) : null}
      {join.isSuccess ? <p role="status">Presença confirmada.</p> : null}
      {join.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {messageFromMeetupError(join.error)}
        </p>
      ) : null}
      {loading ? (
        <p role="status" className="text-sm text-muted-foreground">
          Carregando sessão
        </p>
      ) : null}
      {!loading && !session && detail?.status === 'open' ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            Entre ou crie uma conta para confirmar a presença. O cadastro não
            ocupa a vaga sozinho.
          </p>
          <Link
            className={buttonClassName()}
            to={inviteAuthPath('/entrar', path)}
          >
            Entrar
          </Link>
          <Link
            className={buttonClassName('secondary')}
            to={inviteAuthPath('/cadastrar', path)}
          >
            Criar conta
          </Link>
        </div>
      ) : null}
      {!loading &&
      session &&
      detail?.status === 'open' &&
      detail.open_spots > 0 &&
      detail.participation !== 'left' &&
      detail.participation !== 'removed' ? (
        <Button
          disabled={join.isPending}
          onClick={() => join.mutate()}
          className="w-full sm:w-auto"
        >
          {join.isPending ? 'Confirmando…' : 'Confirmar presença'}
        </Button>
      ) : null}
      {join.isSuccess ? (
        <Link className="text-sm underline" to={`/encontros/${join.data}`}>
          Ver encontro
        </Link>
      ) : detail?.status === 'confirmed' && detail.meetup_id ? (
        <Link
          className="text-sm underline"
          to={`/encontros/${detail.meetup_id}`}
        >
          Ver encontro
        </Link>
      ) : null}
    </main>
  )
}
