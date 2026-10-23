import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

type Env = { url: string; anonKey: string; databaseUrl: string }
type Account = { username: string; userId: string }
type Venue = {
  id: string
  name: string
  address: string
  details: string | null
  latitude: string | null
  longitude: string | null
  status: string
  scope: string
}
type Format = { formatId: string; ruleId: string }
type MeetupPlace = {
  venue_id: string | null
  location_name: string
  location_address: string | null
  location_details: string | null
  title: string
}

const volleyball = 'a1000000-0000-4000-8000-000000000001'
const env = loadEnv()
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
let ana: Account
let bia: Account
let caio: Account
let davi: Account
let format: Format
let slug = ''
let privateSlug = ''
let otherSlug = ''

beforeAll(async () => {
  ;[ana, bia, caio, davi] = await Promise.all([
    mustSignup('ana'),
    mustSignup('bia'),
    mustSignup('caio'),
    mustSignup('davi'),
  ])
  const catalog = await admin((client) =>
    client.query<{ format_id: string; rule_id: string }>(
      `select sport_formats.id as format_id, scoring_rule_versions.id as rule_id
       from public.sport_formats
       join public.scoring_rule_versions
         on scoring_rule_versions.format_id = sport_formats.id
        and scoring_rule_versions.active
       where sport_formats.sport_id = $1
       order by sport_formats.name
       limit 1`,
      [volleyball],
    ),
  )
  format = {
    formatId: catalog.rows[0]!.format_id,
    ruleId: catalog.rows[0]!.rule_id,
  }
  slug = await createCommunity(ana, 'public', [volleyball])
  privateSlug = await createCommunity(ana, 'private', [volleyball])
  otherSlug = await createCommunity(davi, 'public', [volleyball])
  for (const person of [bia, caio]) {
    await asUser(person.userId, (client) =>
      client.query(`select public.join_public_community($1)`, [slug]),
    )
  }
  await asUser(ana.userId, (client) =>
    client.query(`select public.set_community_member_role($1, $2, 'admin')`, [
      slug,
      bia.username,
    ]),
  )
})

