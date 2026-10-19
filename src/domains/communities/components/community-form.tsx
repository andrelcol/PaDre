import { useState, type FormEvent } from 'react'

import {
  communityDraftSchema,
  communityVisibilityLabels,
  communityVisibilities,
  type CommunityDraft,
  type CommunityFormValues,
  type CommunitySport,
} from '@/domains/communities/model/community.ts'
import { Button } from '@/shared/ui/button.tsx'
import { Input } from '@/shared/ui/input.tsx'
import { Label } from '@/shared/ui/label.tsx'

const fieldClassName =
  'w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none'

type CommunityFormProps = {
  sports: CommunitySport[]
  initial: CommunityFormValues
  visibilityLocked: boolean
  pending: boolean
  submitLabel: string
  onSubmit: (draft: CommunityDraft) => void
}

export function CommunityForm({
  sports,
  initial,
  visibilityLocked,
  pending,
  submitLabel,
  onSubmit,
}: CommunityFormProps) {
  const [values, setValues] = useState(initial)
  const [formError, setFormError] = useState('')

  function toggleSport(sportId: string) {
    setValues((current) => ({
      ...current,
      sportIds: current.sportIds.includes(sportId)
        ? current.sportIds.filter((id) => id !== sportId)
        : [...current.sportIds, sportId],
    }))
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const parsed = communityDraftSchema.safeParse(values)
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Revise o formulário.')
      return
    }
    setFormError('')
    onSubmit(parsed.data)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="community-name">Nome</Label>
        <Input
          id="community-name"
          value={values.name}
          disabled={pending}
          onChange={(event) =>
            setValues((current) => ({ ...current, name: event.target.value }))
          }
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="community-description">Descrição</Label>
        <textarea
          id="community-description"
          className={fieldClassName}
          rows={4}
          value={values.description}
          disabled={pending}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              description: event.target.value,
            }))
          }
        />
      </div>
      <fieldset className="flex flex-col gap-2" disabled={pending}>
        <legend className="text-sm font-medium">Visibilidade</legend>
        {communityVisibilities.map((visibility) => (
          <label key={visibility} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="community-visibility"
              value={visibility}
              checked={values.visibility === visibility}
              disabled={visibilityLocked}
              onChange={() =>
                setValues((current) => ({ ...current, visibility }))
              }
            />
            {communityVisibilityLabels[visibility]}
          </label>
        ))}
        {visibilityLocked ? (
          <p className="text-sm text-muted-foreground">
            Só o proprietário altera a visibilidade.
          </p>
        ) : null}
      </fieldset>
      <fieldset className="flex flex-col gap-2" disabled={pending}>
        <legend className="text-sm font-medium">Modalidades</legend>
        {sports.map((sport) => (
          <label key={sport.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={values.sportIds.includes(sport.id)}
              onChange={() => toggleSport(sport.id)}
            />
            {sport.name}
          </label>
        ))}
      </fieldset>
      {formError ? (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {submitLabel}
      </Button>
    </form>
  )
}
