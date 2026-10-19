import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

type Env = { url: string; anonKey: string; databaseUrl: string }
type Account = { username: string; userId: string }
type Format = { formatId: string; ruleId: string }

const env = loadEnv()
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
let ana: Account
let bia: Account
let caio: Account
let davi: Account
let eva: Account
let beach: Format
let beachFour: Format
let futsal: Format
let indoor: Format
let tennis: Format

beforeAll(async () => {
  ;[ana, bia, caio, davi, eva] = await Promise.all([
    mustSignup('ana', 'Ana'),
    mustSignup('bia', 'Bia'),
    mustSignup('caio', 'Caio'),
    mustSignup('davi', 'Davi'),
    mustSignup('eva', 'Eva'),
  ])
  const catalog = await admin((client) =>
    client.query<{ slug: string; format_id: string; rule_id: string }>(
      `select sport_formats.slug, sport_formats.id as format_id,
              scoring_rule_versions.id as rule_id
       from public.sport_formats
       join public.scoring_rule_versions
         on scoring_rule_versions.format_id = sport_formats.id
        and scoring_rule_versions.active
       where sport_formats.slug in (
         'beach-2x2', 'beach-4x4', 'futsal-5x5', 'indoor-4x4', 'doubles'
       )`,
    ),
  )
  const bySlug = (slug: string) => {
    const row = catalog.rows.find((item) => item.slug === slug)
    return { formatId: row!.format_id, ruleId: row!.rule_id }
  }
  beach = bySlug('beach-2x2')
  beachFour = bySlug('beach-4x4')
  futsal = bySlug('futsal-5x5')
  indoor = bySlug('indoor-4x4')
  tennis = bySlug('doubles')
})

afterAll(async () => {
  await admin(async (client) => {
    const emails = [`%${suffix}@padre.test`]
    await client.query(
      `delete from public.meetups
       where organizer_id in (select id from auth.users where email like $1)`,
      emails,
    )
    await client.query(`delete from auth.users where email like $1`, emails)
  })
})

