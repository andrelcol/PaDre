import { useState, type FormEvent } from 'react'

import { VenueLocationPicker } from '@/domains/maps/components/venue-location-picker.tsx'
import type { Coordinates } from '@/domains/maps/model/coordinates.ts'
import {
  venueDraftSchema,
  venueEditSchema,
  type VenueDraft,
  type VenueEdit,
} from '@/domains/venues/model/venue.ts'
import { Button } from '@/shared/ui/button.tsx'
import { Input } from '@/shared/ui/input.tsx'
import { Label } from '@/shared/ui/label.tsx'

const fieldClassName =
  'min-h-11 w-full rounded-md border bg-background px-3 py-2 text-sm'

type VenueFormProps = {
  mode: 'create' | 'edit'
  initial: {
    name: string
    address: string
    details: string
    latitude?: number | null
    longitude?: number | null
  }
  pending: boolean
  submitLabel: string
  onSubmit: (draft: VenueDraft | VenueEdit) => void
  onCancel?: () => void
}

export function VenueForm({
  mode,
  initial,
  pending,
  submitLabel,
  onSubmit,
  onCancel,
}: VenueFormProps) {
  const [values, setValues] = useState({
    ...initial,
    latitude: initial.latitude ?? null,
    longitude: initial.longitude ?? null,
  })
  const [formError, setFormError] = useState('')
  const point: Coordinates | null =
    values.latitude != null && values.longitude != null
      ? { latitude: values.latitude, longitude: values.longitude }
      : null

  function submit(event: FormEvent) {
    event.preventDefault()
    const parsed =
      mode === 'create'
        ? venueDraftSchema.safeParse(values)
        : venueEditSchema.safeParse({
            name: values.name,
            details: values.details,
          })
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
        <Label htmlFor={`${mode}-venue-name`}>Nome do local</Label>
        <Input
          id={`${mode}-venue-name`}
          value={values.name}
          disabled={pending}
          onChange={(event) =>
            setValues((current) => ({ ...current, name: event.target.value }))
          }
        />
      </div>
      {mode === 'create' ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="create-venue-address">Endereço do local</Label>
          <Input
            id="create-venue-address"
            value={values.address}
            disabled={pending}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                address: event.target.value,
              }))
            }
          />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Endereço: {initial.address}. Para outro lugar, arquive este local e
          cadastre um novo.
        </p>
      )}
      {mode === 'create' ? (
        <VenueLocationPicker
          point={point}
          onChange={(next) =>
            setValues((current) => ({
              ...current,
              latitude: next?.latitude ?? null,
              longitude: next?.longitude ?? null,
            }))
          }
        />
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${mode}-venue-details`}>Detalhes do local</Label>
        <textarea
          id={`${mode}-venue-details`}
          className={fieldClassName}
          value={values.details}
          disabled={pending}
          rows={3}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              details: event.target.value,
            }))
          }
        />
      </div>
      {formError ? (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
      </div>
    </form>
  )
}
