import { describe, expect, it } from 'vitest'

import {
  buildPollInput,
  describePollResult,
  formatPollPercent,
  type CommunityPoll,
} from '@/domains/polls/model/poll.ts'

const base = {
  id: '00000000-0000-4000-8000-000000000010',
  question: 'Qual esporte?',
  description: '',
  kind: 'sport',
  selectionMode: 'single',
  maxSelections: 1,
  status: 'closed',
  effectiveStatus: 'closed',
  closesAt: '2026-10-20T18:00:00.000Z',
  closedAt: '2026-10-20T18:00:00.000Z',
  createdAt: '2026-10-19T18:00:00.000Z',
  createdByUsername: 'ana',
  participantCount: 0,
  myOptionIds: [],
  canClose: false,
  canCancel: false,
  options: [
    option('00000000-0000-4000-8000-000000000011', 'Vôlei', false),
    option('00000000-0000-4000-8000-000000000012', 'Futsal', false),
  ],
} satisfies CommunityPoll

describe('poll results', () => {
  it('does not invent a winner when nobody voted', () => {
    expect(describePollResult(base)).toBe('Ninguém votou.')
  })

  it('names every option tied for first', () => {
    const poll: CommunityPoll = {
      ...base,
      participantCount: 2,
      options: [
        option(base.options[0]!.id, 'Vôlei', true, 1, 50),
        option(base.options[1]!.id, 'Futsal', true, 1, 50),
      ],
    }
    expect(describePollResult(poll)).toBe('Empate entre as mais votadas.')
  })

  it('explains a cancelled poll instead of a decision', () => {
    expect(
      describePollResult({
        ...base,
        effectiveStatus: 'cancelled',
        participantCount: 2,
      }),
    ).toBe('Enquete cancelada. O resultado não vale como decisão do grupo.')
  })

  it('formats a percent above 100 without treating it as an error', () => {
    expect(formatPollPercent(150)).toBe('150%')
    expect(formatPollPercent(66.7)).toBe('66,7%')
  })
})

describe('poll draft', () => {
  it('builds a sport poll from catalog ids and a single choice', () => {
    const result = buildPollInput({
      question: '  Qual esporte?  ',
      description: '',
      kind: 'sport',
      selectionMode: 'single',
      maxSelections: 4,
      date: '2026-10-21',
      time: '18:00',
      options: [
        { label: '', sportId: 'a1000000-0000-4000-8000-000000000001' },
        { label: '', sportId: 'a1000000-0000-4000-8000-000000000004' },
      ],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.question).toBe('Qual esporte?')
    expect(result.value.maxSelections).toBe(1)
    expect(result.value.options).toEqual([
      { sport_id: 'a1000000-0000-4000-8000-000000000001' },
      { sport_id: 'a1000000-0000-4000-8000-000000000004' },
    ])
  })

  it('keeps a schedule option as text when it has no date', () => {
    const result = buildPollInput({
      question: 'Qual horário?',
      description: '',
      kind: 'schedule',
      selectionMode: 'multiple',
      maxSelections: 2,
      date: '2026-10-21',
      time: '18:00',
      options: [{ label: 'Sábado 9h' }, { label: '  sábado   9h ' }],
    })
    expect(result.ok).toBe(false)
  })

  it('rejects a location name used twice after normalization', () => {
    const result = buildPollInput({
      question: 'Onde jogamos?',
      description: '',
      kind: 'location',
      selectionMode: 'single',
      maxSelections: 1,
      date: '2026-10-21',
      time: '18:00',
      options: [{ label: 'Quadra central' }, { label: 'quadra   central' }],
    })
    expect(result.ok).toBe(false)
  })
})

function option(
  id: string,
  label: string,
  leading: boolean,
  voteCount = 0,
  percent: number | null = null,
) {
  return {
    id,
    label,
    position: 1,
    sportId: null,
    startsAt: null,
    timeZone: null,
    voteCount,
    percent,
    leading,
  }
}
