import { Link } from 'react-router'

import { useOwnProfile } from '@/domains/identity/api/queries.ts'
import { useMyStatistics } from '@/domains/statistics/api/queries.ts'
import { PerformanceSection } from '@/domains/statistics/components/performance-section.tsx'
import { RelationshipsSection } from '@/domains/statistics/components/relationships-section.tsx'
import { useSession } from '@/domains/identity/components/session.tsx'
import {
  formatProfileTimestamp,
  visibilityLabels,
} from '@/domains/identity/model/profile.ts'
import { buttonClassName } from '@/shared/ui/button.tsx'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui/card.tsx'

export function ProfilePage() {
  const { session } = useSession()
  const userId = session?.user.id
  const profileQuery = useOwnProfile(userId)
  const statistics = useMyStatistics(Boolean(userId))

  if (profileQuery.isLoading) {
    return (
      <p
        className="px-6 py-16 text-sm text-muted-foreground"
        aria-live="polite"
      >
        Carregando perfil
      </p>
    )
  }

  if (profileQuery.isError || !profileQuery.data) {
    return (
      <p role="alert" className="px-6 py-16 text-sm text-destructive">
        {profileQuery.error instanceof Error
          ? profileQuery.error.message
          : 'Não foi possível carregar o perfil.'}
      </p>
    )
  }

  const profile = profileQuery.data

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">Meu perfil</h1>
          <p className="text-sm text-muted-foreground">{session?.user.email}</p>
        </div>
        <Link to="/perfil/editar" className={buttonClassName('primary')}>
          Editar perfil
        </Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{profile.displayName}</CardTitle>
          <CardDescription>@{profile.username}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Visibilidade</dt>
              <dd>{visibilityLabels[profile.visibility]}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Fuso horário</dt>
              <dd>{profile.timezone}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Atualizado</dt>
              <dd>
                {formatProfileTimestamp(profile.updatedAt, profile.timezone)}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
      <PerformanceSection
        title="Desempenho esportivo"
        loading={statistics.isPending}
        error={statistics.isError ? statistics.error : null}
        sports={statistics.data?.sports}
        empty="Você ainda não tem partidas confirmadas."
        note="Calculado a partir das partidas confirmadas. O número não é editável."
      />
      <RelationshipsSection
        loading={statistics.isPending}
        error={statistics.isError ? statistics.error : null}
        sports={statistics.data?.sports}
      />
    </main>
  )
}
