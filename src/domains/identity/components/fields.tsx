import type { ReactNode } from 'react'

import { Input } from '@/shared/ui/input.tsx'
import { Label } from '@/shared/ui/label.tsx'

export function Field({
  id,
  label,
  error,
  children,
}: {
  id: string
  label: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function TextField({
  id,
  label,
  name,
  type = 'text',
  autoComplete,
  defaultValue,
  error,
}: {
  id: string
  label: string
  name: string
  type?: string
  autoComplete?: string
  defaultValue?: string
  error?: string
}) {
  return (
    <Field id={id} label={label} error={error}>
      <Input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
    </Field>
  )
}
