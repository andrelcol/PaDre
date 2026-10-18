import { useState } from 'react'

import { lineupError, type MatchPlayer } from '@/domains/matches/model/match.ts'
import { Button } from '@/shared/ui/button.tsx'
import { Input } from '@/shared/ui/input.tsx'
import { Label } from '@/shared/ui/label.tsx'

type MatchLineupFormProps = {
  idPrefix: string
  roster: MatchPlayer[]
  initialSide1Name: string
  initialSide2Name: string
  initialSide1: string[]
  initialSide2: string[]
  minimum: number
  maximum: number
  pending: boolean
  onSave: (value: {
    side1Name: string
    side2Name: string
    side1: string[]
    side2: string[]
  }) => void
}

export function MatchLineupForm({
  idPrefix,
  roster,
  initialSide1Name,
  initialSide2Name,
  initialSide1,
  initialSide2,
  minimum,
  maximum,
  pending,
  onSave,
}: MatchLineupFormProps) {
  const [side1Name, setSide1Name] = useState(initialSide1Name)
  const [side2Name, setSide2Name] = useState(initialSide2Name)
  const [assignment, setAssignment] = useState<Record<string, '1' | '2' | ''>>(
    () => {
      const next: Record<string, '1' | '2' | ''> = {}
      for (const person of roster) {
        if (initialSide1.includes(person.userId)) next[person.userId] = '1'
        else if (initialSide2.includes(person.userId)) next[person.userId] = '2'
        else next[person.userId] = ''
      }
      return next
    },
  )
  const [error, setError] = useState('')
  const name1 = side1Name.trim() || 'Lado 1'
  const name2 = side2Name.trim() || 'Lado 2'

  function save() {
    const side1 = roster
      .filter((person) => assignment[person.userId] === '1')
      .map((person) => person.userId)
    const side2 = roster
      .filter((person) => assignment[person.userId] === '2')
      .map((person) => person.userId)
    const problem = lineupError(side1, side2, minimum, maximum)
    if (problem || name1.length > 40 || name2.length > 40) {
      setError(problem ?? 'O nome da equipe precisa ter até 40 caracteres.')
      return
    }
    setError('')
    onSave({ side1Name: name1, side2Name: name2, side1, side2 })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${idPrefix}-side-1-name`}>Nome da equipe 1</Label>
          <Input
            id={`${idPrefix}-side-1-name`}
            value={side1Name}
            maxLength={40}
            onChange={(event) => setSide1Name(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${idPrefix}-side-2-name`}>Nome da equipe 2</Label>
          <Input
            id={`${idPrefix}-side-2-name`}
            value={side2Name}
            maxLength={40}
            onChange={(event) => setSide2Name(event.target.value)}
          />
        </div>
      </div>
      <ul className="flex flex-col gap-3">
        {roster.map((person) => (
          <li key={person.userId}>
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">{person.username}</legend>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Choice
                  name={`${idPrefix}-side-${person.userId}`}
                  checked={assignment[person.userId] === ''}
                  label="Fora desta partida"
                  onChange={() =>
                    setAssignment((current) => ({
                      ...current,
                      [person.userId]: '',
                    }))
                  }
                />
                <Choice
                  name={`${idPrefix}-side-${person.userId}`}
                  checked={assignment[person.userId] === '1'}
                  label={name1}
                  onChange={() =>
                    setAssignment((current) => ({
                      ...current,
                      [person.userId]: '1',
                    }))
                  }
                />
                <Choice
                  name={`${idPrefix}-side-${person.userId}`}
                  checked={assignment[person.userId] === '2'}
                  label={name2}
                  onChange={() =>
                    setAssignment((current) => ({
                      ...current,
                      [person.userId]: '2',
                    }))
                  }
                />
              </div>
            </fieldset>
          </li>
        ))}
      </ul>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button disabled={pending} onClick={save} className="w-full sm:w-auto">
        {pending ? 'Salvando equipes…' : 'Salvar equipes'}
      </Button>
    </div>
  )
}

function Choice({
  name,
  checked,
  label,
  onChange,
}: {
  name: string
  checked: boolean
  label: string
  onChange: () => void
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <input type="radio" name={name} checked={checked} onChange={onChange} />
      {label}
    </label>
  )
}
