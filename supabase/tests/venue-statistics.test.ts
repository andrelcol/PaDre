import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

type Env = { url: string; anonKey: string; databaseUrl: string }
type Account = { username: string; userId: string }
type Format = { sportId: string; formatId: string; ruleId: string }
type Summary = {
  venues: Array<{
    venue_id: string
    visible: boolean
    name?: string
    status?: string
    sports: Array<{
      sport_id: string
      matches_played: number
      wins: number
      losses: number
      draws: number
      win_rate: number
      points_for?: number
      goals_for?: number
      games_won?: number
      games_lost?: number
      sets_won?: number
      deciding_points_for?: number
      formats: Array<{ sport_format_id: string; matches_played: number }>
    }>
  }>
  unassigned: {
    sports: Array<{ sport_id: string; matches_played: number }>
  }
}

const env = loadEnv()
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
let ana: Account
let bia: Account
let caio: Account
let davi: Account
let eva: Account
let lia: Account
let extras: Account[]
let beach: Format
let beachFour: Format
let futsal: Format
let tennis: Format
let centralId: string
let twinId: string
let manualMeetup: string
let centralMatch: string
let secondMatch: string
let publicSlug: string
let privateSlug: string
let communityVenueId: string

beforeAll(async () => {
  const people = await Promise.all(
    [
      'ana',
      'bia',
      'caio',
      'davi',
      'eva',
      'lia',
      'felipe',
      'gabi',
      'helo',
      'ivo',
      'joao',
    ].map((label) => mustSignup(label, label)),
  )
  ;[ana, bia, caio, davi, eva, lia] = people
  extras = people.slice(6)
  const catalog = await admin((client) =>
    client.query<{
      slug: string
      sport_id: string
      format_id: string
      rule_id: string
    }>(
      `select sport_formats.slug, sport_formats.sport_id,
              sport_formats.id as format_id,
              scoring_rule_versions.id as rule_id
       from public.sport_formats
       join public.scoring_rule_versions
         on scoring_rule_versions.format_id = sport_formats.id
        and scoring_rule_versions.active
       where sport_formats.slug in (
         'beach-2x2', 'beach-4x4', 'futsal-5x5', 'doubles'
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
  tennis = bySlug('doubles')

  centralId = await createVenue(ana, 'Quadra Central')
  twinId = await createVenue(ana, 'Quadra Central')
  const played = await playBeach(centralId, [ana, bia], [caio, davi])
  centralMatch = played.matchId
  const again = await playBeach(
    centralId,
    [bia, davi],
    [ana, caio],
    played.meetupId,
  )
  secondMatch = again.matchId
  await playBeach(twinId, [ana, bia], [caio, davi])
  manualMeetup = await playBeach(null, [ana, bia], [caio, davi]).then(
    (row) => row.meetupId,
  )

  const eight = [ana, bia, caio, davi, eva, ...extras.slice(0, 3)]
  const ten = [...eight, ...extras.slice(3)]
  await playLined(
    centralId,
    beachFour,
    eight,
    eight.slice(0, 4),
    eight.slice(4),
    {
      sets: [
        [21, 15],
        [21, 12],
      ],
    },
  )
  await playLined(centralId, futsal, ten, ten.slice(0, 5), ten.slice(5), {
    goals: [1, 1],
  })
  await playLined(
    centralId,
    tennis,
    [ana, bia, caio, davi],
    [ana, bia],
    [caio, davi],
    {
      sets: [
        { games: [6, 4], tiebreak: null },
        { games: [3, 6], tiebreak: null },
        { points: [10, 8] },
      ],
    },
  )

  const ignored = await createMeetup(ana, beach, centralId, 'Ignorada')
  await joinAll(ignored, [bia, caio, davi])
  await startMeetup(ignored)
  const draft = await createMatch(ignored)
  const pending = await createMatch(ignored)
  await lineup(pending, [ana, bia], [caio, davi])
  await result(pending, {
    sets: [
      [21, 10],
      [21, 12],
    ],
  })
  await asUser(ana.userId, (client) =>
    client.query(`select public.submit_match($1)`, [pending]),
  )
  const disputed = await createMatch(ignored)
  await lineup(disputed, [ana, bia], [caio, davi])
  await result(disputed, {
    sets: [
      [21, 19],
      [18, 21],
      [15, 13],
    ],
  })
  await asUser(ana.userId, (client) =>
    client.query(`select public.submit_match($1)`, [disputed]),
  )
  await asUser(bia.userId, (client) =>
    client.query(`select public.dispute_match($1)`, [disputed]),
  )
  const voided = await createMatch(ignored)
  await asUser(ana.userId, (client) =>
    client.query(`select public.void_match($1)`, [voided]),
  )
  expect(draft).toBeTruthy()

  publicSlug = await createCommunity(ana, 'public', [beach.sportId])
  communityVenueId = await createVenue(ana, 'Quadra da comunidade', publicSlug)
  for (const person of [bia, caio, davi]) {
    await asUser(person.userId, (client) =>
      client.query(`select public.join_public_community($1)`, [publicSlug]),
    )
  }
  const communityMeetup = await createCommunityMeetup(
    publicSlug,
    beach,
    communityVenueId,
  )
  for (const person of [bia, caio, davi]) {
    await asUser(person.userId, (client) =>
      client.query(`select public.join_community_meetup($1)`, [
        communityMeetup,
      ]),
    )
  }
  await startMeetup(communityMeetup)
  const communityMatch = await createMatch(communityMeetup)
  await lineup(communityMatch, [ana, bia], [caio, davi])
  await result(communityMatch, {
    sets: [
      [21, 17],
      [21, 19],
    ],
  })
  await submitAndConfirm(communityMatch, ana.userId, caio.userId)

  privateSlug = await createCommunity(ana, 'private', [beach.sportId])
  await createVenue(ana, 'Quadra privada', privateSlug)

  await asUser(ana.userId, (client) =>
    client.query(`select public.cancel_meetup($1)`, [manualMeetup]),
  )
  await asUser(ana.userId, (client) =>
    client.query(`select public.update_venue($1, 'Quadra Renomeada', '')`, [
      twinId,
    ]),
  )
  await asUser(ana.userId, (client) =>
    client.query(`select public.archive_venue($1)`, [centralId]),
  )
}, 180_000)

afterAll(async () => {
  await admin(async (client) => {
    await client.query(
      `delete from public.meetups
       where organizer_id in (
         select id from auth.users where email like $1
       )`,
      [`%${suffix}@padre.test`],
    )
    await client.query(
      `delete from public.venues
       where created_by in (
         select id from auth.users where email like $1
       )`,
      [`%${suffix}@padre.test`],
    )
    await client.query(
      `delete from public.communities
       where created_by in (
         select id from auth.users where email like $1
       )`,
      [`%${suffix}@padre.test`],
    )
    await client.query(`delete from auth.users where email like $1`, [
      `%${suffix}@padre.test`,
    ])
  })
})

describe('venue statistics', () => {
  it('counts confirmed matches once per player and keeps venues apart', async () => {
    const anaSummary = await summary(ana.userId, beach.sportId, null)
    const central = venue(anaSummary, centralId)
    const twin = venue(anaSummary, twinId)
    expect(central.visible).toBe(true)
    expect(central.status).toBe('archived')
    expect(central.name).toBe('Quadra Central')
    expect(twin.name).toBe('Quadra Renomeada')
    expect(central.venue_id).not.toBe(twin.venue_id)
    const beachSport = central.sports.find(
      (sport) => sport.sport_id === beach.sportId,
    )
    expect(beachSport).toMatchObject({
      matches_played: 3,
      wins: 2,
      losses: 1,
      draws: 0,
    })
    expect(
      beachSport?.formats.find(
        (format) => format.sport_format_id === beach.formatId,
      ),
    ).toMatchObject({ matches_played: 2 })
    expect(
      beachSport?.formats.find(
        (format) => format.sport_format_id === beachFour.formatId,
      ),
    ).toMatchObject({ matches_played: 1 })
    expect(twin.sports[0]).toMatchObject({
      matches_played: 1,
      wins: 1,
      losses: 0,
    })
    expect(anaSummary.unassigned.sports[0]?.matches_played).toBe(1)
    expect(
      anaSummary.venues.some(
        (row) => row.venue_id === centralId && row.name === 'Quadra Renomeada',
      ),
    ).toBe(false)

    const filtered = await summary(ana.userId, beach.sportId, beach.formatId)
    expect(venue(filtered, centralId).sports[0]).toMatchObject({
      matches_played: 2,
      wins: 1,
      losses: 1,
      win_rate: 50,
      points_for: expect.any(Number),
      sets_won: expect.any(Number),
    })
    expect(venue(filtered, centralId).sports[0]?.goals_for).toBeUndefined()
    expect(
      filtered.venues.some(
        (row) =>
          row.venue_id === twinId && row.sports[0]?.sport_id === futsal.sportId,
      ),
    ).toBe(false)

    const futsalOnly = await summary(ana.userId, futsal.sportId, null)
    expect(venue(futsalOnly, centralId).sports[0]).toMatchObject({
      matches_played: 1,
      draws: 1,
      wins: 0,
      losses: 0,
      goals_for: 1,
    })
    expect(venue(futsalOnly, centralId).sports[0]?.points_for).toBeUndefined()
    expect(futsalOnly.venues.some((row) => row.venue_id === twinId)).toBe(false)

    const tennisOnly = await summary(ana.userId, tennis.sportId, null)
    expect(venue(tennisOnly, centralId).sports[0]).toMatchObject({
      matches_played: 1,
      games_won: 9,
      games_lost: 10,
      sets_won: 2,
      deciding_points_for: 10,
    })
  })

  it('gives each player one contribution and the venue one match', async () => {
    const rows = await admin((client) =>
      client.query<{ user_id: string; result: string }>(
        `select user_id, result
         from public.match_player_statistics
         where match_id = $1
         order by user_id`,
        [centralMatch],
      ),
    )
    expect(rows.rows).toHaveLength(4)
    expect(new Set(rows.rows.map((row) => row.user_id)).size).toBe(4)
    expect(rows.rows.find((row) => row.user_id === ana.userId)?.result).toBe(
      'win',
    )
    expect(rows.rows.find((row) => row.user_id === caio.userId)?.result).toBe(
      'loss',
    )

    const second = await admin((client) =>
      client.query<{ result: string }>(
        `select result from public.match_player_statistics
         where match_id = $1 and user_id = $2`,
        [secondMatch, ana.userId],
      ),
    )
    expect(second.rows[0]?.result).toBe('loss')

    const usage = await asUser(bia.userId, (client) =>
      client.query<{
        usage: {
          venues: Array<{
            venue_id: string
            confirmed_matches: number
            sports: unknown[]
          }>
        }
      }>(`select public.community_venue_usage($1) as usage`, [publicSlug]),
    )
    const community = usage.rows[0]!.usage.venues.find(
      (row) => row.venue_id === communityVenueId,
    )
    expect(community?.confirmed_matches).toBe(1)
    expect(JSON.stringify(community)).not.toContain(ana.userId)

    const snapshot = await admin((client) =>
      client.query<{ location_name: string }>(
        `select location_name from public.meetups where venue_id = $1 limit 1`,
        [twinId],
      ),
    )
    expect(snapshot.rows[0]?.location_name).toBe('Quadra Central')

    const before = await admin((client) =>
      client.query<{ count: string }>(
        `select count(*)::text as count
         from public.match_player_statistics
         where match_id in ($1, $2)`,
        [centralMatch, secondMatch],
      ),
    )
    await admin((client) =>
      client.query(`select private.reproject_all_statistics()`),
    )
    const after = await admin((client) =>
      client.query<{ count: string }>(
        `select count(*)::text as count
         from public.match_player_statistics
         where match_id in ($1, $2)`,
        [centralMatch, secondMatch],
      ),
    )
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count)
    expect(
      await summary(ana.userId, beach.sportId, beach.formatId),
    ).toBeTruthy()
  })

  it('hides other people, former members and outsiders', async () => {
    await expect(
      asUser(lia.userId, (client) =>
        client.query(`select public.my_venue_statistic($1)`, [centralId]),
      ),
    ).rejects.toMatchObject({ code: 'P0001' })

    const biaView = await summary(bia.userId, null, null)
    const hidden = venue(biaView, centralId)
    expect(hidden.visible).toBe(false)
    expect(hidden.name).toBeUndefined()
    expect(JSON.stringify(hidden)).not.toContain(centralMatch)
    expect(
      hidden.sports.find((sport) => sport.sport_id === beach.sportId)
        ?.matches_played,
    ).toBe(3)

    await expect(
      asUser(lia.userId, (client) =>
        client.query(`select public.community_venue_usage($1)`, [privateSlug]),
      ),
    ).rejects.toMatchObject({ code: 'P0001' })
    await expect(
      asUser(lia.userId, (client) =>
        client.query(`select public.community_venue_usage($1)`, [publicSlug]),
      ),
    ).rejects.toMatchObject({ code: '42501' })

    await asUser(bia.userId, (client) =>
      client.query(`select public.leave_community($1)`, [publicSlug]),
    )
    await expect(
      asUser(bia.userId, (client) =>
        client.query(`select public.community_venue_usage($1)`, [publicSlug]),
      ),
    ).rejects.toMatchObject({ code: '42501' })
    const afterLeave = venue(
      await summary(bia.userId, beach.sportId, null),
      communityVenueId,
    )
    expect(afterLeave.visible).toBe(false)
    expect(afterLeave.name).toBeUndefined()
    expect(afterLeave.sports[0]?.matches_played).toBe(1)

    await expect(
      asUser(
        null,
        (client) => client.query(`select public.my_venue_statistics()`),
        'anon',
      ),
    ).rejects.toMatchObject({ code: '42501' })
  })
})

function venue(summaryRow: Summary, id: string) {
  const found = summaryRow.venues.find((row) => row.venue_id === id)
  if (!found) throw new Error(id)
  return found
}

async function summary(
  userId: string,
  sportId: string | null,
  formatId: string | null,
) {
  const result = await asUser(userId, (client) =>
    client.query<{ summary: Summary }>(
      `select public.my_venue_statistics($1, $2) as summary`,
      [sportId, formatId],
    ),
  )
  return result.rows[0]!.summary
}

async function createVenue(
  owner: Account,
  name: string,
  slug: string | null = null,
) {
  const created = await asUser(owner.userId, (client) =>
    client.query<{ venue: { id: string } }>(
      `select public.create_venue($1, 'Rua 1', '', null, null, $2) as venue`,
      [name, slug],
    ),
  )
  return created.rows[0]!.venue.id
}

async function playBeach(
  venueId: string | null,
  side1: Account[],
  side2: Account[],
  meetupId?: string,
) {
  const meetup = meetupId ?? (await createMeetup(ana, beach, venueId, 'Areia'))
  if (!meetupId) await joinAll(meetup, [bia, caio, davi])
  if (!meetupId) await startMeetup(meetup)
  const matchId = await createMatch(meetup)
  await lineup(matchId, side1, side2)
  await result(matchId, {
    sets: [
      [21, 15],
      [21, 18],
    ],
  })
  await submitAndConfirm(matchId, side1[0]!.userId, side2[0]!.userId)
  return { meetupId: meetup, matchId }
}

async function playLined(
  venueId: string,
  format: Format,
  people: Account[],
  side1: Account[],
  side2: Account[],
  payload: unknown,
) {
  const meetupId = await createMeetup(ana, format, venueId, format.formatId)
  await joinAll(
    meetupId,
    people.filter((person) => person.userId !== ana.userId),
  )
  await startMeetup(meetupId)
  const matchId = await createMatch(meetupId)
  await lineup(matchId, side1, side2)
  await result(matchId, payload)
  await submitAndConfirm(matchId, side1[0]!.userId, side2[0]!.userId)
}

async function createMeetup(
  owner: Account,
  format: Format,
  venueId: string | null,
  title: string,
) {
  const created = await asUser(owner.userId, (client) =>
    client.query<{ id: string }>(
      `select public.create_meetup(
         $1, $2, $3, '',
         now() + interval '2 days',
         now() + interval '2 days 2 hours',
         'America/Sao_Paulo',
         'Quadra Central', '', 10, $4
       ) as id`,
      [format.formatId, format.ruleId, title, venueId],
    ),
  )
  return created.rows[0]!.id
}

async function createCommunityMeetup(
  slug: string,
  format: Format,
  venueId: string,
) {
  const created = await asUser(ana.userId, (client) =>
    client.query<{ id: string }>(
      `select public.create_community_meetup(
         $1, $2, $3, 'Coletivo', '',
         now() + interval '2 days',
         now() + interval '2 days 2 hours',
         'America/Sao_Paulo',
         '', '', 4, $4
       ) as id`,
      [slug, format.formatId, format.ruleId, venueId],
    ),
  )
  return created.rows[0]!.id
}

async function createCommunity(
  person: Account,
  visibility: 'public' | 'private',
  sportIds: string[],
) {
  const created = await asUser(person.userId, (client) =>
    client.query<{ community: { slug: string } }>(
      `select public.create_community($1, 'Quadra', $2, $3::uuid[]) as community`,
      [`Grupo ${person.username} ${suffix}`, visibility, sportIds],
    ),
  )
  return created.rows[0]!.community.slug
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

async function createMatch(meetupId: string) {
  const created = await asUser(ana.userId, (client) =>
    client.query<{ id: string }>(`select public.create_match($1) as id`, [
      meetupId,
    ]),
  )
  return created.rows[0]!.id
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

async function startMeetup(meetupId: string) {
  await admin(async (client) => {
    await client.query('begin')
    await client.query(`select set_config('padre.meetup_write', 'on', true)`)
    await client.query(
      `update public.meetups
       set starts_at = now() - interval '1 hour',
           ends_at = now() + interval '1 hour'
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
