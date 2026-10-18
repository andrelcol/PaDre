import type { FormEvent } from 'react'

import { Field } from '@/domains/identity/components/fields.tsx'
import { FormAlert } from '@/domains/identity/components/auth-forms.tsx'
import {
  getTimeZones,
  visibilityLabels,
  type ProfileEdit,
} from '@/domains/identity/model/profile.ts'
import { Button } from '@/shared/ui/button.tsx'
import { Input } from '@/shared/ui/input.tsx'
import { Label } from '@/shared/ui/label.tsx'

export function ProfileForm({
  defaultValues,
  onSubmit,
  pending,
  formError,
  fieldErrors,
}: {
  defaultValues: ProfileEdit
  onSubmit: (values: ProfileEdit) => void
  pending: boolean
  formError?: string
  fieldErrors: Record<string, string>
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    onSubmit({
      displayName: String(data.get('displayName') ?? ''),
      username: String(data.get('username') ?? ''),
      visibility: String(
        data.get('visibility') ?? '',
      ) as ProfileEdit['visibility'],
      timezone: String(data.get('timezone') ?? ''),
    })
  }

  return (
    <form className="flex flex-col gap-5" noValidate onSubmit={handleSubmit}>
      <Field id="display-name" label="Nome" error={fieldErrors.displayName}>
        <Input
          id="display-name"
          name="displayName"
          autoComplete="name"
          defaultValue={defaultValues.displayName}
          aria-invalid={fieldErrors.displayName ? true : undefined}
          aria-describedby={
            fieldErrors.displayName ? 'display-name-error' : undefined
          }
        />
      </Field>
      <Field id="username" label="Nome de usuário" error={fieldErrors.username}>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          defaultValue={defaultValues.username}
          aria-invalid={fieldErrors.username ? true : undefined}
          aria-describedby={fieldErrors.username ? 'username-error' : undefined}
        />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Visibilidade</legend>
        <p className="text-sm text-muted-foreground">
          Privado fica só com você. Público mostra nome e usuário para quem está
          autenticado. O fuso não entra nessa leitura.
        </p>
        {(['private', 'public'] as const).map((value) => (
          <label key={value} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="visibility"
              value={value}
              defaultChecked={defaultValues.visibility === value}
            />
            {visibilityLabels[value]}
          </label>
        ))}
        {fieldErrors.visibility ? (
          <p className="text-sm text-destructive">{fieldErrors.visibility}</p>
        ) : null}
      </fieldset>
      <div className="flex flex-col gap-2">
        <Label htmlFor="timezone">Fuso horário</Label>
        <select
          id="timezone"
          name="timezone"
          defaultValue={defaultValues.timezone}
          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
        >
          {getTimeZones().map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
        {fieldErrors.timezone ? (
          <p id="timezone-error" className="text-sm text-destructive">
            {fieldErrors.timezone}
          </p>
        ) : null}
      </div>
      <FormAlert message={formError} />
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? 'Salvando…' : 'Salvar'}
      </Button>
    </form>
  )
}
