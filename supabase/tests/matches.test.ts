import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

type Env = { url: string; anonKey: string; databaseUrl: string }
type Account = { username: string; userId: string }

const env = loadEnv()
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
let ana: Account
let bia: Account
let caio: Account
let davi: Account
let beach: { formatId: string; ruleId: string }
let futsal: { formatId: string; ruleId: string }
let volleyball: { formatId: string; ruleId: string }
let tennis: { formatId: string; ruleId: string }

beforeAll(async () => {
  ana = await mustSignup('ana', 'Ana')
  bia = await mustSignup('bia', 'Bia')
  caio = await mustSignup('caio', 'Caio')
  davi = await mustSignup('davi', 'Davi')
  const catalog = await admin((client) =>
    client.query<{ slug: string; format_id: string; rule_id: string }>(
      `select sport_formats.slug, sport_formats.id as format_id, scoring_rule_versions.id as rule_id
       from public.sport_formats
       join public.scoring_rule_versions
         on scoring_rule_versions.format_id = sport_formats.id
        and scoring_rule_versions.active
       where sport_formats.slug in ('beach-2x2', 'futsal-5x5', 'indoor-6x6', 'doubles')`,
    ),
  )
  const bySlug = (slug: string) => {
    const row = catalog.rows.find((item) => item.slug === slug)
    return { formatId: row!.format_id, ruleId: row!.rule_id }
  }
  beach = bySlug('beach-2x2')
  futsal = bySlug('futsal-5x5')
  volleyball = bySlug('indoor-6x6')
  tennis = bySlug('doubles')
})

afterAll(async () => {
  await admin((client) =>
    client.query(`delete from auth.users where email like $1`, [
      `%${suffix}@padre.test`,
    ]),
  )
})

