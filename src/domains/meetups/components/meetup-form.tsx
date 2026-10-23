import { useState, type FormEvent } from 'react'

import { VenueLocationPicker } from '@/domains/maps/components/venue-location-picker.tsx'
import { VenueMapPreview } from '@/domains/maps/components/venue-map-preview.tsx'
import { getTimeZones } from '@/domains/identity/model/profile.ts'
import {
  meetupDraftSchema,
  type MeetupDraft,
  type MeetupFormValues,
} from '@/domains/meetups/model/meetup.ts'
import { describeScoringRule } from '@/domains/sports/model/scoring.ts'
import type { CatalogSport } from '@/domains/sports/model/catalog.ts'
import { Button } from '@/shared/ui/button.tsx'
import { Input } from '@/shared/ui/input.tsx'
import { Label } from '@/shared/ui/label.tsx'

const fieldClassName =
  'h-10 w-full rounded-md border bg-background px-3 text-sm'

export type MeetupVenueOption = {
  id: string
  name: string
  address: string
  details: string
  latitude: number | null
  longitude: number | null
}

type MeetupFormProps = {
  sports: CatalogSport[]
  venues: MeetupVenueOption[]
  initial: MeetupFormValues
  structureLocked: boolean
  pending: boolean
  submitLabel: string
  onSubmit: (draft: MeetupDraft) => void
}

