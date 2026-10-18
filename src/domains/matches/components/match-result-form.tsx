import { useMemo, useState } from 'react'

import { outcomeLabel, type MatchTeam } from '@/domains/matches/model/match.ts'
import {
  gameBasedResultSchema,
  goalBasedResultSchema,
  resolveOutcome,
  setBasedResultSchema,
  type MatchResultPayload,
  type ScoringSnapshot,
} from '@/domains/matches/model/outcome.ts'
import { Button } from '@/shared/ui/button.tsx'
import { Input } from '@/shared/ui/input.tsx'
import { Label } from '@/shared/ui/label.tsx'

type MatchResultFormProps = {
  idPrefix: string
  rule: ScoringSnapshot
  teams: MatchTeam[]
  initial: unknown
  pending: boolean
  submitLabel: string
  onSubmit: (payload: MatchResultPayload) => void
}

export function MatchResultForm(props: MatchResultFormProps) {
  if (props.rule.rule_type === 'goal_based') {
    return <GoalForm {...props} rule={props.rule} />
  }
  if (props.rule.rule_type === 'game_based') {
    return <GameForm {...props} rule={props.rule} />
  }
  return <SetForm {...props} rule={props.rule} />
}

function SetForm({
  idPrefix,
  rule,
  teams,
  initial,
  pending,
  submitLabel,
  onSubmit,
}: MatchResultFormProps & {
  rule: Extract<ScoringSnapshot, { rule_type: 'set_based' }>
}) {
  const maximum = rule.config.sets_to_win * 2 - 1
  const [sets, setSets] = useState<[string, string][]>(() =>
    initialSets(initial),
  )
  const [attempted, setAttempted] = useState(false)
  const names = sideNames(teams)
  const preview = useMemo(() => completeSets(sets, rule), [sets, rule])

  function save() {
    setAttempted(true)
    const parsed = setBasedResultSchema.safeParse({
      sets: sets.map(([left, right]) => [Number(left), Number(right)]),
    })
    if (!parsed.success) return
    const resolved = resolveOutcome(rule, parsed.data)
    if (!resolved.ok) return
    onSubmit(parsed.data)
  }

  return (
    <div className="flex flex-col gap-3">
      {sets.map((set, index) => {
        const deciding =
          index === maximum - 1 && rule.config.deciding_set_points !== null
        return (
          <fieldset key={index} className="grid gap-2 sm:grid-cols-2">
            <legend className="text-sm font-medium">
              {deciding
                ? `Set decisivo, até ${rule.config.deciding_set_points}`
                : `Set ${index + 1}`}
            </legend>
            <ScoreField
              id={`${idPrefix}-set-${index}-side-1`}
              label={`Pontos de ${names[0]} no set ${index + 1}`}
              value={set[0]}
              onChange={(value) => updatePair(setSets, index, 0, value)}
            />
            <ScoreField
              id={`${idPrefix}-set-${index}-side-2`}
              label={`Pontos de ${names[1]} no set ${index + 1}`}
              value={set[1]}
              onChange={(value) => updatePair(setSets, index, 1, value)}
            />
          </fieldset>
        )
      })}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="secondary"
          disabled={pending || sets.length >= maximum}
          onClick={() => setSets((current) => [...current, ['', '']])}
        >
          Adicionar set
        </Button>
        {sets.length > 1 ? (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => setSets((current) => current.slice(0, -1))}
          >
            Remover último set
          </Button>
        ) : null}
      </div>
      <Preview attempted={attempted} resolution={preview} teams={teams} />
      <Button disabled={pending} onClick={save} className="w-full sm:w-auto">
        {pending ? 'Salvando placar…' : submitLabel}
      </Button>
    </div>
  )
}

function GoalForm({
  idPrefix,
  rule,
  teams,
  initial,
  pending,
  submitLabel,
  onSubmit,
}: MatchResultFormProps & {
  rule: Extract<ScoringSnapshot, { rule_type: 'goal_based' }>
}) {
  const parsed = goalBasedResultSchema.safeParse(initial)
  const [goals, setGoals] = useState<[string, string]>(
    parsed.success
      ? [String(parsed.data.goals[0]), String(parsed.data.goals[1])]
      : ['', ''],
  )
  const [attempted, setAttempted] = useState(false)
  const names = sideNames(teams)
  const preview = useMemo(() => {
    const left = numberOrNull(goals[0])
    const right = numberOrNull(goals[1])
    if (left === null || right === null) return null
    return resolveOutcome(rule, { goals: [left, right] })
  }, [goals, rule])
  const note = rule.config.allows_draw
    ? 'Empate é um resultado válido neste formato.'
    : 'Este formato não admite empate. A versão atual da regra não guarda um placar separado de prorrogação ou pênaltis.'

  function save() {
    setAttempted(true)
    const body = {
      goals: [Number(goals[0]), Number(goals[1])] as [number, number],
    }
    const checked = goalBasedResultSchema.safeParse(body)
    if (!checked.success) return
    const resolved = resolveOutcome(rule, checked.data)
    if (!resolved.ok) return
    onSubmit(checked.data)
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{note}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <ScoreField
          id={`${idPrefix}-goals-side-1`}
          label={`Gols de ${names[0]}`}
          value={goals[0]}
          onChange={(value) => setGoals([value, goals[1]])}
        />
        <ScoreField
          id={`${idPrefix}-goals-side-2`}
          label={`Gols de ${names[1]}`}
          value={goals[1]}
          onChange={(value) => setGoals([goals[0], value])}
        />
      </div>
      <Preview attempted={attempted} resolution={preview} teams={teams} />
      <Button disabled={pending} onClick={save} className="w-full sm:w-auto">
        {pending ? 'Salvando placar…' : submitLabel}
      </Button>
    </div>
  )
}

