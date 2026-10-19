import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

type Env = { url: string; anonKey: string; databaseUrl: string }
type Account = { username: string; userId: string }
type Format = { sportId: string; formatId: string; ruleId: string }
type Person = {
  user_id: string
  username: string
  matches_played: number
  wins: number
  losses: number
  draws: number
  win_rate: number
}
type RelationshipList = { total: number; relationships: Person[] }
type Highlights = {
  minimum_matches: number
  most_frequent_teammate: Person | null
  best_teammate: Person | null
  best_teammate_status: string
  most_frequent_opponent: Person | null
  most_defeated_opponent: Person | null
  hardest_opponent: Person | null
  hardest_opponent_status: string
}

const env = loadEnv()
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
let ana: Account
let bia: Account
let caio: Account
let davi: Account
let eva: Account
let felipe: Account
let gabi: Account
let helo: Account
let ivo: Account
let joao: Account
let lia: Account
let beach: Format
let beachFour: Format
let futsal: Format
let foot: Format
let tennis: Format

beforeAll(async () => {
  ;[ana, bia, caio, davi, eva, felipe, gabi, helo, ivo, joao, lia] =
    await Promise.all([
      mustSignup('ana', 'Ana'),
      mustSignup('bia', 'Bia'),
      mustSignup('caio', 'Caio'),
      mustSignup('davi', 'Davi'),
      mustSignup('eva', 'Eva'),
      mustSignup('felipe', 'Felipe'),
      mustSignup('gabi', 'Gabi'),
      mustSignup('helo', 'Helo'),
      mustSignup('ivo', 'Ivo'),
      mustSignup('joao', 'Joao'),
      mustSignup('lia', 'Lia'),
    ])
  const catalog = await admin((client) =>
    client.query<{
      slug: string
      sport_id: string
      format_id: string
      rule_id: string
    }>(
      `select sport_formats.slug, sport_formats.sport_id,
              sport_formats.id as format_id, scoring_rule_versions.id as rule_id
       from public.sport_formats
       join public.scoring_rule_versions
         on scoring_rule_versions.format_id = sport_formats.id
        and scoring_rule_versions.active
       where sport_formats.slug in (
         'beach-2x2', 'beach-4x4', 'futsal-5x5', 'footvolley-2x2', 'doubles'
       )`,
    ),
  )
  const bySlug = (slug: string) => {
    const row = catalog.rows.find((item) => item.slug === slug)
    if (!row) throw new Error(slug)
    return {
      sportId: row.sport_id,
      formatId: row.format_id,
      ruleId: row.rule_id,
    }
  }
  beach = bySlug('beach-2x2')
  beachFour = bySlug('beach-4x4')
  futsal = bySlug('futsal-5x5')
  foot = bySlug('footvolley-2x2')
  tennis = bySlug('doubles')
}, 30_000)

afterAll(async () => {
  await admin((client) =>
    client.query(`delete from auth.users where email like $1`, [
      `%${suffix}@padre.test`,
    ]),
  )
})