export function MeetupForm({
  sports,
  venues,
  initial,
  structureLocked,
  pending,
  submitLabel,
  onSubmit,
}: MeetupFormProps) {
  const [values, setValues] = useState(initial)
  const [formError, setFormError] = useState('')
  const currentMissing =
    values.venueId.length > 0 &&
    !venues.some((venue) => venue.id === values.venueId)
  const selectable = [
    ...venues,
    ...(currentMissing
      ? [
          {
            id: values.venueId,
            name: values.locationName || 'Local atual',
            address: values.locationAddress,
            details: values.locationDetails,
            latitude: values.locationLatitude,
            longitude: values.locationLongitude,
          },
        ]
      : []),
  ]
  const selected = selectable.find((venue) => venue.id === values.venueId)
  const sport = sports.find((item) => item.id === values.sportId) ?? sports[0]
  const format =
    sport?.formats.find((item) => item.id === values.sportFormatId) ??
    sport?.formats[0]

  function update(partial: Partial<MeetupFormValues>) {
    setValues((current) => ({ ...current, ...partial }))
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const parsed = meetupDraftSchema.safeParse({
      ...values,
      sportFormatId: format?.id ?? '',
      scoringRuleVersionId: format?.rule.id ?? '',
      maxParticipants: Number(values.maxParticipants),
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
        <Label htmlFor="meetup-sport">Modalidade</Label>
        <select
          id="meetup-sport"
          className={fieldClassName}
          value={sport?.id ?? ''}
          disabled={structureLocked || pending}
          onChange={(event) => {
            const next = sports.find((item) => item.id === event.target.value)
            update({
              sportId: event.target.value,
              sportFormatId: next?.formats[0]?.id ?? '',
            })
          }}
        >
          {sports.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="meetup-format">Formato</Label>
        <select
          id="meetup-format"
          className={fieldClassName}
          value={format?.id ?? ''}
          disabled={structureLocked || pending}
          onChange={(event) => update({ sportFormatId: event.target.value })}
        >
          {sport?.formats.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </div>
      {format ? (
        <div className="rounded-xl border p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Regra deste formato</p>
          <ul className="mt-2 flex flex-col gap-1">
            {describeScoringRule(format.rule).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {structureLocked ? (
        <p className="text-sm text-muted-foreground">
          Com outros confirmados, modalidade, regra, horário e local ficam
          travados.
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="meetup-title">Título</Label>
        <Input
          id="meetup-title"
          value={values.title}
          onChange={(event) => update({ title: event.target.value })}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="meetup-description">Descrição</Label>
        <textarea
          id="meetup-description"
          value={values.description}
          onChange={(event) => update({ description: event.target.value })}
          className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="meetup-start-date">Data de início</Label>
          <Input
            id="meetup-start-date"
            type="date"
            value={values.startDate}
            disabled={structureLocked || pending}
            onChange={(event) => update({ startDate: event.target.value })}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="meetup-start-time">Horário de início</Label>
          <Input
            id="meetup-start-time"
            type="time"
            value={values.startTime}
            disabled={structureLocked || pending}
            onChange={(event) => update({ startTime: event.target.value })}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="meetup-end-date">Data de término</Label>
          <Input
            id="meetup-end-date"
            type="date"
            value={values.endDate}
            disabled={structureLocked || pending}
            onChange={(event) => update({ endDate: event.target.value })}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="meetup-end-time">Horário de término</Label>
          <Input
            id="meetup-end-time"
            type="time"
            value={values.endTime}
            disabled={structureLocked || pending}
            onChange={(event) => update({ endTime: event.target.value })}
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="meetup-timezone">Fuso do encontro</Label>
        <select
          id="meetup-timezone"
          className={fieldClassName}
          value={values.timeZone}
          disabled={structureLocked || pending}
          onChange={(event) => update({ timeZone: event.target.value })}
        >
          {getTimeZones().map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
      </div>
      <fieldset
        className="flex flex-col gap-3"
        disabled={structureLocked || pending}
      >
        <legend className="text-sm font-medium">Local</legend>
        <div className="flex flex-wrap gap-4">
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="radio"
              name="place-mode"
              value="venue"
              checked={values.placeMode === 'venue'}
              onChange={() => update({ placeMode: 'venue' })}
            />
            Cadastrado
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="radio"
              name="place-mode"
              value="manual"
              checked={values.placeMode === 'manual'}
              onChange={() => update({ placeMode: 'manual', venueId: '' })}
            />
            Manual
          </label>
        </div>
        {values.placeMode === 'venue' ? (
          selectable.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum local ativo disponível. Use um local manual.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor="meetup-venue">Local cadastrado</Label>
              <select
                id="meetup-venue"
                className={fieldClassName}
                value={values.venueId}
                onChange={(event) => {
                  const venue = selectable.find(
                    (item) => item.id === event.target.value,
                  )
                  update({
                    venueId: event.target.value,
                    locationName: venue?.name ?? '',
                    locationAddress: venue?.address ?? '',
                    locationDetails: venue?.details ?? '',
                  })
                }}
              >
                <option value="">Escolha um local</option>
                {selectable.map((venue) => (
                  <option key={venue.id} value={venue.id}>
                    {venue.name}
                  </option>
                ))}
              </select>
              {selected ? (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-muted-foreground">
                    {selected.address}
                    {selected.details ? ` · ${selected.details}` : ''}
                  </p>
                  {selected.latitude != null && selected.longitude != null ? (
                    <VenueMapPreview
                      id={selected.id}
                      name={selected.name}
                      latitude={selected.latitude}
                      longitude={selected.longitude}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Este local ainda não tem posição no mapa. O encontro
                      guarda o nome e o endereço.
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          )
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <Label htmlFor="meetup-location">Local</Label>
              <Input
                id="meetup-location"
                value={values.locationName}
                onChange={(event) =>
                  update({ locationName: event.target.value })
                }
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="meetup-address">Endereço</Label>
              <Input
                id="meetup-address"
                value={values.locationAddress}
                onChange={(event) =>
                  update({ locationAddress: event.target.value })
                }
              />
            </div>
            <VenueLocationPicker
              point={
                values.locationLatitude != null &&
                values.locationLongitude != null
                  ? {
                      latitude: values.locationLatitude,
                      longitude: values.locationLongitude,
                    }
                  : null
              }
              onChange={(point) =>
                update({
                  locationLatitude: point?.latitude ?? null,
                  locationLongitude: point?.longitude ?? null,
                })
              }
            />
            <div className="flex flex-col gap-2">
              <Label htmlFor="meetup-details">Detalhes</Label>
              <Input
                id="meetup-details"
                value={values.locationDetails}
                onChange={(event) =>
                  update({ locationDetails: event.target.value })
                }
              />
            </div>
          </>
        )}
      </fieldset>
      <div className="flex flex-col gap-2">
        <Label htmlFor="meetup-capacity">
          Capacidade, incluindo quem organiza
        </Label>
        <Input
          id="meetup-capacity"
          type="number"
          min={2}
          max={64}
          value={values.maxParticipants}
          onChange={(event) =>
            update({ maxParticipants: Number(event.target.value) })
          }
        />
      </div>
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