type GameDraft =
  | {
      kind: 'games'
      left: string
      right: string
      tiebreak: boolean
      tieLeft: string
      tieRight: string
    }
  | { kind: 'points'; left: string; right: string }

function GameForm({
  idPrefix,
  rule,
  teams,
  initial,
  pending,
  submitLabel,
  onSubmit,
}: MatchResultFormProps & {
  rule: Extract<ScoringSnapshot, { rule_type: 'game_based' }>
}) {
  const maximum = rule.config.sets_to_win * 2 - 1
  const [sets, setSets] = useState<GameDraft[]>(() =>
    initialGames(initial, rule),
  )
  const [attempted, setAttempted] = useState(false)
  const names = sideNames(teams)
  const built = useMemo(() => gamePayload(sets), [sets])
  const preview = useMemo(
    () =>
      built.incomplete ? null : resolveOutcome(rule, { sets: built.payload }),
    [built, rule],
  )
  const nextIsDeciding =
    sets.length === maximum - 1 && rule.config.deciding_set_points !== null

  function save() {
    setAttempted(true)
    if (built.incomplete) return
    const checked = gameBasedResultSchema.safeParse({ sets: built.payload })
    if (!checked.success) return
    const resolved = resolveOutcome(rule, checked.data)
    if (!resolved.ok) return
    onSubmit(checked.data)
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {rule.config.tiebreak_points === null
          ? 'Esta versão não define tiebreak.'
          : `O tiebreak vai a ${rule.config.tiebreak_points} pontos, sem diferença mínima extra.`}
        {rule.config.deciding_set_points !== null
          ? ` O set decisivo é um super tiebreak a ${rule.config.deciding_set_points}.`
          : ''}
      </p>
      {sets.map((set, index) =>
        set.kind === 'points' ? (
          <fieldset key={index} className="grid gap-2 sm:grid-cols-2">
            <legend className="text-sm font-medium">Set decisivo</legend>
            <ScoreField
              id={`${idPrefix}-game-points-${index}-1`}
              label={`Pontos de ${names[0]} no set decisivo`}
              value={set.left}
              onChange={(value) =>
                updateGame(setSets, index, { ...set, left: value })
              }
            />
            <ScoreField
              id={`${idPrefix}-game-points-${index}-2`}
              label={`Pontos de ${names[1]} no set decisivo`}
              value={set.right}
              onChange={(value) =>
                updateGame(setSets, index, { ...set, right: value })
              }
            />
          </fieldset>
        ) : (
          <fieldset key={index} className="flex flex-col gap-2">
            <legend className="text-sm font-medium">Set {index + 1}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <ScoreField
                id={`${idPrefix}-games-${index}-1`}
                label={`Games de ${names[0]} no set ${index + 1}`}
                value={set.left}
                onChange={(value) =>
                  updateGame(setSets, index, { ...set, left: value })
                }
              />
              <ScoreField
                id={`${idPrefix}-games-${index}-2`}
                label={`Games de ${names[1]} no set ${index + 1}`}
                value={set.right}
                onChange={(value) =>
                  updateGame(setSets, index, { ...set, right: value })
                }
              />
            </div>
            {rule.config.tiebreak_points !== null ? (
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={set.tiebreak}
                  onChange={(event) =>
                    updateGame(setSets, index, {
                      ...set,
                      tiebreak: event.target.checked,
                    })
                  }
                />
                Teve tiebreak no set {index + 1}
              </label>
            ) : null}
            {set.tiebreak ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <ScoreField
                  id={`${idPrefix}-tie-${index}-1`}
                  label={`Pontos do tiebreak de ${names[0]} no set ${index + 1}`}
                  value={set.tieLeft}
                  onChange={(value) =>
                    updateGame(setSets, index, { ...set, tieLeft: value })
                  }
                />
                <ScoreField
                  id={`${idPrefix}-tie-${index}-2`}
                  label={`Pontos do tiebreak de ${names[1]} no set ${index + 1}`}
                  value={set.tieRight}
                  onChange={(value) =>
                    updateGame(setSets, index, { ...set, tieRight: value })
                  }
                />
              </div>
            ) : null}
          </fieldset>
        ),
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="secondary"
          disabled={pending || sets.length >= maximum}
          onClick={() =>
            setSets((current) => [
              ...current,
              nextIsDeciding
                ? { kind: 'points', left: '', right: '' }
                : emptyGames(),
            ])
          }
        >
          {nextIsDeciding ? 'Adicionar set decisivo' : 'Adicionar set'}
        </Button>
        {sets.length > 1 ? (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => setSets((current) => current.slice(0, -1))}
          >
            Remover último set
          </Button>
        ) : null}
      </div>
      <Preview attempted={attempted} resolution={preview} teams={teams} />
      <Button disabled={pending} onClick={save} className="w-full sm:w-auto">
        {pending ? 'Salvando placar…' : submitLabel}
      </Button>
    </div>
  )
}

