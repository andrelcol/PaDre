import { useState, type FormEvent } from 'react'

import {
  useOwnPersonalDetails,
  useUpdatePersonalDetails,
} from '@/domains/identity/api/queries.ts'
import {
  avatarUnavailableMessage,
  heightLabel,
  sexLabel,
  sexLabels,
  uploadAvatar,
  type PersonalDetails,
} from '@/domains/identity/model/personal-details.ts'
import { Button } from '@/shared/ui/button.tsx'
import { Input } from '@/shared/ui/input.tsx'
import { Label } from '@/shared/ui/label.tsx'

export function SportsIdentity({
  displayName,
  username,
  sports,
}: {
  displayName: string
  username: string
  sports: string[]
}) {
  const details = useOwnPersonalDetails(true)
  const initial = displayName.slice(0, 1).toUpperCase()

  return (
    <section
      className="flex flex-col gap-4 rounded-2xl border bg-card p-5"
      aria-labelledby="sports-identity"
    >
      <div className="flex items-center gap-4">
        <span
          aria-hidden="true"
          className="inline-flex size-20 items-center justify-center rounded-full bg-ink text-3xl font-bold text-ink-foreground"
        >
          {initial}
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium tracking-wide text-pitch">
            PaDre — Sports Club
          </p>
          <h2 id="sports-identity" className="text-2xl font-semibold">
            {displayName}
          </h2>
          <p className="text-sm text-muted-foreground">@{username}</p>
        </div>
      </div>
      <p className="text-sm">
        {sports.length > 0
          ? sports.join(' · ')
          : 'Nenhuma modalidade com partida confirmada.'}
      </p>
      {details.data ? (
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Altura</dt>
            <dd>{heightLabel(details.data.height_cm)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Sexo</dt>
            <dd>{sexLabel(details.data.sex)}</dd>
          </div>
        </dl>
      ) : null}
      <p className="text-sm text-muted-foreground">
        {avatarUnavailableMessage}
      </p>
    </section>
  )
}

export function PersonalDetailsForm() {
  const details = useOwnPersonalDetails(true)
  const update = useUpdatePersonalDetails()
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  if (!details.data) {
    return (
      <p className="text-sm text-muted-foreground">
        Carregando dados esportivos
      </p>
    )
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const height = String(data.get('height') ?? '').trim()
    const sex = String(data.get('sex') ?? '')
    setError('')
    setNotice('')
    try {
      await update.mutateAsync({
        heightCm: height === '' ? null : Number(height),
        sex: sex === '' ? null : (sex as PersonalDetails['sex']),
        showHeight: data.get('showHeight') === 'on',
        showSex: data.get('showSex') === 'on',
        showAvatar: data.get('showAvatar') === 'on',
      })
      setNotice('Dados esportivos salvos.')
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Não foi possível salvar.',
      )
    }
  }

  async function onFile(file: File | undefined) {
    setNotice('')
    setError('')
    if (!file) return
    try {
      await uploadAvatar(file)
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : avatarUnavailableMessage,
      )
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => void onSubmit(event)}
    >
      <h2 className="text-lg font-semibold">Perfil esportivo</h2>
      <div className="flex flex-col gap-1">
        <Label htmlFor="avatar-file">Foto</Label>
        <Input
          id="avatar-file"
          name="avatar"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => void onFile(event.target.files?.[0])}
        />
        <p className="text-sm text-muted-foreground">
          JPEG, PNG ou WebP, até 2 MB. A foto só aparece para outras pessoas se
          você autorizar e o perfil for público.
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="height">Altura em centímetros</Label>
        <Input
          id="height"
          name="height"
          inputMode="numeric"
          defaultValue={details.data.height_cm ?? ''}
          placeholder="Não informado"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="sex">Sexo</Label>
        <select
          id="sex"
          name="sex"
          defaultValue={details.data.sex ?? ''}
          className="h-10 rounded-md border bg-background px-3 text-sm"
        >
          <option value="">Prefiro não informar</option>
          {Object.entries(sexLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="showHeight"
          defaultChecked={details.data.show_height}
        />
        Mostrar altura no perfil público
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="showSex"
          defaultChecked={details.data.show_sex}
        />
        Mostrar sexo no perfil público
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="showAvatar"
          defaultChecked={details.data.show_avatar}
        />
        Permitir a foto nas cartinhas e no perfil público
      </label>
      {notice ? (
        <p role="status" className="text-sm text-pitch">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={update.isPending}>
        {update.isPending ? 'Salvando…' : 'Salvar dados esportivos'}
      </Button>
    </form>
  )
}