describe('statistics', () => {
  it('projects only a confirmed lineup, once per player', async () => {
    const meetupId = await createMeetup(beach, 5)
    await joinAll(meetupId, [bia, caio, davi])
    await startMeetup(meetupId)
    const matchId = await createMatch(meetupId)
    expect(await contributionCount(matchId)).toBe(0)
    await lineup(matchId, [ana, bia], [caio, davi])
    await result(matchId, {
      sets: [
        [21, 15],
        [21, 18],
      ],
    })
    expect(await contributionCount(matchId)).toBe(0)
    await asUser(ana.userId, (client) =>
      client.query(`select public.submit_match($1)`, [matchId]),
    )
    expect(await contributionCount(matchId)).toBe(0)
    await asUser(caio.userId, (client) =>
      client.query(`select public.dispute_match($1)`, [matchId]),
    )
    expect(await contributionCount(matchId)).toBe(0)

    const revised = await createMatch(meetupId)
    await lineup(revised, [ana, bia], [caio, davi])
    await result(revised, {
      sets: [
        [21, 12],
        [21, 16],
      ],
    })
    await asUser(ana.userId, (client) =>
      client.query(`select public.submit_match($1)`, [revised]),
    )
    await asUser(bia.userId, (client) =>
      client.query(`select public.confirm_match($1)`, [revised]),
    )
    expect(await contributionCount(revised)).toBe(0)
    await asUser(caio.userId, (client) =>
      client.query(`select public.confirm_match($1)`, [revised]),
    )

    const rows = await contributions(revised)
    expect(rows).toHaveLength(4)
    expect(rows.find((row) => row.user_id === ana.userId)?.result).toBe('win')
    expect(rows.find((row) => row.user_id === bia.userId)?.result).toBe('win')
    expect(rows.find((row) => row.user_id === caio.userId)?.result).toBe('loss')
    expect(rows.find((row) => row.user_id === davi.userId)?.result).toBe('loss')
    expect(rows.find((row) => row.user_id === eva.userId)).toBeUndefined()
    expect(rows.find((row) => row.user_id === ana.userId)).toMatchObject({
      points_for: 42,
      points_against: 28,
      sets_won: 2,
      sets_lost: 0,
      goals_for: null,
      games_won: null,
    })

    const second = await createMatch(meetupId)
    await lineup(second, [ana, caio], [bia, davi])
    await result(second, {
      sets: [
        [15, 21],
        [18, 21],
      ],
    })
    await submitAndConfirm(second, ana.userId, bia.userId)
    const swapped = await contributions(second)
    expect(swapped.find((row) => row.user_id === ana.userId)?.result).toBe(
      'loss',
    )
    expect(swapped.find((row) => row.user_id === bia.userId)?.result).toBe(
      'win',
    )
    expect(await contributionCount(revised)).toBe(4)

    const played = await admin((client) =>
      client.query<{ count: string }>(
        `select count(*)::text as count
         from public.match_player_statistics
         where user_id = $1 and match_id = any($2::uuid[])`,
        [ana.userId, [revised, second]],
      ),
    )
    expect(played.rows[0]?.count).toBe('2')

    for (let time = 0; time < 3; time += 1) {
      const written = await admin((client) =>
        client.query<{ count: number }>(
          `select private.project_match_statistics($1) as count`,
          [revised],
        ),
      )
      expect(written.rows[0]?.count).toBe(4)
    }
    expect(await contributions(revised)).toEqual(rows)

    const raced = await raceProject(revised)
    expect(raced.errors).toEqual([])
    expect(await contributionCount(revised)).toBe(4)
  })

  it('keeps volleyball points, futsal goals and beach-tennis games apart', async () => {
    const extras = await Promise.all(
      ['felipe', 'gabi', 'helo', 'ivo', 'joao'].map((label) =>
        mustSignup(label, label),
      ),
    )
    const eight = [ana, bia, caio, davi, eva, ...extras.slice(0, 3)]
    const ten = [...eight, ...extras.slice(3)]

    const indoorMeetup = await createMeetup(indoor, 8)
    await joinAll(indoorMeetup, eight.slice(1))
    await startMeetup(indoorMeetup)
    const indoorMatch = await createMatch(indoorMeetup)
    await lineup(indoorMatch, eight.slice(0, 4), eight.slice(4))
    await result(indoorMatch, {
      sets: [
        [25, 20],
        [25, 18],
        [25, 22],
      ],
    })
    await submitAndConfirm(indoorMatch, ana.userId, eva.userId)
    expect(
      (await contributions(indoorMatch)).find(
        (row) => row.user_id === ana.userId,
      ),
    ).toMatchObject({
      points_for: 75,
      points_against: 60,
      sets_won: 3,
      sets_lost: 0,
      goals_for: null,
    })

    const futsalMeetup = await createMeetup(futsal, 10)
    await joinAll(futsalMeetup, ten.slice(1))
    await startMeetup(futsalMeetup)
    const draw = await createMatch(futsalMeetup)
    await lineup(draw, ten.slice(0, 5), ten.slice(5))
    await result(draw, { goals: [2, 2] })
    await submitAndConfirm(draw, ana.userId, extras[3]!.userId)
    const drawRows = await contributions(draw)
    expect(drawRows.every((row) => row.result === 'draw')).toBe(true)
    expect(drawRows.find((row) => row.user_id === ana.userId)).toMatchObject({
      goals_for: 2,
      goals_against: 2,
      points_for: null,
      sets_won: null,
    })

    const tennisMeetup = await createMeetup(tennis, 4)
    await joinAll(tennisMeetup, [bia, caio, davi])
    await startMeetup(tennisMeetup)
    const tiebreak = await createMatch(tennisMeetup)
    await lineup(tiebreak, [ana, bia], [caio, davi])
    await result(tiebreak, {
      sets: [
        { games: [6, 4], tiebreak: null },
        { games: [6, 6], tiebreak: [7, 5] },
      ],
    })
    await submitAndConfirm(tiebreak, ana.userId, caio.userId)
    expect(
      (await contributions(tiebreak)).find((row) => row.user_id === ana.userId),
    ).toMatchObject({
      games_won: 12,
      games_lost: 10,
      sets_won: 2,
      sets_lost: 0,
      deciding_points_for: 0,
      deciding_points_against: 0,
      points_for: null,
    })

    const superTie = await createMatch(tennisMeetup)
    await lineup(superTie, [ana, bia], [caio, davi])
    await result(superTie, {
      sets: [
        { games: [6, 4], tiebreak: null },
        { games: [4, 6], tiebreak: null },
        { points: [10, 6] },
      ],
    })
    await submitAndConfirm(superTie, ana.userId, caio.userId)
    expect(
      (await contributions(superTie)).find((row) => row.user_id === ana.userId),
    ).toMatchObject({
      games_won: 10,
      games_lost: 10,
      sets_won: 2,
      sets_lost: 1,
      deciding_points_for: 10,
      deciding_points_against: 6,
    })

    const own = await asUser(ana.userId, (client) =>
      client.query<{
        stats: {
          sports: {
            sport_name: string
            rule_type: string
            goals_for?: number
            points_for?: number
          }[]
        }
      }>(`select public.my_statistics() as stats`),
    )
    const sports = own.rows[0]!.stats.sports
    const volleyball = sports.find((sport) => sport.sport_name === 'Vôlei')
    const futsalSport = sports.find((sport) => sport.sport_name === 'Futsal')
    expect(volleyball?.points_for).toBeGreaterThan(0)
    expect(volleyball?.goals_for).toBeUndefined()
    expect(futsalSport?.goals_for).toBeGreaterThan(0)
    expect(futsalSport?.points_for).toBeUndefined()
    expect(volleyball?.rule_type).not.toBe(futsalSport?.rule_type)
  })

  it('filters formats of the same sport and survives cancel or leaving', async () => {
    const extras = await Promise.all(
      ['lia', 'mia', 'nino'].map((label) => mustSignup(label, label)),
    )
    const duo = await createMeetup(beach, 4)
    await joinAll(duo, [bia, caio, davi])
    await startMeetup(duo)
    const small = await createMatch(duo)
    await lineup(small, [ana, bia], [caio, davi])
    await result(small, {
      sets: [
        [21, 15],
        [21, 18],
      ],
    })
    await submitAndConfirm(small, ana.userId, caio.userId)

    const quad = await createMeetup(beachFour, 8)
    await joinAll(quad, [bia, caio, davi, eva, ...extras])
    await startMeetup(quad)
    const large = await createMatch(quad)
    await lineup(large, [ana, bia, caio, davi], [eva, ...extras])
    await result(large, {
      sets: [
        [18, 21],
        [16, 21],
      ],
    })
    await submitAndConfirm(large, ana.userId, eva.userId)

    const own = await asUser(ana.userId, (client) =>
      client.query<{
        stats: {
          sports: {
            sport_name: string
            matches_played: number
            formats: { format_name: string; matches_played: number }[]
          }[]
        }
      }>(`select public.my_statistics() as stats`),
    )
    const sand = own.rows[0]!.stats.sports.find(
      (sport) => sport.sport_name === 'Vôlei de areia',
    )
    const names = sand?.formats.map((format) => format.format_name).sort()
    expect(names).toEqual(['Vôlei de areia 2x2', 'Vôlei de areia 4x4'].sort())
    expect(sand?.matches_played).toBe(
      (sand?.formats ?? []).reduce(
        (sum, format) => sum + format.matches_played,
        0,
      ),
    )

    await asUser(bia.userId, (client) =>
      client.query(`select public.leave_meetup($1)`, [duo]),
    )
    expect(
      (await contributions(small)).find((row) => row.user_id === bia.userId)
        ?.result,
    ).toBe('win')
    await expect(
      asUser(bia.userId, (client) =>
        client.query(`select public.meetup_participant_statistics($1)`, [duo]),
      ),
    ).rejects.toMatchObject({ code: '42501' })

    await asUser(ana.userId, (client) =>
      client.query(`select public.cancel_meetup($1)`, [quad]),
    )
    expect(await contributionCount(large)).toBe(8)

    const before = await contributionCount(small)
    await admin(async (client) => {
      await client.query('begin')
      await client.query(
        `select set_config('padre.statistic_write', 'on', true)`,
      )
      const deleted = await client.query(
        `delete from public.match_player_statistics where match_id = $1`,
        [small],
      )
      await client.query('commit')
      expect(deleted.rowCount).toBeGreaterThan(0)
    })
    await admin((client) =>
      client.query(`select private.reproject_all_statistics()`),
    )
    expect(await contributionCount(small)).toBe(before)
  })

  it('keeps statistics private to the reader and to confirmed teammates', async () => {
    const meetupId = await createMeetup(beach, 5)
    await joinAll(meetupId, [bia, caio, davi])
    const requested = await asUser(ana.userId, (client) =>
      client.query<{ id: string }>(
        `select id from public.request_friendship($1)`,
        [eva.username],
      ),
    )
    await asUser(eva.userId, (client) =>
      client.query(`select public.respond_to_friendship($1, 'accept')`, [
        requested.rows[0]!.id,
      ]),
    )
    const invited = await asUser(ana.userId, (client) =>
      client.query<{ id: string }>(
        `select id from public.invite_to_meetup($1, $2)`,
        [meetupId, eva.username],
      ),
    )
    await expect(
      asUser(eva.userId, (client) =>
        client.query(`select public.meetup_participant_statistics($1)`, [
          meetupId,
        ]),
      ),
    ).rejects.toMatchObject({ code: '42501' })

    await startMeetup(meetupId)
    const matchId = await createMatch(meetupId)
    await lineup(matchId, [ana, bia], [caio, davi])
    await result(matchId, {
      sets: [
        [21, 10],
        [21, 12],
      ],
    })
    await submitAndConfirm(matchId, ana.userId, caio.userId)
    await expect(
      asUser(eva.userId, (client) =>
        client.query(`select public.meetup_participant_statistics($1)`, [
          meetupId,
        ]),
      ),
    ).rejects.toMatchObject({ code: '42501' })

    const own = await asUser(ana.userId, (client) =>
      client.query<{ stats: { sports: unknown[] } }>(
        `select public.my_statistics() as stats`,
      ),
    )
    expect(own.rows[0]?.stats.sports.length).toBeGreaterThan(0)

    await shiftMeetup(
      meetupId,
      `now() + interval '2 days'`,
      `now() + interval '2 days 2 hours'`,
    )
    await asUser(eva.userId, (client) =>
      client.query(`select public.respond_to_meetup_invitation($1, 'accept')`, [
        invited.rows[0]!.id,
      ]),
    )
    const shared = await asUser(eva.userId, (client) =>
      client.query<{ stats: string }>(
        `select public.meetup_participant_statistics($1)::text as stats`,
        [meetupId],
      ),
    )
    expect(shared.rows[0]?.stats).toContain(ana.username)
    expect(shared.rows[0]?.stats).not.toContain('@')
    expect(shared.rows[0]?.stats).not.toContain('email')

    await asUser(eva.userId, (client) =>
      client.query(`select public.leave_meetup($1)`, [meetupId]),
    )
    await expect(
      asUser(eva.userId, (client) =>
        client.query(`select public.meetup_participant_statistics($1)`, [
          meetupId,
        ]),
      ),
    ).rejects.toMatchObject({ code: '42501' })

    await expect(
      asUser(ana.userId, (client) =>
        client.query(
          `insert into public.match_player_statistics (
             match_id, user_id, sport_id, sport_format_id, scoring_rule_version_id, result
           ) values ($1, $2, $3, $4, $5, 'win')`,
          [matchId, ana.userId, beach.formatId, beach.formatId, beach.ruleId],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(
      asUser(ana.userId, (client) =>
        client.query(
          `update public.match_player_statistics set result = 'win' where match_id = $1`,
          [matchId],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(
      asUser(ana.userId, (client) =>
        client.query(
          `delete from public.match_player_statistics where match_id = $1`,
          [matchId],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(
      asUser(
        null,
        (client) => client.query(`select public.my_statistics()`),
        'anon',
      ),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(
      asUser(ana.userId, (client) =>
        client.query(`select private.project_match_statistics($1)`, [matchId]),
      ),
    ).rejects.toMatchObject({ code: '42501' })
  })
})

async function contributionCount(matchId: string) {
  const result = await admin((client) =>
    client.query<{ count: string }>(
      `select count(*)::text as count from public.match_player_statistics where match_id = $1`,
      [matchId],
    ),
  )
  return Number(result.rows[0]?.count)
}

async function contributions(matchId: string) {
  const result = await admin((client) =>
    client.query<{
      user_id: string
      result: string
      points_for: number | null
      points_against: number | null
      goals_for: number | null
      sets_won: number | null
      sets_lost: number | null
      games_won: number | null
      games_lost: number | null
      deciding_points_for: number | null
      deciding_points_against: number | null
    }>(
      `select user_id, result, points_for, points_against, goals_for,
              sets_won, sets_lost, games_won, games_lost, goals_against,
              deciding_points_for, deciding_points_against
       from public.match_player_statistics
       where match_id = $1
       order by user_id`,
      [matchId],
    ),
  )
  return result.rows
}

async function submitAndConfirm(matchId: string, side1: string, side2: string) {
  await asUser(ana.userId, (client) =>
    client.query(`select public.submit_match($1)`, [matchId]),
  )
  await asUser(side1, (client) =>
    client.query(`select public.confirm_match($1)`, [matchId]),
  )
  await asUser(side2, (client) =>
    client.query(`select public.confirm_match($1)`, [matchId]),
  )
}

async function raceProject(matchId: string) {
  const first = new Client({ connectionString: env.databaseUrl })
  const second = new Client({ connectionString: env.databaseUrl })
  await first.connect()
  await second.connect()
  const errors: string[] = []
  try {
    await first.query('begin')
    await second.query('begin')
    await first.query(`select private.project_match_statistics($1)`, [matchId])
    const waiting = second.query(
      `select private.project_match_statistics($1)`,
      [matchId],
    )
    await new Promise((resolve) => setTimeout(resolve, 200))
    await first.query('commit')
    try {
      await waiting
      await second.query('commit')
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'failed')
      await second.query('rollback')
    }
  } finally {
    await first.end()
    await second.end()
  }
  return { errors }
}

function loadEnv(): Env {
  const text = readFileSync(
    new URL('../../.env.local', import.meta.url),
    'utf8',
  )
  const values = Object.fromEntries(
    text
      .split('\n')
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const index = line.indexOf('=')
        return [line.slice(0, index), line.slice(index + 1)]
      }),
  )
  const url = values.VITE_SUPABASE_URL
  const anonKey = values.VITE_SUPABASE_ANON_KEY
  const databaseUrl = values.DATABASE_URL
  if (!url || !anonKey || !databaseUrl) {
    throw new Error('Rode npm run supabase:start antes dos testes de banco.')
  }
  return { url, anonKey, databaseUrl }
}

async function admin<T>(run: (client: Client) => Promise<T>) {
  const client = new Client({ connectionString: env.databaseUrl })
  await client.connect()
  try {
    return await run(client)
  } finally {
    await client.end()
  }
}

async function asUser<T>(
  userId: string | null,
  run: (client: Client) => Promise<T>,
  role: 'authenticated' | 'anon' = 'authenticated',
) {
  return admin(async (client) => {
    await client.query('begin')
    try {
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: userId, role }),
      ])
      if (userId) {
        await client.query(
          `select set_config('request.jwt.claim.sub', $1, true)`,
          [userId],
        )
      }
      await client.query(`set local role ${role}`)
      const result = await run(client)
      await client.query('commit')
      return result
    } catch (error) {
      await client.query('rollback')
      throw error
    }
  })
}

async function createMeetup(format: Format, capacity: number) {
  const created = await asUser(ana.userId, (client) =>
    client.query<{ id: string }>(
      `select public.create_meetup(
         $1, $2, 'Estatística', '',
         now() + interval '2 days',
         now() + interval '2 days 2 hours',
         'America/Sao_Paulo',
         'Quadra', '', $3
       ) as id`,
      [format.formatId, format.ruleId, capacity],
    ),
  )
  return created.rows[0]!.id
}

async function createMatch(meetupId: string) {
  const created = await asUser(ana.userId, (client) =>
    client.query<{ id: string }>(`select public.create_match($1) as id`, [
      meetupId,
    ]),
  )
  return created.rows[0]!.id
}

async function joinAll(meetupId: string, people: Account[]) {
  const issued = await asUser(ana.userId, (client) =>
    client.query<{ token: string }>(
      `select token from public.create_meetup_invite_link($1)`,
      [meetupId],
    ),
  )
  const token = issued.rows[0]!.token
  for (const person of people) {
    await asUser(person.userId, (client) =>
      client.query(`select public.join_meetup_by_invite($1)`, [token]),
    )
  }
}

async function lineup(matchId: string, side1: Account[], side2: Account[]) {
  await asUser(ana.userId, (client) =>
    client.query(
      `select public.set_match_lineup($1, 'Azul', $2, 'Verde', $3)`,
      [
        matchId,
        side1.map((person) => person.userId),
        side2.map((person) => person.userId),
      ],
    ),
  )
}

async function result(matchId: string, payload: unknown) {
  await asUser(ana.userId, (client) =>
    client.query(`select public.set_match_result($1, $2::jsonb)`, [
      matchId,
      JSON.stringify(payload),
    ]),
  )
}

async function startMeetup(meetupId: string) {
  await shiftMeetup(
    meetupId,
    `now() - interval '1 hour'`,
    `now() + interval '1 hour'`,
  )
}

async function shiftMeetup(meetupId: string, startsAt: string, endsAt: string) {
  await admin(async (client) => {
    await client.query('begin')
    await client.query(`select set_config('padre.meetup_write', 'on', true)`)
    await client.query(
      `update public.meetups
       set starts_at = ${startsAt},
           ends_at = ${endsAt}
       where id = $1`,
      [meetupId],
    )
    await client.query('commit')
  })
}

async function mustSignup(label: string, displayName: string) {
  const username = `${label}${suffix}`.replace(/[^a-z0-9_]/g, '').slice(0, 30)
  const response = await fetch(`${env.url}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: env.anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      email: `${label}-${suffix}@padre.test`,
      password: 'senha-segura',
      data: { username, display_name: displayName },
    }),
  })
  const body = (await response.json()) as { user?: { id?: string } }
  if (!body.user?.id) throw new Error(`Cadastro de ${label} falhou.`)
  return { username, userId: body.user.id }
}
