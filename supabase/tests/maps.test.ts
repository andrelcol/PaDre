import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

type Env = { url: string; anonKey: string; databaseUrl: string }
type Account = { username: string; userId: string }
type Venue = {
  id: string
  latitude: string | null
  longitude: string | null
  name: string
  address: string
}

const volleyball = 'a1000000-0000-4000-8000-000000000001'
const env = loadEnv()
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
let ana: Account
let bia: Account
let caio: Account
let format: { formatId: string; ruleId: string }
let publicSlug = ''
let privateSlug = ''

beforeAll(async () => {
  ;[ana, bia, caio] = await Promise.all([
    mustSignup('ana'),
    mustSignup('bia'),
    mustSignup('caio'),
  ])
  const catalog = await admin((client) =>
    client.query<{ format_id: string; rule_id: string }>(
      `select sport_formats.id as format_id, scoring_rule_versions.id as rule_id
       from public.sport_formats
       join public.scoring_rule_versions
         on scoring_rule_versions.format_id = sport_formats.id
        and scoring_rule_versions.active
       where sport_formats.sport_id = $1
       limit 1`,
      [volleyball],
    ),
  )
  format = {
    formatId: catalog.rows[0]!.format_id,
    ruleId: catalog.rows[0]!.rule_id,
  }
  publicSlug = await createCommunity(ana, 'public')
  privateSlug = await createCommunity(ana, 'private')
  await asUser(bia.userId, (client) =>
    client.query(`select public.join_public_community($1)`, [publicSlug]),
  )
})

afterAll(async () => {
  await admin(async (client) => {
    const emails = [`%${suffix}@padre.test`]
    await client.query(
      `delete from public.meetups
       where organizer_id in (select id from auth.users where email like $1)`,
      emails,
    )
    await client.query(
      `delete from public.venues
       where created_by in (select id from auth.users where email like $1)
          or community_id in (
            select id from public.communities
            where created_by in (select id from auth.users where email like $1)
          )`,
      emails,
    )
    await client.query(
      `delete from public.communities
       where created_by in (select id from auth.users where email like $1)`,
      emails,
    )
    await client.query(`delete from auth.users where email like $1`, emails)
  })
})

