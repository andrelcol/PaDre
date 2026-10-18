const datePattern = /^\d{4}-\d{2}-\d{2}$/
const timePattern = /^\d{2}:\d{2}$/

export function zonedWallClockToUtc(
  date: string,
  time: string,
  timeZone: string,
) {
  if (!datePattern.test(date) || !timePattern.test(time)) {
    throw new Error('invalid wall clock')
  }

  const guessed = new Date(`${date}T${time}:00.000Z`)
  const shown = wallClockInZone(guessed, timeZone)
  const shownAsUtc = new Date(`${shown.date}T${shown.time}:00.000Z`)
  return new Date(
    guessed.getTime() - (shownAsUtc.getTime() - guessed.getTime()),
  )
}

export function wallClockInZone(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(instant)
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? ''
  const hour = value('hour') === '24' ? '00' : value('hour')
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    time: `${hour}:${value('minute')}`,
  }
}

export function formatMeetupInstant(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso))
}

export function addDaysToDate(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number)
  const next = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1))
  next.setUTCDate(next.getUTCDate() + days)
  return next.toISOString().slice(0, 10)
}
