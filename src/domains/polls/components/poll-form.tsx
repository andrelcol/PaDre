import { useState, type FormEvent } from 'react'

import {
  buildPollInput,
  pollKindLabels,
  pollKinds,
  pollTimeZone,
  selectionModeLabels,
  selectionModes,
  type PollDraft,
  type PollKind,
  type PollWrite,
  type SelectionMode,
} from '@/domains/polls/model/poll.ts'
import { Button } from '@/shared/ui/button.tsx'
import { Input } from '@/shared/ui/input.tsx'
import { Label } from '@/shared/ui/label.tsx'

const fieldClassName =
  'w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none'

type SportChoice = { id: string; name: string }

type PollFormProps = {
  sports: SportChoice[]
  initial: PollDraft
  pending: boolean
  onSubmit: (draft: PollWrite) => void
}

export function PollForm({
  sports,
  initial,
  pending,
  onSubmit,
}: PollFormProps) {
  const [values, setValues] = useState(initial)
  const [sportIds, setSportIds] = useState<string[]>([])
  const [formError, setFormError] = useState('')

  function submit(event: FormEvent) {
    event.preventDefault()
    const draft: PollDraft =
      values.kind === 'sport'
        ? {
            ...values,
            options: sportIds.map((sportId) => ({
              label: sports.find((sport) => sport.id === sportId)?.name ?? '',
              sportId,
            })),
          }
        : values
    const built = buildPollInput(draft)
    if (!built.ok) {
      setFormError(built.error)
      return
    }
    setFormError('')
    onSubmit(built.value)
  }

  function updateOption(
    index: number,
    patch: Partial<PollDraft['options'][number]>,
  ) {
    setValues((current) => ({
      ...current,
      options: current.options.map((option, optionIndex) =>
        optionIndex === index ? { ...option, ...patch } : option,
      ),
    }))
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <div className="flex flex-col gap-2">
        <Label htmlFor="poll-question">Pergunta</Label>
        <Input
          id="poll-question"
          value={values.question}
          maxLength={140}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              question: event.target.value,
            }))
          }
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="poll-description">Descrição</Label>
        <textarea
          id="poll-description"
          className={fieldClassName}
          value={values.description}
          maxLength={500}
          rows={2}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              description: event.target.value,
            }))
          }
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="poll-kind">Categoria</Label>
          <select
            id="poll-kind"
            className={fieldClassName}
            value={values.kind}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                kind: event.target.value as PollKind,
              }))
            }
          >
            {pollKinds.map((kind) => (
              <option key={kind} value={kind}>
                {pollKindLabels[kind]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="poll-mode">Votação</Label>
          <select
            id="poll-mode"
            className={fieldClassName}
            value={values.selectionMode}
            onChange={(event) => {
              const selectionMode = event.target.value as SelectionMode
              setValues((current) => ({
                ...current,
                selectionMode,
                maxSelections: selectionMode === 'single' ? 1 : 2,
              }))
            }}
          >
            {selectionModes.map((mode) => (
              <option key={mode} value={mode}>
                {selectionModeLabels[mode]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {values.selectionMode === 'multiple' ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="poll-max">Máximo de escolhas</Label>
          <Input
            id="poll-max"
            type="number"
            min={1}
            max={10}
            value={values.maxSelections}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                maxSelections: Number(event.target.value),
              }))
            }
          />
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="poll-close-date">Data de encerramento</Label>
          <Input
            id="poll-close-date"
            type="date"
            value={values.date}
            onChange={(event) =>
              setValues((current) => ({ ...current, date: event.target.value }))
            }
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="poll-close-time">Hora de encerramento</Label>
          <Input
            id="poll-close-time"
            type="time"
            value={values.time}
            onChange={(event) =>
              setValues((current) => ({ ...current, time: event.target.value }))
            }
          />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        O encerramento usa o horário de Brasília ({pollTimeZone}).
      </p>
      {values.kind === 'sport' ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">
            Modalidades da enquete
          </legend>
          {sports.length < 2 ? (
            <p className="text-sm text-muted-foreground">
              Associe pelo menos duas modalidades à comunidade.
            </p>
          ) : (
            sports.map((sport) => (
              <label key={sport.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={sportIds.includes(sport.id)}
                  onChange={(event) =>
                    setSportIds((current) =>
                      event.target.checked
                        ? [...current, sport.id]
                        : current.filter((id) => id !== sport.id),
                    )
                  }
                />
                {sport.name}
              </label>
            ))
          )}
        </fieldset>
      ) : (
        <div className="flex flex-col gap-3">
          {values.options.map((option, index) => (
            <div key={index} className="flex flex-col gap-2">
              <Label htmlFor={`poll-option-${index}`}>Opção {index + 1}</Label>
              <Input
                id={`poll-option-${index}`}
                value={option.label}
                maxLength={80}
                onChange={(event) =>
                  updateOption(index, { label: event.target.value })
                }
              />
              {values.kind === 'schedule' ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor={`poll-option-date-${index}`}>
                      Data da opção {index + 1}
                    </Label>
                    <Input
                      id={`poll-option-date-${index}`}
                      type="date"
                      value={option.date ?? ''}
                      onChange={(event) =>
                        updateOption(index, { date: event.target.value })
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor={`poll-option-time-${index}`}>
                      Hora da opção {index + 1}
                    </Label>
                    <Input
                      id={`poll-option-time-${index}`}
                      type="time"
                      value={option.time ?? ''}
                      onChange={(event) =>
                        updateOption(index, { time: event.target.value })
                      }
                    />
                  </div>
                </div>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  setValues((current) => ({
                    ...current,
                    options: current.options.filter(
                      (_, optionIndex) => optionIndex !== index,
                    ),
                  }))
                }
              >
                Remover opção {index + 1}
              </Button>
            </div>
          ))}
          {values.options.length < 10 ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                setValues((current) => ({
                  ...current,
                  options: [...current.options, { label: '' }],
                }))
              }
            >
              Adicionar opção
            </Button>
          ) : null}
          {values.kind === 'schedule' ? (
            <p className="text-sm text-muted-foreground">
              Sem data, a opção fica só como texto e não vira um instante.
            </p>
          ) : null}
          {values.kind === 'location' ? (
            <p className="text-sm text-muted-foreground">
              O nome é manual. Dois textos iguais não são o mesmo lugar.
            </p>
          ) : null}
        </div>
      )}
      {formError ? (
        <p className="text-sm text-destructive" role="alert">
          {formError}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        Publicar enquete
      </Button>
    </form>
  )
}