describe('player relationships', () => {
  it('separates teammates from opponents and ignores anyone not on the roster', async () => {
    const meetupId = await createMeetup(tennis, 5)
    await joinAll(meetupId, [bia, caio, davi])
    await startMeetup(meetupId)
    const draft = await play(
      meetupId,
      [ana, bia],
      [caio, davi],
      {
        sets: [
          { games: [6, 4], tiebreak: null },
          { games: [6, 3], tiebreak: null },
        ],
      },
      'draft',
    )
    const disputed = await play(
      meetupId,
      [ana, bia],
      [caio, davi],
      {
        sets: [
          { games: [6, 4], tiebreak: null },
          { games: [6, 3], tiebreak: null },
        ],
      },
      'dispute',
    )
    const first = await play(
      meetupId,
      [ana, bia],
      [caio, davi],
      {
        sets: [
          { games: [6, 4], tiebreak: null },
          { games: [6, 3], tiebreak: null },
        ],
      },
      'confirm',
    )
    const second = await play(
      meetupId,
      [ana, caio],
      [bia, davi],
      {
        sets: [
          { games: [4, 6], tiebreak: null },
          { games: [3, 6], tiebreak: null },
        ],
      },
      'confirm',
    )

    expect(await contributionCount(draft)).toBe(0)
    expect(await contributionCount(disputed)).toBe(0)
    expect(await contributionCount(first)).toBe(4)
    const before = await view(ana.userId, tennis.sportId)
    expect(findPerson(before.teammates, bia.username)).toMatchObject({
      matches_played: 1,
      wins: 1,
      losses: 0,
      draws: 0,
      win_rate: 100,
    })
    expect(findPerson(before.teammates, caio.username)).toMatchObject({
      matches_played: 1,
      wins: 0,
      losses: 1,
    })
    expect(findPerson(before.opponents, caio.username)).toMatchObject({
      matches_played: 1,
      wins: 1,
      losses: 0,
    })
    expect(findPerson(before.opponents, bia.username)).toMatchObject({
      matches_played: 1,
      wins: 0,
      losses: 1,
    })
    expect(findPerson(before.opponents, davi.username)).toMatchObject({
      matches_played: 2,
      wins: 1,
      losses: 1,
      win_rate: 50,
    })
    expect(findPerson(before.teammates, eva.username)).toBeUndefined()
    expect(before.teammates.total).toBe(2)

    const page = await asUser(ana.userId, (client) =>
      client.query<{ stats: RelationshipList }>(
        `select public.my_teammate_statistics($1, null, 1, 0) as stats`,
        [tennis.sportId],
      ),
    )
    expect(page.rows[0]?.stats.total).toBe(2)
    expect(
      page.rows[0]?.stats.relationships.map((person) => person.username),
    ).toEqual([bia.username])

    const caioView = await view(caio.userId, tennis.sportId)
    expect(findPerson(caioView.opponents, ana.username)).toMatchObject({
      matches_played: 1,
      wins: 0,
      losses: 1,
    })
    const stranger = await view(eva.userId, tennis.sportId)
    expect(stranger.teammates.relationships).toEqual([])
    expect(stranger.opponents.relationships).toEqual([])

    await admin((client) =>
      client.query(`select private.reproject_all_statistics()`),
    )
    const after = await view(ana.userId, tennis.sportId)
    expect(after.teammates).toEqual(before.teammates)
    expect(after.opponents).toEqual(before.opponents)
    expect(await contributionCount(first)).toBe(4)
    expect(await contributionCount(second)).toBe(4)

    await expect(
      asUser(eva.userId, (client) =>
        client.query(`select public.meetup_player_relationships($1, $2)`, [
          meetupId,
          ana.userId,
        ]),
      ),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(
      asUser(
        null,
        (client) =>
          client.query(
            `select public.my_teammate_statistics($1, null, 20, 0)`,
            [tennis.sportId],
          ),
        'anon',
      ),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(
      asUser(ana.userId, (client) =>
        client.query(
          `select private.player_pair_statistics($1, $2, null, 'teammate', null)`,
          [ana.userId, tennis.sportId],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' })
  }, 60_000)

  it('drops contributions that no longer belong to a confirmed match', async () => {
    const meetupId = await createMeetup(tennis, 4)
    await joinAll(meetupId, [bia, caio, davi])
    await startMeetup(meetupId)
    const confirmed = await play(
      meetupId,
      [ana, bia],
      [caio, davi],
      {
        sets: [
          { games: [6, 4], tiebreak: null },
          { games: [6, 4], tiebreak: null },
        ],
      },
      'confirm',
    )
    const draft = await play(
      meetupId,
      [ana, bia],
      [caio, davi],
      {
        sets: [
          { games: [6, 4], tiebreak: null },
          { games: [6, 4], tiebreak: null },
        ],
      },
      'draft',
    )
    await admin(async (client) => {
      await client.query('begin')
      await client.query(
        `select set_config('padre.statistic_write', 'on', true)`,
      )
      await client.query(
        `insert into public.match_player_statistics (
           match_id, user_id, sport_id, sport_format_id, scoring_rule_version_id, result
         )
         select $1, user_id, sport_id, sport_format_id, scoring_rule_version_id, 'win'
         from public.match_player_statistics
         where match_id = $2
         limit 1`,
        [draft, confirmed],
      )
      await client.query('commit')
    })
    expect(await contributionCount(draft)).toBe(1)
    await admin((client) =>
      client.query(`select private.reproject_all_statistics()`),
    )
    expect(await contributionCount(draft)).toBe(0)
    expect(await contributionCount(confirmed)).toBe(4)
  })

  it('counts a draw for both teammates and opponents', async () => {
    const meetupId = await createMeetup(futsal, 10)
    await joinAll(meetupId, [
      bia,
      caio,
      davi,
      eva,
      felipe,
      gabi,
      helo,
      ivo,
      joao,
    ])
    await startMeetup(meetupId)
    await play(
      meetupId,
      [ana, bia, caio, davi, eva],
      [felipe, gabi, helo, ivo, joao],
      { goals: [2, 2] },
      'confirm',
    )
    const seen = await view(ana.userId, futsal.sportId)
    expect(findPerson(seen.teammates, bia.username)).toMatchObject({
      matches_played: 1,
      wins: 0,
      losses: 0,
      draws: 1,
      win_rate: 0,
    })
    expect(findPerson(seen.opponents, felipe.username)).toMatchObject({
      matches_played: 1,
      draws: 1,
      win_rate: 0,
    })
    const beachView = await view(ana.userId, beach.sportId)
    expect(findPerson(beachView.teammates, bia.username)).toBeUndefined()
  })

  it('filters formats without mixing another sport', async () => {
    const small = await createMeetup(beach, 4)
    await joinAll(small, [bia, caio, davi])
    await startMeetup(small)
    await play(
      small,
      [ana, bia],
      [caio, davi],
      {
        sets: [
          [21, 15],
          [21, 18],
        ],
      },
      'confirm',
    )
    const large = await createMeetup(beachFour, 8)
    await joinAll(large, [bia, caio, davi, eva, felipe, gabi, helo])
    await startMeetup(large)
    await play(
      large,
      [ana, bia, caio, davi],
      [eva, felipe, gabi, helo],
      {
        sets: [
          [21, 12],
          [21, 16],
        ],
      },
      'confirm',
    )
    const all = await view(ana.userId, beach.sportId)
    const pairs = await view(ana.userId, beach.sportId, beach.formatId)
    const fours = await view(ana.userId, beach.sportId, beachFour.formatId)
    expect(findPerson(all.teammates, bia.username)?.matches_played).toBe(2)
    expect(findPerson(pairs.teammates, bia.username)?.matches_played).toBe(1)
    expect(findPerson(fours.teammates, bia.username)?.matches_played).toBe(1)
    expect(
      (findPerson(pairs.teammates, bia.username)?.matches_played ?? 0) +
        (findPerson(fours.teammates, bia.username)?.matches_played ?? 0),
    ).toBe(findPerson(all.teammates, bia.username)?.matches_played)
    const other = await view(ana.userId, foot.sportId)
    expect(other.teammates.relationships).toEqual([])
  })

  it('ranks highlights inside one sport and breaks ties by username', async () => {
    const meetupId = await createMeetup(foot, 12)
    await joinAll(meetupId, [
      bia,
      caio,
      davi,
      eva,
      felipe,
      gabi,
      helo,
      ivo,
      joao,
      lia,
    ])
    await startMeetup(meetupId)
    const won = {
      sets: [
        [18, 10],
        [18, 12],
      ],
    }
    const lost = {
      sets: [
        [10, 18],
        [12, 18],
      ],
    }
    for (let index = 0; index < 4; index += 1) {
      await play(meetupId, [ana, bia], [caio, davi], won, 'confirm')
    }
    const early = await view(ana.userId, foot.sportId)
    expect(early.highlights.minimum_matches).toBe(5)
    expect(early.highlights.best_teammate_status).toBe('insufficient_sample')
    expect(early.highlights.hardest_opponent_status).toBe('insufficient_sample')
    expect(early.highlights.most_frequent_teammate?.username).toBe(bia.username)
    expect(early.highlights.best_teammate).toBeNull()

    await play(meetupId, [ana, bia], [caio, davi], won, 'confirm')
    const five = await view(ana.userId, foot.sportId)
    expect(five.highlights.best_teammate?.username).toBe(bia.username)
    expect(five.highlights.best_teammate_status).toBe('selected')
    expect(five.highlights.hardest_opponent?.username).toBe(caio.username)
    expect(findPerson(five.opponents, caio.username)).toMatchObject({
      matches_played: 5,
      wins: 5,
    })
    expect(findPerson(five.opponents, davi.username)).toMatchObject({
      matches_played: 5,
      wins: 5,
    })

    for (let index = 0; index < 5; index += 1) {
      await play(meetupId, [ana, gabi], [felipe, helo], lost, 'confirm')
    }
    const ranked = await view(ana.userId, foot.sportId)
    expect(ranked.highlights.best_teammate?.username).toBe(bia.username)
    expect(ranked.highlights.most_frequent_teammate?.username).toBe(
      bia.username,
    )
    expect(ranked.highlights.hardest_opponent?.username).toBe(felipe.username)
    expect(findPerson(ranked.opponents, felipe.username)).toMatchObject({
      matches_played: 5,
      wins: 0,
      losses: 5,
      win_rate: 0,
    })
    expect(findPerson(ranked.opponents, helo.username)).toMatchObject({
      matches_played: 5,
      wins: 0,
      losses: 5,
    })
    expect(ranked.highlights.most_defeated_opponent?.username).toBe(
      caio.username,
    )

    for (let index = 0; index < 4; index += 1) {
      await play(meetupId, [ana, joao], [lia, ivo], won, 'confirm')
    }
    const final = await view(ana.userId, foot.sportId)
    expect(findPerson(final.teammates, joao.username)?.matches_played).toBe(4)
    expect(final.highlights.best_teammate?.username).toBe(bia.username)
    expect(findPerson(final.opponents, lia.username)?.matches_played).toBe(4)
    expect(final.highlights.hardest_opponent?.username).toBe(felipe.username)
  }, 120_000)

  it('shows historical totals only among people confirmed on the meetup', async () => {
    const here = await createMeetup(tennis, 5)
    await joinAll(here, [bia, caio, davi])
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
        [here, eva.username],
      ),
    )
    await expect(
      asUser(eva.userId, (client) =>
        client.query(`select public.meetup_player_relationships($1, $2)`, [
          here,
          ana.userId,
        ]),
      ),
    ).rejects.toMatchObject({ code: '42501' })

    const elsewhere = await createMeetup(tennis, 4)
    await joinAll(elsewhere, [bia, caio, lia])
    await startMeetup(elsewhere)
    await play(
      elsewhere,
      [ana, lia],
      [bia, caio],
      {
        sets: [
          { games: [6, 4], tiebreak: null },
          { games: [6, 4], tiebreak: null },
        ],
      },
      'confirm',
    )
    await startMeetup(here)
    await play(
      here,
      [ana, bia],
      [caio, davi],
      {
        sets: [
          { games: [6, 4], tiebreak: null },
          { games: [6, 4], tiebreak: null },
        ],
      },
      'confirm',
    )
    await expect(
      asUser(eva.userId, (client) =>
        client.query(`select public.meetup_player_relationships($1, $2)`, [
          here,
          ana.userId,
        ]),
      ),
    ).rejects.toMatchObject({ code: '42501' })

    await shiftMeetup(
      here,
      `now() + interval '2 days'`,
      `now() + interval '2 days 2 hours'`,
    )
    await asUser(eva.userId, (client) =>
      client.query(`select public.respond_to_meetup_invitation($1, 'accept')`, [
        invited.rows[0]!.id,
      ]),
    )
    const shared = await asUser(bia.userId, (client) =>
      client.query<{
        stats: { player: { username: string }; sports: unknown[] }
      }>(`select public.meetup_player_relationships($1, $2) as stats`, [
        here,
        ana.userId,
      ]),
    )
    const payload = JSON.stringify(shared.rows[0]?.stats)
    expect(payload).toContain(ana.username)
    expect(payload).toContain(davi.username)
    expect(payload).not.toContain(lia.username)
    expect(payload).not.toContain(elsewhere)
    expect(payload).not.toContain('@')
    expect(payload).not.toContain('match_id')

    await asUser(eva.userId, (client) =>
      client.query(`select public.leave_meetup($1)`, [here]),
    )
    await expect(
      asUser(eva.userId, (client) =>
        client.query(`select public.meetup_player_relationships($1, $2)`, [
          here,
          ana.userId,
        ]),
      ),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(
      asUser(
        null,
        (client) =>
          client.query(`select public.meetup_player_relationships($1, $2)`, [
            here,
            ana.userId,
          ]),
        'anon',
      ),
    ).rejects.toMatchObject({ code: '42501' })
  })
})

function findPerson(list: RelationshipList, username: string) {
  return list.relationships.find((person) => person.username === username)
}

async function view(
  userId: string,
  sportId: string,
  formatId: string | null = null,
) {
  const result = await asUser(userId, (client) =>
    client.query<{
      teammates: RelationshipList
      opponents: RelationshipList
      highlights: Highlights
    }>(
      `select public.my_teammate_statistics($1, $2, 50, 0) as teammates,
              public.my_opponent_statistics($1, $2, 50, 0) as opponents,
              public.my_relationship_highlights($1, $2) as highlights`,
      [sportId, formatId],
    ),
  )
  const row = result.rows[0]
  if (!row) throw new Error('consulta vazia')
  return row
}

async function contributionCount(matchId: string) {
  const result = await admin((client) =>
    client.query<{ count: string }>(
      `select count(*)::text as count from public.match_player_statistics where match_id = $1`,
      [matchId],
    ),
  )
  return Number(result.rows[0]?.count)
}

async function play(
  meetupId: string,
  side1: Account[],
  side2: Account[],
  payload: unknown,
  mode: 'confirm' | 'draft' | 'dispute',
) {
  const matchId = await createMatch(meetupId)
  await lineup(matchId, side1, side2)
  if (mode === 'draft') return matchId
  await result(matchId, payload)
  await asUser(ana.userId, (client) =>
    client.query(`select public.submit_match($1)`, [matchId]),
  )
  if (mode === 'dispute') {
    await asUser(side2[0]!.userId, (client) =>
      client.query(`select public.dispute_match($1)`, [matchId]),
    )
    return matchId
  }
  await asUser(side1[0]!.userId, (client) =>
    client.query(`select public.confirm_match($1)`, [matchId]),
  )
  await asUser(side2[0]!.userId, (client) =>
    client.query(`select public.confirm_match($1)`, [matchId]),
  )
  return matchId
}

async function createMeetup(format: Format, capacity: number) {
  const created = await asUser(ana.userId, (client) =>
    client.query<{ id: string }>(
      `select public.create_meetup(
         $1, $2, 'Relações', '',
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