describe('matches', () => {
  it('keeps the meetup rule, the roster limits and separate lineups', async () => {
    const meetupId = await createMeetup(beach, 4)
    await expect(
      asUser(bia.userId, (client) =>
        client.query(`select public.create_match($1)`, [meetupId]),
      ),
    ).rejects.toMatchObject({ code: '42501' })

    const matchId = await createMatch(ana.userId, meetupId)
    const stored = await admin((client) =>
      client.query<{
        meetup_id: string
        scoring_rule_version_id: string
        status: string
      }>(
        `select meetup_id, scoring_rule_version_id, status from public.matches where id = $1`,
        [matchId],
      ),
    )
    expect(stored.rows[0]).toMatchObject({
      meetup_id: meetupId,
      scoring_rule_version_id: beach.ruleId,
      status: 'draft',
    })

    await joinAll(ana.userId, meetupId, [bia, caio, davi])
    await expect(
      lineup(ana.userId, matchId, [ana.userId], [bia.userId]),
    ).rejects.toMatchObject({
      message: expect.stringContaining('invalid lineup'),
    })
    await expect(
      lineup(
        ana.userId,
        matchId,
        [ana.userId, bia.userId],
        [ana.userId, caio.userId],
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining('invalid lineup'),
    })
    const outsider = await mustSignup('eva', 'Eva')
    await expect(
      lineup(
        ana.userId,
        matchId,
        [ana.userId, outsider.userId],
        [bia.userId, caio.userId],
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining('invalid lineup'),
    })

    await lineup(
      ana.userId,
      matchId,
      [ana.userId, bia.userId],
      [caio.userId, davi.userId],
    )
    const secondId = await createMatch(ana.userId, meetupId)
    await lineup(
      ana.userId,
      secondId,
      [ana.userId, caio.userId],
      [bia.userId, davi.userId],
    )
    await asUser(bia.userId, (client) =>
      client.query(`select public.leave_meetup($1)`, [meetupId]),
    )
    const stillThere = await admin((client) =>
      client.query<{ count: string }>(
        `select count(*)::text as count from public.match_players
         where match_id = $1 and user_id = $2`,
        [matchId, bia.userId],
      ),
    )
    expect(stillThere.rows[0]?.count).toBe('1')
    const teams = await admin((client) =>
      client.query<{ match_id: string; user_id: string; side: number }>(
        `select match_players.match_id, match_players.user_id, match_teams.side
         from public.match_players
         join public.match_teams on match_teams.id = match_players.team_id
         where match_players.match_id = any($1::uuid[])
           and match_players.user_id = $2`,
        [[matchId, secondId], caio.userId],
      ),
    )
    const sides = new Set(teams.rows.map((row) => row.side))
    expect(sides.size).toBe(2)
  })

  it('rejects invalid scores and stores the calculated winner', async () => {
    const volleyballMeetup = await createMeetup(volleyball, 12)
    const futsalMeetup = await createMeetup(futsal, 12)
    const tennisMeetup = await createMeetup(tennis, 4)
    const volleyballMatch = await createMatch(ana.userId, volleyballMeetup)
    const futsalMatch = await createMatch(ana.userId, futsalMeetup)
    const tennisMatch = await createMatch(ana.userId, tennisMeetup)

    await expect(
      result(ana.userId, volleyballMatch, {
        sets: [
          [25, 24],
          [25, 20],
          [25, 20],
        ],
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining('invalid match result'),
    })
    await result(ana.userId, volleyballMatch, {
      sets: [
        [25, 20],
        [25, 18],
        [25, 22],
      ],
    })
    await result(ana.userId, futsalMatch, { goals: [2, 2] })
    await result(ana.userId, tennisMatch, {
      sets: [
        { games: [6, 4], tiebreak: null },
        { games: [6, 6], tiebreak: [7, 5] },
      ],
    })
    await expect(
      result(ana.userId, tennisMatch, {
        sets: [{ games: [6, 6], tiebreak: [8, 6] }],
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining('invalid match result'),
    })

    const outcomes = await admin((client) =>
      client.query<{ outcome: string }>(
        `select outcome from public.match_results
         where match_id = any($1::uuid[]) and superseded_at is null
         order by match_id`,
        [[volleyballMatch, futsalMatch, tennisMatch]],
      ),
    )
    expect(outcomes.rows.map((row) => row.outcome).sort()).toEqual([
      'draw',
      'side_1',
      'side_1',
    ])

    const direct = await admin((client) =>
      client.query<{ outcome: string }>(
        `select private.resolve_match_outcome(
           'goal_based',
           '{"allows_draw": false, "tie_break": "penalties"}'::jsonb,
           '{"goals": [1, 1]}'::jsonb
         )`,
      ),
    ).catch((error: { message: string }) => error)
    expect(direct).toMatchObject({
      message: expect.stringContaining('invalid match result'),
    })
  })

  it('confirms only after both sides and keeps concurrent confirms consistent', async () => {
    const meetupId = await createMeetup(beach, 4)
    await joinAll(ana.userId, meetupId, [bia, caio, davi])
    await startMeetup(meetupId)
    const matchId = await createMatch(ana.userId, meetupId)
    await lineup(
      ana.userId,
      matchId,
      [ana.userId, bia.userId],
      [caio.userId, davi.userId],
    )
    await result(ana.userId, matchId, {
      sets: [
        [21, 15],
        [21, 18],
      ],
    })
    await asUser(ana.userId, (client) =>
      client.query(`select public.submit_match($1)`, [matchId]),
    )
    await expect(
      asUser(davi.userId, (client) =>
        client.query(`select public.set_match_result($1, $2::jsonb)`, [
          matchId,
          JSON.stringify({
            sets: [
              [21, 10],
              [21, 10],
            ],
          }),
        ]),
      ),
    ).rejects.toMatchObject({ code: '42501' })

    const first = await asUser(bia.userId, (client) =>
      client.query<{ status: string }>(
        `select public.confirm_match($1) as status`,
        [matchId],
      ),
    )
    expect(first.rows[0]?.status).toBe('pending_confirmation')
    const side = await admin((client) =>
      client.query<{ side: number }>(
        `select match_teams.side
         from public.match_confirmations
         join public.match_teams on match_teams.id = match_confirmations.team_id
         where match_confirmations.user_id = $1`,
        [bia.userId],
      ),
    )
    expect(side.rows[0]?.side).toBe(1)
    await expect(
      asUser(bia.userId, (client) =>
        client.query(`select public.confirm_match($1)`, [matchId]),
      ),
    ).resolves.toBeTruthy()
    const stillPending = await admin((client) =>
      client.query<{ status: string; count: string }>(
        `select matches.status,
                (select count(*)::text from public.match_confirmations
                 where match_id = matches.id) as count
         from public.matches where id = $1`,
        [matchId],
      ),
    )
    expect(stillPending.rows[0]).toEqual({
      status: 'pending_confirmation',
      count: '1',
    })

    const raced = await createMatch(ana.userId, meetupId)
    await lineup(
      ana.userId,
      raced,
      [ana.userId, bia.userId],
      [caio.userId, davi.userId],
    )
    await result(ana.userId, raced, {
      sets: [
        [21, 12],
        [21, 16],
      ],
    })
    await asUser(ana.userId, (client) =>
      client.query(`select public.submit_match($1)`, [raced]),
    )
    const race = await raceConfirms(raced, bia.userId, caio.userId)
    expect(race.errors).toEqual([])
    const finalState = await admin((client) =>
      client.query<{ status: string; count: string }>(
        `select status,
                (select count(*)::text from public.match_confirmations c
                 join public.match_results r on r.id = c.result_id
                 where c.match_id = matches.id and r.superseded_at is null) as count
         from public.matches where id = $1`,
        [raced],
      ),
    )
    expect(finalState.rows[0]).toEqual({ status: 'confirmed', count: '2' })
  })

  it('disputes, revises and preserves the audit trail', async () => {
    const meetupId = await createMeetup(beach, 4)
    await joinAll(ana.userId, meetupId, [bia, caio, davi])
    await startMeetup(meetupId)
    const matchId = await createMatch(ana.userId, meetupId)
    await lineup(
      ana.userId,
      matchId,
      [ana.userId, bia.userId],
      [caio.userId, davi.userId],
    )
    await result(ana.userId, matchId, {
      sets: [
        [21, 15],
        [21, 19],
      ],
    })
    await asUser(ana.userId, (client) =>
      client.query(`select public.submit_match($1)`, [matchId]),
    )
    await asUser(bia.userId, (client) =>
      client.query(`select public.confirm_match($1)`, [matchId]),
    )
    await asUser(caio.userId, (client) =>
      client.query(`select public.dispute_match($1)`, [matchId]),
    )
    await expect(
      asUser(davi.userId, (client) =>
        client.query(`select public.confirm_match($1)`, [matchId]),
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining('match frozen'),
    })
    const revision = await asUser(ana.userId, (client) =>
      client.query<{ revision: number }>(
        `select public.revise_match_result($1, $2::jsonb) as revision`,
        [
          matchId,
          JSON.stringify({
            sets: [
              [21, 14],
              [18, 21],
              [15, 12],
            ],
          }),
        ],
      ),
    )
    expect(revision.rows[0]?.revision).toBe(2)
    const openConfirmations = await admin((client) =>
      client.query<{ count: string }>(
        `select count(*)::text as count
         from public.match_confirmations
         join public.match_results on match_results.id = match_confirmations.result_id
         where match_confirmations.match_id = $1
           and match_results.superseded_at is null`,
        [matchId],
      ),
    )
    expect(openConfirmations.rows[0]?.count).toBe('0')
    const oldConfirmation = await admin((client) =>
      client.query<{ count: string }>(
        `select count(*)::text as count from public.match_confirmations
         where match_id = $1`,
        [matchId],
      ),
    )
    expect(oldConfirmation.rows[0]?.count).toBe('1')
    const actions = await admin((client) =>
      client.query<{ action: string }>(
        `select action from public.match_audit_logs
         where match_id = $1 order by created_at`,
        [matchId],
      ),
    )
    expect(actions.rows.map((row) => row.action)).toEqual([
      'created',
      'lineup_changed',
      'result_changed',
      'submitted',
      'confirmation',
      'disputed',
      'revised',
    ])
    await expect(
      asUser(bia.userId, (client) =>
        client.query(
          `delete from public.match_audit_logs where match_id = $1`,
          [matchId],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('voids open matches when the meetup is cancelled and blocks direct confirmation', async () => {
    const meetupId = await createMeetup(beach, 4)
    const draftId = await createMatch(ana.userId, meetupId)
    await asUser(ana.userId, (client) =>
      client.query(`select public.cancel_meetup($1)`, [meetupId]),
    )
    const voided = await admin((client) =>
      client.query<{ status: string }>(
        `select status from public.matches where id = $1`,
        [draftId],
      ),
    )
    expect(voided.rows[0]?.status).toBe('voided')
    await expect(
      asUser(ana.userId, (client) =>
        client.query(`select public.create_match($1)`, [meetupId]),
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining('meetup cancelled'),
    })

    const kept = await createMeetup(beach, 4)
    await joinAll(ana.userId, kept, [bia, caio, davi])
    await startMeetup(kept)
    const confirmedId = await createMatch(ana.userId, kept)
    await lineup(
      ana.userId,
      confirmedId,
      [ana.userId, bia.userId],
      [caio.userId, davi.userId],
    )
    await result(ana.userId, confirmedId, {
      sets: [
        [21, 11],
        [21, 17],
      ],
    })
    await asUser(ana.userId, (client) =>
      client.query(`select public.submit_match($1)`, [confirmedId]),
    )
    await asUser(bia.userId, (client) =>
      client.query(`select public.confirm_match($1)`, [confirmedId]),
    )
    await asUser(caio.userId, (client) =>
      client.query(`select public.confirm_match($1)`, [confirmedId]),
    )
    await asUser(ana.userId, (client) =>
      client.query(`select public.cancel_meetup($1)`, [kept]),
    )
    const remains = await admin((client) =>
      client.query<{ status: string }>(
        `select status from public.matches where id = $1`,
        [confirmedId],
      ),
    )
    expect(remains.rows[0]?.status).toBe('confirmed')
    await expect(
      admin((client) =>
        client.query(
          `do $$
           begin
             perform set_config('padre.match_write', 'on', true);
             update public.match_results
             set payload = '{"sets": [[21, 0], [21, 0]]}'::jsonb
             where match_id = ${sqlLiteral(confirmedId)};
           end
           $$;`,
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(
      asUser(ana.userId, (client) =>
        client.query(
          `update public.matches set status = 'draft' where id = $1`,
          [confirmedId],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(
      asUser(
        null,
        (client) => client.query(`select id from public.matches`),
        'anon',
      ),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(
      asUser(
        null,
        (client) =>
          client.query(`select public.list_meetup_matches($1)`, [kept]),
        'anon',
      ),
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('does not let anon execute match functions or other private bodies', async () => {
    const privileges = await admin((client) =>
      client.query<{
        name: string
        schema: string
        anon: boolean
        definer: boolean
      }>(
        `select n.nspname as schema, p.proname as name, p.prosecdef as definer,
                has_function_privilege('anon', p.oid, 'execute') as anon
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname in ('public', 'private')
           and has_function_privilege('anon', p.oid, 'execute')`,
      ),
    )
    const names = privileges.rows
      .map((row) => `${row.schema}.${row.name}`)
      .sort()
    expect(names).toEqual([
      'private.preview_meetup_invite',
      'public.preview_meetup_invite',
      'public.username_is_available',
    ])
    expect(
      privileges.rows.find((row) => row.name === 'username_is_available')
        ?.definer,
    ).toBe(true)
    expect(
      privileges.rows.find(
        (row) =>
          row.name === 'preview_meetup_invite' && row.schema === 'public',
      )?.definer,
    ).toBe(false)
  })
})

function sqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`
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

async function createMeetup(
  format: { formatId: string; ruleId: string },
  capacity: number,
) {
  const created = await asUser(ana.userId, (client) =>
    client.query<{ id: string }>(
      `select public.create_meetup(
         $1, $2, 'Partida', '',
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

async function createMatch(userId: string, meetupId: string) {
  const created = await asUser(userId, (client) =>
    client.query<{ id: string }>(`select public.create_match($1) as id`, [
      meetupId,
    ]),
  )
  return created.rows[0]!.id
}

async function joinAll(
  organizerId: string,
  meetupId: string,
  people: Account[],
) {
  const issued = await asUser(organizerId, (client) =>
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

async function lineup(
  userId: string,
  matchId: string,
  side1: string[],
  side2: string[],
) {
  return asUser(userId, (client) =>
    client.query(
      `select public.set_match_lineup($1, 'Azul', $2, 'Verde', $3)`,
      [matchId, side1, side2],
    ),
  )
}

async function result(userId: string, matchId: string, payload: unknown) {
  return asUser(userId, (client) =>
    client.query(`select public.set_match_result($1, $2::jsonb)`, [
      matchId,
      JSON.stringify(payload),
    ]),
  )
}

async function startMeetup(meetupId: string) {
  await admin((client) =>
    client.query(
      `do $$
       begin
         perform set_config('padre.meetup_write', 'on', true);
         update public.meetups
         set starts_at = now() - interval '1 hour',
             ends_at = now() + interval '1 hour'
         where id = ${sqlLiteral(meetupId)};
       end
       $$;`,
    ),
  )
}

async function raceConfirms(
  matchId: string,
  firstId: string,
  secondId: string,
) {
  const first = new Client({ connectionString: env.databaseUrl })
  const second = new Client({ connectionString: env.databaseUrl })
  await first.connect()
  await second.connect()
  const errors: string[] = []
  try {
    await first.query('begin')
    await second.query('begin')
    await assume(first, firstId)
    await assume(second, secondId)
    await first.query(`select public.confirm_match($1)`, [matchId])
    const waiting = second.query(`select public.confirm_match($1)`, [matchId])
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

async function assume(client: Client, userId: string) {
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: userId, role: 'authenticated' }),
  ])
  await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [
    userId,
  ])
  await client.query('set local role authenticated')
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