afterAll(async () => {
  await admin(async (client) => {
    const emails = [`%${suffix}@padre.test`]
    await client.query(
      `delete from public.meetups
       where organizer_id in (select id from auth.users where email like $1)
          or community_id in (
            select id from public.communities
            where created_by in (select id from auth.users where email like $1)
          )`,
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

describe('venues', () => {
  it('keeps a personal venue in the creator catalog only', async () => {
    const created = await createVenue(ana, {
      name: 'Quadra do José',
      address: 'Rua São João, 10',
      details: 'Entrada pelo portão lateral.',
    })
    expect(created.scope).toBe('personal')
    expect(created.latitude).toBeNull()
    expect(created.longitude).toBeNull()
    expect(created.name).toBe('Quadra do José')

    const mine = await listMine(ana)
    expect(mine.map((venue) => venue.id)).toContain(created.id)
    const others = await listMine(bia)
    expect(others.map((venue) => venue.id)).not.toContain(created.id)

    await expect(
      updateVenue(bia, created.id, 'Outro nome', null),
    ).rejects.toMatchObject({
      code: 'P0001',
    })
    await expect(archiveVenue(bia, created.id)).rejects.toMatchObject({
      code: 'P0001',
    })
    await expect(
      asUser(bia.userId, (client) =>
        client.query(
          `update public.venues set name = 'Invasão' where id = $1`,
          [created.id],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('lets an admin publish a community venue and keeps members from editing it', async () => {
    const created = await createVenue(bia, {
      name: 'Ginásio Central',
      address: 'Avenida do Clube, 20',
      details: 'Quadra coberta ao lado do ginásio.',
      slug,
    })
    expect(created.scope).toBe('community')
    const visible = await listCommunity(caio, slug)
    expect(visible.map((venue) => venue.id)).toContain(created.id)

    await expect(
      updateVenue(caio, created.id, 'Nome alterado', 'Detalhe novo'),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(archiveVenue(caio, created.id)).rejects.toMatchObject({
      code: '42501',
    })
    await expect(
      createVenue(caio, {
        name: 'Tentativa',
        address: 'Rua fechada',
        slug,
      }),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(
      updateVenue(davi, created.id, 'De fora', null),
    ).rejects.toMatchObject({
      code: 'P0001',
    })
    await expect(listCommunity(davi, privateSlug)).rejects.toMatchObject({
      code: 'P0001',
    })
    await expect(listCommunity(davi, slug)).rejects.toMatchObject({
      code: '42501',
    })

    const renamed = await updateVenue(
      ana,
      created.id,
      'Ginásio Central',
      'Use o portão 2.',
    )
    expect(renamed.details).toBe('Use o portão 2.')
    expect(renamed.address).toBe('Avenida do Clube, 20')
  })

  it('rejects invalid coordinates and accepts a place without them', async () => {
    await expect(
      createVenue(ana, {
        name: 'Sem par',
        address: 'Rua A',
        latitude: -23.5,
        longitude: null,
      }),
    ).rejects.toThrow(/invalid coordinates/)
    await expect(
      createVenue(ana, {
        name: 'Fora do mapa',
        address: 'Rua B',
        latitude: 91,
        longitude: 0,
      }),
    ).rejects.toThrow(/invalid coordinates/)

    const placed = await createVenue(ana, {
      name: 'Com ponto',
      address: 'Rua C',
      latitude: -23.55,
      longitude: -46.63,
    })
    expect(Number(placed.latitude)).toBeCloseTo(-23.55)
    expect(Number(placed.longitude)).toBeCloseTo(-46.63)
  })

  it('keeps equal names as different venues and snapshots the meetup place', async () => {
    const first = await createVenue(ana, {
      name: 'Quadra Central',
      address: 'Rua Um, 1',
      details: 'Coberta',
    })
    const second = await createVenue(ana, {
      name: 'Quadra Central',
      address: 'Rua Dois, 2',
    })
    expect(first.id).not.toBe(second.id)

    const manual = await privateMeetup(ana, null, 'Manual', 'Rua digitada')
    const linked = await privateMeetup(ana, first.id, '', '')
    const manualRow = await placeOf(manual)
    const linkedRow = await placeOf(linked)
    expect(manualRow.venue_id).toBeNull()
    expect(manualRow.location_name).toBe('Manual')
    expect(linkedRow).toMatchObject({
      venue_id: first.id,
      location_name: 'Quadra Central',
      location_address: 'Rua Um, 1',
      location_details: 'Coberta',
    })

    await updateVenue(ana, first.id, 'Quadra Central Renomeada', 'Nova dica')
    const afterRename = await placeOf(linked)
    expect(afterRename.location_name).toBe('Quadra Central')
    expect(afterRename.location_details).toBe('Coberta')

    const communityVenue = await createVenue(ana, {
      name: 'Quadra do grupo',
      address: 'Rua do grupo, 3',
      slug,
    })
    const communityMeetup = await communityMeetupWith(
      caio,
      slug,
      communityVenue.id,
    )
    expect((await placeOf(communityMeetup)).venue_id).toBe(communityVenue.id)
    await expect(privateMeetup(ana, communityVenue.id, '', '')).rejects.toThrow(
      /not found/,
    )
    await expect(communityMeetupWith(caio, slug, first.id)).rejects.toThrow(
      /not found/,
    )
    const otherVenue = await createVenue(davi, {
      name: 'Quadra alheia',
      address: 'Rua de Davi',
      slug: otherSlug,
    })
    await expect(
      communityMeetupWith(caio, slug, otherVenue.id),
    ).rejects.toThrow(/not found/)
    await expect(privateMeetup(bia, first.id, '', '')).rejects.toThrow(
      /not found/,
    )
  })

  it('archives a venue without rewriting history and blocks a new selection', async () => {
    const venue = await createVenue(ana, {
      name: 'Quadra antiga',
      address: 'Rua Velha, 4',
    })
    const meetupId = await privateMeetup(ana, venue.id, '', '')
    const before = await placeOf(meetupId)
    const matchesBefore = await countMatches(meetupId)
    const archived = await archiveVenue(ana, venue.id)
    expect(archived.status).toBe('archived')
    expect(await placeOf(meetupId)).toEqual(before)
    expect(await countMatches(meetupId)).toBe(matchesBefore)
    await expect(privateMeetup(ana, venue.id, '', '')).rejects.toThrow(
      /venue archived/,
    )
    await expect(
      admin((client) =>
        client.query(`delete from public.venues where id = $1`, [venue.id]),
      ),
    ).rejects.toThrow(/violates foreign key constraint|restrict/i)
  })

  it('changes a meetup place only through the explicit operation', async () => {
    const original = await createVenue(ana, {
      name: 'Origem',
      address: 'Rua Origem',
    })
    const next = await createVenue(ana, {
      name: 'Destino',
      address: 'Rua Destino',
      details: 'Portão azul',
    })
    const meetupId = await privateMeetup(ana, original.id, '', '')
    const stored = await scheduleOf(meetupId)
    await asUser(ana.userId, (client) =>
      client.query(
        `select public.update_meetup($1,$2,$3,'Título novo','',$4,$5,$6,'Lugar ignorado','Rua ignorada',$7)`,
        [
          meetupId,
          format.formatId,
          format.ruleId,
          stored.starts_at,
          stored.ends_at,
          stored.time_zone,
          stored.max_participants,
        ],
      ),
    )
    expect(await placeOf(meetupId)).toMatchObject({
      title: 'Título novo',
      venue_id: original.id,
      location_name: 'Origem',
      location_address: 'Rua Origem',
    })

    await asUser(ana.userId, (client) =>
      client.query(`select public.set_meetup_place($1, $2, '', '', '')`, [
        meetupId,
        next.id,
      ]),
    )
    expect(await placeOf(meetupId)).toMatchObject({
      venue_id: next.id,
      location_name: 'Destino',
      location_address: 'Rua Destino',
      location_details: 'Portão azul',
    })
    await asUser(ana.userId, (client) =>
      client.query(
        `select public.set_meetup_place($1, null, 'Manual novo', 'Rua nova', 'Levar rede')`,
        [meetupId],
      ),
    )
    expect(await placeOf(meetupId)).toMatchObject({
      venue_id: null,
      location_name: 'Manual novo',
      location_address: 'Rua nova',
      location_details: 'Levar rede',
    })
  })

  it('locks the place after another person confirms', async () => {
    const venue = await createVenue(ana, {
      name: 'Travada',
      address: 'Rua Trava',
      slug,
    })
    const other = await createVenue(ana, {
      name: 'Outra',
      address: 'Rua Outra',
      slug,
    })
    const meetupId = await communityMeetupWith(ana, slug, venue.id)
    await asUser(caio.userId, (client) =>
      client.query(`select public.join_community_meetup($1)`, [meetupId]),
    )
    await expect(
      asUser(ana.userId, (client) =>
        client.query(`select public.set_meetup_place($1, $2, '', '', '')`, [
          meetupId,
          other.id,
        ]),
      ),
    ).rejects.toThrow(/structural change locked/)
    expect((await placeOf(meetupId)).venue_id).toBe(venue.id)
  })

  it('lists only meetups the reader can already see', async () => {
    const personal = await createVenue(ana, {
      name: 'Catálogo pessoal',
      address: 'Rua Pessoal',
    })
    const visible = await privateMeetup(ana, personal.id, '', '')
    const hidden = await privateMeetup(davi, null, 'Segredo', 'Rua secreta')
    await linkVenue(personal.id, hidden)
    const page = await listMeetups(ana, personal.id)
    expect(page.meetups.map((meetup) => meetup.id)).toContain(visible)
    expect(page.meetups.map((meetup) => meetup.id)).not.toContain(hidden)
    await expect(listMeetups(bia, personal.id)).rejects.toMatchObject({
      code: 'P0001',
    })

    const shared = await createVenue(ana, {
      name: 'Compartilhada',
      address: 'Rua Comum',
      slug,
    })
    const communityId = await communityMeetupWith(ana, slug, shared.id)
    const outsider = await privateMeetup(davi, null, 'Privado de Davi', 'Casa')
    await linkVenue(shared.id, outsider)
    const communityPage = await listMeetups(caio, shared.id)
    expect(communityPage.meetups.map((meetup) => meetup.id)).toContain(
      communityId,
    )
    expect(communityPage.meetups.map((meetup) => meetup.id)).not.toContain(
      outsider,
    )
    expect(communityPage.total).toBe(communityPage.meetups.length)
  })
})

async function createVenue(
  person: Account,
  input: {
    name: string
    address: string
    details?: string | null
    latitude?: number | null
    longitude?: number | null
    slug?: string | null
  },
) {
  const result = await asUser(person.userId, (client) =>
    client.query<{ venue: Venue }>(
      `select public.create_venue($1, $2, $3, $4, $5, $6) as venue`,
      [
        input.name,
        input.address,
        input.details ?? null,
        input.latitude ?? null,
        input.longitude ?? null,
        input.slug ?? null,
      ],
    ),
  )
  return result.rows[0]!.venue
}

async function updateVenue(
  person: Account,
  venueId: string,
  name: string,
  details: string | null,
) {
  const result = await asUser(person.userId, (client) =>
    client.query<{ venue: Venue }>(
      `select public.update_venue($1, $2, $3) as venue`,
      [venueId, name, details],
    ),
  )
  return result.rows[0]!.venue
}

async function archiveVenue(person: Account, venueId: string) {
  const result = await asUser(person.userId, (client) =>
    client.query<{ venue: Venue }>(`select public.archive_venue($1) as venue`, [
      venueId,
    ]),
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

async function listCommunity(person: Account, communitySlug: string) {
  const result = await asUser(person.userId, (client) =>
    client.query<{ venues: Venue[] }>(
      `select public.list_community_venues($1) as venues`,
      [communitySlug],
    ),
  )
  return result.rows[0]!.venues
}

async function listMeetups(person: Account, venueId: string) {
  const result = await asUser(person.userId, (client) =>
    client.query<{
      page: { meetups: { id: string }[]; total: number }
    }>(`select public.list_venue_meetups($1, 20, 0) as page`, [venueId]),
  )
  return result.rows[0]!.page
}

async function privateMeetup(
  person: Account,
  venueId: string | null,
  name: string,
  address: string,
) {
  const result = await asUser(person.userId, (client) =>
    client.query<{ id: string }>(
      `select public.create_meetup(
         $1, $2, 'Encontro', '',
         now() + interval '4 days',
         now() + interval '4 days 2 hours',
         'America/Sao_Paulo', $3, $4, 8, $5
       ) as id`,
      [format.formatId, format.ruleId, name, address, venueId],
    ),
  )
  return result.rows[0]!.id
}

async function communityMeetupWith(
  person: Account,
  communitySlug: string,
  venueId: string,
) {
  const result = await asUser(person.userId, (client) =>
    client.query<{ id: string }>(
      `select public.create_community_meetup(
         $1, $2, $3, 'Encontro do grupo', '',
         now() + interval '5 days',
         now() + interval '5 days 2 hours',
         'America/Sao_Paulo', '', '', 8, $4
       ) as id`,
      [communitySlug, format.formatId, format.ruleId, venueId],
    ),
  )
  return result.rows[0]!.id
}

async function placeOf(meetupId: string) {
  const result = await admin((client) =>
    client.query<MeetupPlace>(
      `select venue_id, location_name, location_address, location_details, title
       from public.meetups where id = $1`,
      [meetupId],
    ),
  )
  return result.rows[0]!
}

async function scheduleOf(meetupId: string) {
  const result = await admin((client) =>
    client.query<{
      starts_at: Date
      ends_at: Date
      time_zone: string
      max_participants: number
    }>(
      `select starts_at, ends_at, time_zone, max_participants
       from public.meetups where id = $1`,
      [meetupId],
    ),
  )
  return result.rows[0]!
}

async function linkVenue(venueId: string, meetupId: string) {
  await admin(async (client) => {
    await client.query('begin')
    await client.query(`select set_config('padre.meetup_write', 'on', true)`)
    await client.query(
      `update public.meetups set venue_id = $1 where id = $2`,
      [venueId, meetupId],
    )
    await client.query('commit')
  })
}

async function countMatches(meetupId: string) {
  const result = await admin((client) =>
    client.query<{ count: string }>(
      `select count(*)::text as count from public.matches where meetup_id = $1`,
      [meetupId],
    ),
  )
  return Number(result.rows[0]!.count)
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