describe('venue locations', () => {
  it('stores a valid pair and rejects an incomplete or invalid one', async () => {
    const placed = await createVenue(
      ana,
      'Quadra válida',
      'Rua 1',
      -23.55,
      -46.63,
    )
    expect(Number(placed.latitude)).toBeCloseTo(-23.55)
    expect(Number(placed.longitude)).toBeCloseTo(-46.63)

    const plain = await createVenue(ana, 'Sem ponto', 'Rua 2', null, null)
    expect(plain.latitude).toBeNull()
    expect(plain.longitude).toBeNull()

    await expect(
      createVenue(ana, 'Só latitude', 'Rua 3', -23.5, null),
    ).rejects.toThrow(/invalid coordinates/)
    await expect(
      createVenue(ana, 'Só longitude', 'Rua 4', null, -46.6),
    ).rejects.toThrow(/invalid coordinates/)
    await expect(createVenue(ana, 'Fora', 'Rua 5', 91, 0)).rejects.toThrow(
      /invalid coordinates/,
    )
    await expect(rawCoordinate(ana, 'NaN', '10')).rejects.toThrow()
    await expect(rawCoordinate(ana, '10', 'Infinity')).rejects.toThrow()
  })

  it('lets the owner pin a venue once and hides personal coordinates from others', async () => {
    const created = await createVenue(
      ana,
      'Quadra pessoal',
      'Rua Pessoal',
      null,
      null,
    )
    const pinned = await setLocation(ana, created.id, -23.1, -46.1)
    expect(Number(pinned.latitude)).toBeCloseTo(-23.1)
    await expect(setLocation(ana, created.id, -23.2, -46.2)).rejects.toThrow(
      /location already set/,
    )
    await expect(setLocation(bia, created.id, -23.3, -46.3)).rejects.toThrow(
      /not found/,
    )

    const mine = await listMine(ana)
    expect(mine.some((venue) => venue.id === created.id)).toBe(true)
    const others = await listMine(bia)
    expect(others.some((venue) => venue.id === created.id)).toBe(false)
  })

  it('shows community coordinates only to active members', async () => {
    const created = await createVenue(
      ana,
      'Ginásio do grupo',
      'Avenida 1',
      -22.9,
      -43.2,
      publicSlug,
    )
    const members = await listCommunity(bia, publicSlug)
    expect(members.some((venue) => venue.address === 'Avenida 1')).toBe(true)
    await expect(listCommunity(caio, publicSlug)).rejects.toMatchObject({
      code: '42501',
    })
    await expect(listCommunity(caio, privateSlug)).rejects.toThrow(/not found/)
    await expect(setLocation(bia, created.id, -22.8, -43.1)).rejects.toThrow(
      /not allowed/,
    )

    const open = await createVenue(
      ana,
      'Quadra nova',
      'Rua Nova',
      null,
      null,
      publicSlug,
    )
    const pinned = await setLocation(ana, open.id, -22.5, -43.1)
    expect(Number(pinned.latitude)).toBeCloseTo(-22.5)
    await expect(setLocation(ana, open.id, -22.4, -43)).rejects.toThrow(
      /location already set/,
    )
  })

  it('keeps the meetup snapshot when the venue receives a position later', async () => {
    const manual = await createMeetup(
      ana,
      null,
      'Manual',
      'Rua digitada',
      null,
      null,
    )
    const manualPoint = await placeOf(manual)
    expect(manualPoint.location_name).toBe('Manual')
    expect(manualPoint.location_latitude).toBeNull()

    const marked = await createMeetup(
      ana,
      null,
      'Manual marcado',
      'Rua marcada',
      -23.4,
      -46.5,
    )
    const markedPoint = await placeOf(marked)
    expect(Number(markedPoint.location_latitude)).toBeCloseTo(-23.4)
    expect(Number(markedPoint.location_longitude)).toBeCloseTo(-46.5)
    expect(markedPoint.venue_id).toBeNull()

    const venue = await createVenue(
      ana,
      'Quadra futura',
      'Rua Futura',
      null,
      null,
    )
    const meetupId = await createMeetup(ana, venue.id, '', '', null, null)
    const before = await placeOf(meetupId)
    expect(before.location_latitude).toBeNull()
    expect(before.venue_id).toBe(venue.id)

    await setLocation(ana, venue.id, -23.7, -46.7)
    const after = await placeOf(meetupId)
    expect(after.location_latitude).toBeNull()
    expect(after.location_name).toBe('Quadra futura')

    const ready = await createVenue(
      ana,
      'Quadra pronta',
      'Rua Pronta',
      -23.8,
      -46.8,
    )
    const copied = await createMeetup(ana, ready.id, '', '', null, null)
    const snapshot = await placeOf(copied)
    expect(Number(snapshot.location_latitude)).toBeCloseTo(-23.8)
    expect(snapshot.location_name).toBe('Quadra pronta')

    await asUser(ana.userId, (client) =>
      client.query(
        `select public.update_venue($1, 'Quadra pronta nova', null)`,
        [ready.id],
      ),
    )
    const preserved = await placeOf(copied)
    expect(preserved.location_name).toBe('Quadra pronta')
    expect(Number(preserved.location_latitude)).toBeCloseTo(-23.8)

    await expect(
      asUser(bia.userId, (client) =>
        client.query(`select public.get_meetup($1)`, [copied]),
      ),
    ).rejects.toThrow(/not allowed/)
  })
})