function ScoreField({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

function Preview({
  attempted,
  resolution,
  teams,
}: {
  attempted: boolean
  resolution: ReturnType<typeof resolveOutcome> | null
  teams: MatchTeam[]
}) {
  if (resolution?.ok) {
    return <p className="text-sm">{outcomeLabel(resolution.outcome, teams)}</p>
  }
  if (!attempted || !resolution) return null
  return (
    <p role="alert" className="text-sm text-destructive">
      {resolution.message}
    </p>
  )
}

function sideNames(teams: MatchTeam[]) {
  return [
    teams.find((team) => team.side === 1)?.name ?? 'Lado 1',
    teams.find((team) => team.side === 2)?.name ?? 'Lado 2',
  ] as const
}

function numberOrNull(value: string) {
  if (!/^\d+$/.test(value)) return null
  return Number(value)
}

function updatePair(
  setSets: (value: (current: [string, string][]) => [string, string][]) => void,
  index: number,
  side: 0 | 1,
  value: string,
) {
  setSets((current) =>
    current.map((pair, pairIndex) => {
      if (pairIndex !== index) return pair
      const next: [string, string] = [pair[0], pair[1]]
      next[side] = value
      return next
    }),
  )
}

function initialSets(payload: unknown): [string, string][] {
  const parsed = setBasedResultSchema.safeParse(payload)
  if (!parsed.success || parsed.data.sets.length === 0) return [['', '']]
  return parsed.data.sets.map(([left, right]) => [String(left), String(right)])
}

function emptyGames(): GameDraft {
  return {
    kind: 'games',
    left: '',
    right: '',
    tiebreak: false,
    tieLeft: '',
    tieRight: '',
  }
}

function initialGames(
  payload: unknown,
  rule: Extract<ScoringSnapshot, { rule_type: 'game_based' }>,
): GameDraft[] {
  const parsed = gameBasedResultSchema.safeParse(payload)
  if (!parsed.success || parsed.data.sets.length === 0) {
    return rule.config.deciding_set_points !== null &&
      rule.config.sets_to_win === 1
      ? [{ kind: 'points', left: '', right: '' }]
      : [emptyGames()]
  }
  return parsed.data.sets.map((set) => {
    if ('points' in set) {
      return {
        kind: 'points',
        left: String(set.points[0]),
        right: String(set.points[1]),
      }
    }
    return {
      kind: 'games',
      left: String(set.games[0]),
      right: String(set.games[1]),
      tiebreak: set.tiebreak !== null,
      tieLeft: set.tiebreak ? String(set.tiebreak[0]) : '',
      tieRight: set.tiebreak ? String(set.tiebreak[1]) : '',
    }
  })
}

function updateGame(
  setSets: (value: (current: GameDraft[]) => GameDraft[]) => void,
  index: number,
  next: GameDraft,
) {
  setSets((current) =>
    current.map((set, setIndex) => (setIndex === index ? next : set)),
  )
}

function completeSets(
  sets: [string, string][],
  rule: Extract<ScoringSnapshot, { rule_type: 'set_based' }>,
) {
  const numeric = sets.map(
    ([left, right]) => [numberOrNull(left), numberOrNull(right)] as const,
  )
  if (numeric.some(([left, right]) => left === null || right === null)) {
    return null
  }
  return resolveOutcome(rule, {
    sets: numeric.map(([left, right]) => [left ?? 0, right ?? 0]),
  })
}

function gamePayload(sets: GameDraft[]) {
  const payload: (
    | { games: [number, number]; tiebreak: [number, number] | null }
    | { points: [number, number] }
  )[] = []
  for (const set of sets) {
    const left = numberOrNull(set.left)
    const right = numberOrNull(set.right)
    if (left === null || right === null) return { payload, incomplete: true }
    if (set.kind === 'points') {
      payload.push({ points: [left, right] })
      continue
    }
    if (!set.tiebreak) {
      payload.push({ games: [left, right], tiebreak: null })
      continue
    }
    const tieLeft = numberOrNull(set.tieLeft)
    const tieRight = numberOrNull(set.tieRight)
    if (tieLeft === null || tieRight === null) {
      return { payload, incomplete: true }
    }
    payload.push({ games: [left, right], tiebreak: [tieLeft, tieRight] })
  }
  return { payload, incomplete: false }
}