async function createVenue(
  person: Account,
  name: string,
  address: string,
  latitude: number | null,
  longitude: number | null,
  slug: string | null = null,
) {
  const result = await asUser(person.userId, (client) =>
    client.query<{ venue: Venue }>(
      `select public.create_venue($1, $2, null, $3, $4, $5) as venue`,
      [name, address, latitude, longitude, slug],
    ),
  )
  return result.rows[0]!.venue
}

async function rawCoordinate(
  person: Account,
  latitude: string,
  longitude: string,
) {
  return asUser(person.userId, (client) =>
    client.query(
      `select public.create_venue('Ponto invalido', 'Rua X', null, $1::numeric, $2::numeric, null)`,
      [latitude, longitude],
    ),
  )
}

async function setLocation(
  person: Account,
  venueId: string,
  latitude: number,
  longitude: number,
) {
  const result = await asUser(person.userId, (client) =>
    client.query<{ venue: Venue }>(
      `select public.set_venue_location($1, $2, $3) as venue`,
      [venueId, latitude, longitude],
    ),
  )
  return result.rows[0]!.venue
}

async function listMine(person: Account) {
  const result = await asUser(person.userId, (client) =>
    client.query<{ venues: Venue[] }>(
      `select public.list_my_venues() as venues`,
    ),
  )
  return result.rows[0]!.venues
}

async function listCommunity(person: Account, slug: string) {
  const result = await asUser(person.userId, (client) =>
    client.query<{ venues: Venue[] }>(
      `select public.list_community_venues($1) as venues`,
      [slug],
    ),
  )
  return result.rows[0]!.venues
}

async function createMeetup(
  person: Account,
  venueId: string | null,
  name: string,
  address: string,
  latitude: number | null,
  longitude: number | null,
) {
  const result = await asUser(person.userId, (client) =>
    client.query<{ id: string }>(
      `select public.create_meetup(
         $1, $2, 'Encontro', '',
         now() + interval '4 days',
         now() + interval '4 days 2 hours',
         'America/Sao_Paulo', $3, $4, 8, $5, $6, $7
       ) as id`,
      [
        format.formatId,
        format.ruleId,
        name,
        address,
        venueId,
        latitude,
        longitude,
      ],
    ),
  )
  return result.rows[0]!.id
}

async function placeOf(meetupId: string) {
  const result = await admin((client) =>
    client.query<{
      venue_id: string | null
      location_name: string
      location_latitude: string | null
      location_longitude: string | null
    }>(
      `select venue_id, location_name, location_latitude, location_longitude
       from public.meetups where id = $1`,
      [meetupId],
    ),
  )
  return result.rows[0]!
}

async function createCommunity(
  person: Account,
  visibility: 'public' | 'private',
) {
  const created = await asUser(person.userId, (client) =>
    client.query<{ community: { slug: string } }>(
      `select public.create_community($1, 'Quadra', $2, $3::uuid[]) as community`,
      [`Grupo ${person.username} ${suffix}`, visibility, [volleyball]],
    ),
  )
  return created.rows[0]!.community.slug
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

async function asUser<T>(userId: string, run: (client: Client) => Promise<T>) {
  return admin(async (client) => {
    await client.query('begin')
    try {
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: userId, role: 'authenticated' }),
      ])
      await client.query(
        `select set_config('request.jwt.claim.sub', $1, true)`,
        [userId],
      )
      await client.query(`set local role authenticated`)
      const result = await run(client)
      await client.query('commit')
      return result
    } catch (error) {
      await client.query('rollback')
      throw error
    }
  })
}

async function mustSignup(label: string) {
  const username = `${label}${suffix}`.replace(/[^a-z0-9_]/g, '').slice(0, 30)
  const response = await fetch(`${env.url}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: env.anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      email: `${label}-${suffix}@padre.test`,
      password: 'senha-segura',
      data: { username, display_name: label },
    }),
  })
  const body = (await response.json()) as { user?: { id?: string } }
  if (!body.user?.id) throw new Error(`Cadastro de ${label} falhou.`)
  return { username, userId: body.user.id }
}
