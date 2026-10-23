import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

type Env = { url: string; anonKey: string; databaseUrl: string }
type Account = { username: string; userId: string }

const env = loadEnv()
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
let owner: Account
let admin: Account
let member: Account
let outsider: Account
let spare: Account
let slug: string
let privateSlug: string
let sportId: string

const attributes = [
  { name: 'Saque', description: 'Qualidade do saque' },
  { name: 'Passe', description: 'Qualidade do passe' },
  { name: 'Ataque', description: 'Qualidade do ataque' },
  { name: 'Defesa', description: 'Qualidade da defesa' },
  { name: 'Levantamento', description: 'Qualidade do levantamento' },
]

beforeAll(async () => {
  ;[owner, admin, member, outsider, spare] = await Promise.all(
    ['andre', 'paulo', 'lucas', 'rafael', 'eva'].map((label) =>
      mustSignup(label, label),
    ),
  )
  const sport = await adminQuery<{ id: string }>(
    `select id from public.sports where slug = 'beach-volleyball'`,
  )
  sportId = sport.rows[0]!.id
  slug = await createCommunity(owner, 'public')
  privateSlug = await createCommunity(owner, 'private')
  for (const person of [admin, member, spare]) {
    await asUser(person.userId, (client) =>
      client.query(`select public.join_public_community($1)`, [slug]),
    )
  }
  await asUser(owner.userId, (client) =>
    client.query(`select public.set_community_member_role($1, $2, 'admin')`, [
      slug,
      admin.username,
    ]),
  )
})

afterAll(async () => {
  await adminQuery(
    `delete from public.communities where created_by in (
       select id from auth.users where email like $1
     )`,
    [`%${suffix}@padre.test`],
  )
  await adminQuery(`delete from auth.users where email like $1`, [
    `%${suffix}@padre.test`,
  ])
})

describe('player cards and profile details', () => {
  it('publishes one active template and keeps votes on that version', async () => {
    await expect(
      asUser(member.userId, (client) =>
        client.query(`select public.save_community_card_draft($1, $2::jsonb)`, [
          slug,
          JSON.stringify(attributes),
        ]),
      ),
    ).rejects.toMatchObject({ code: '42501' })

    await asUser(admin.userId, (client) =>
      client.query(`select public.save_community_card_draft($1, $2::jsonb)`, [
        slug,
        JSON.stringify(attributes.slice(0, 2)),
      ]),
    ).catch((error: { code?: string }) => {
      expect(error.code).toBe('P0001')
    })

    await expect(
      asUser(admin.userId, (client) =>
        client.query(`select public.save_community_card_draft($1, $2::jsonb)`, [
          slug,
          JSON.stringify([
            ...attributes,
            { name: 'Beleza', description: 'Aparência' },
          ]),
        ]),
      ),
    ).rejects.toMatchObject({ code: 'P0001' })

    await asUser(owner.userId, (client) =>
      client.query(`select public.save_community_card_draft($1, $2::jsonb)`, [
        slug,
        JSON.stringify([
          ...attributes,
          { name: 'Saque', description: 'Outro' },
        ]),
      ]),
    ).catch((error: { code?: string }) => {
      expect(error.code).toBe('23505')
    })

    await asUser(owner.userId, (client) =>
      client.query(`select public.save_community_card_draft($1, $2::jsonb)`, [
        slug,
        JSON.stringify(attributes),
      ]),
    )
    const published = await asUser(admin.userId, (client) =>
      client.query<{
        template: {
          active: {
            version: number
            attributes: { id: string; name: string }[]
          }
        }
      }>(`select public.publish_community_card_template($1) as template`, [
        slug,
      ]),
    )
    expect(published.rows[0]!.template.active.version).toBe(1)
    expect(published.rows[0]!.template.active.attributes).toHaveLength(5)

    await asUser(owner.userId, (client) =>
      client.query(`select public.save_community_card_draft($1, $2::jsonb)`, [
        slug,
        JSON.stringify(attributes),
      ]),
    )
    const activeCount = await adminQuery<{ count: string }>(
      `select count(*)::text as count
       from public.community_card_templates templates
       join public.communities on communities.id = templates.community_id
       where communities.slug = $1 and templates.status = 'active'`,
      [slug],
    )
    expect(activeCount.rows[0]!.count).toBe('1')
  })

  it('rates only active participants and keeps individual scores private', async () => {
    const beforeStats = await adminQuery<{ count: string }>(
      `select count(*)::text as count from public.match_player_statistics`,
    )
    await asUser(member.userId, (client) =>
      client.query(
        `select public.set_my_community_card_participation($1, true)`,
        [slug],
      ),
    )
    await expect(
      asUser(owner.userId, (client) =>
        client.query(
          `select public.set_my_community_card_participation($1, true)`,
          [slug],
        ),
      ),
    ).resolves.toBeTruthy()
    await asUser(owner.userId, (client) =>
      client.query(
        `select public.set_my_community_card_participation($1, false)`,
        [slug],
      ),
    )

    const template = await asUser(member.userId, (client) =>
      client.query<{
        template: { active: { attributes: { id: string; name: string }[] } }
      }>(`select public.get_community_card_template($1) as template`, [slug]),
    )
    const ids = Object.fromEntries(
      template.rows[0]!.template.active.attributes.map((attribute) => [
        attribute.name,
        attribute.id,
      ]),
    )
    const scores = [
      [admin, 80],
      [spare, 90],
      [owner, 85],
    ] as const
    for (const [person, score] of scores) {
      for (const attribute of template.rows[0]!.template.active.attributes) {
        await asUser(person.userId, (client) =>
          client.query(`select public.rate_community_player($1, $2, $3, $4)`, [
            slug,
            member.username,
            attribute.id,
            attribute.name === 'Saque' ? score : 70,
          ]),
        )
      }
    }
    await asUser(admin.userId, (client) =>
      client.query(`select public.rate_community_player($1, $2, $3, $4)`, [
        slug,
        member.username,
        ids.Saque,
        80,
      ]),
    )

    const card = await asUser(member.userId, (client) =>
      client.query<{
        card: {
          overall: number
          attributes: { name: string; average: number; voters: number }[]
          state: string
        }
      }>(`select public.get_community_player_card($1, $2) as card`, [
        slug,
        member.username,
      ]),
    )
    const saque = card.rows[0]!.card.attributes.find(
      (attribute) => attribute.name === 'Saque',
    )
    expect(saque).toMatchObject({ average: 85, voters: 3 })
    expect(card.rows[0]!.card.overall).toBe(73)
    expect(JSON.stringify(card.rows[0]!.card)).not.toContain(admin.userId)

    const pending = await asUser(member.userId, (client) =>
      client.query<{ card: { state: string; overall: number | null } }>(
        `select public.get_community_player_card($1, $2) as card`,
        [slug, admin.username],
      ),
    ).catch((error: { code?: string }) => error)
    expect(pending).toMatchObject({ code: 'P0001' })

    await expect(
      asUser(member.userId, (client) =>
        client.query(`select public.rate_community_player($1, $2, $3, 50)`, [
          slug,
          member.username,
          ids.Saque,
        ]),
      ),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(
      asUser(outsider.userId, (client) =>
        client.query(`select public.list_community_player_cards($1)`, [slug]),
      ),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(
      asUser(outsider.userId, (client) =>
        client.query(`select public.list_community_player_cards($1)`, [
          privateSlug,
        ]),
      ),
    ).rejects.toMatchObject({ code: 'P0001' })
    await expect(
      asUser(admin.userId, (client) =>
        client.query(`select public.rate_community_player($1, $2, $3, 0)`, [
          slug,
          member.username,
          ids.Saque,
        ]),
      ),
    ).rejects.toMatchObject({ code: 'P0001' })
    await expect(
      asUser(admin.userId, (client) =>
        client.query(`select public.rate_community_player($1, $2, $3, 100)`, [
          slug,
          member.username,
          ids.Saque,
        ]),
      ),
    ).rejects.toMatchObject({ code: 'P0001' })
    await expect(
      asUser(admin.userId, (client) =>
        client.query(`select public.rate_community_player($1, $2, $3, 1.5)`, [
          slug,
          member.username,
          ids.Saque,
        ]),
      ),
    ).rejects.toBeTruthy()

    const own = await asUser(admin.userId, (client) =>
      client.query<{ ratings: { attribute_id: string; score: number }[] }>(
        `select public.get_my_community_player_rating($1, $2) as ratings`,
        [slug, member.username],
      ),
    )
    expect(
      own.rows[0]!.ratings.find((rating) => rating.attribute_id === ids.Saque)
        ?.score,
    ).toBe(80)
    await expect(
      asUser(admin.userId, (client) =>
        client.query(`select * from public.community_player_ratings`),
      ),
    ).rejects.toMatchObject({ code: '42501' })

    const rows = await adminQuery<{ count: string }>(
      `select count(*)::text as count
       from public.community_player_ratings ratings
       join public.community_card_attributes attributes on attributes.id = ratings.attribute_id
       where ratings.voter_user_id = $1 and attributes.name = 'Saque'`,
      [admin.userId],
    )
    expect(rows.rows[0]!.count).toBe('1')
    const afterStats = await adminQuery<{ count: string }>(
      `select count(*)::text as count from public.match_player_statistics`,
    )
    expect(afterStats.rows[0]!.count).toBe(beforeStats.rows[0]!.count)
  })

  it('drops a voter rating on leave and does not restore it', async () => {
    const before = await cardAverage('Saque')
    await asUser(spare.userId, (client) =>
      client.query(`select public.leave_community($1)`, [slug]),
    )
    const after = await cardAverage('Saque')
    expect(after.voters).toBe(before.voters - 1)
    expect(after.state).toBe('pending')
    await asUser(spare.userId, (client) =>
      client.query(`select public.join_public_community($1)`, [slug]),
    )
    const rejoined = await cardAverage('Saque')
    expect(rejoined.voters).toBe(after.voters)
    await expect(
      asUser(spare.userId, (client) =>
        client.query(`select public.rate_community_player($1, $2, $3, 90)`, [
          slug,
          member.username,
          after.id,
        ]),
      ),
    ).resolves.toBeTruthy()
  })

  it('hides a card when participation stops and starts clean', async () => {
    await asUser(member.userId, (client) =>
      client.query(
        `select public.set_my_community_card_participation($1, false)`,
        [slug],
      ),
    )
    const listed = await asUser(owner.userId, (client) =>
      client.query<{ cards: { cards: unknown[] } }>(
        `select public.list_community_player_cards($1) as cards`,
        [slug],
      ),
    )
    expect(JSON.stringify(listed.rows[0]!.cards)).not.toContain(member.username)
    await asUser(member.userId, (client) =>
      client.query(
        `select public.set_my_community_card_participation($1, true)`,
        [slug],
      ),
    )
    const fresh = await asUser(owner.userId, (client) =>
      client.query<{ card: { state: string; overall: number | null } }>(
        `select public.get_community_player_card($1, $2) as card`,
        [slug, member.username],
      ),
    )
    expect(fresh.rows[0]!.card.state).toBe('pending')
    expect(fresh.rows[0]!.card.overall).toBeNull()
  })

  it('keeps personal details optional and private', async () => {
    const own = await asUser(owner.userId, (client) =>
      client.query<{
        details: { height_cm: number | null; sex: string | null }
      }>(
        `select public.update_profile_details(null, '', false, false, false) as details`,
      ),
    )
    expect(own.rows[0]!.details.height_cm).toBeNull()
    expect(own.rows[0]!.details.sex).toBeNull()
    await expect(
      asUser(owner.userId, (client) =>
        client.query(
          `select public.update_profile_details(49, 'female', false, false, false)`,
        ),
      ),
    ).rejects.toMatchObject({ code: 'P0001' })
    await asUser(owner.userId, (client) =>
      client.query(
        `select public.update_profile_details(175, 'female', true, false, false)`,
      ),
    )
    await asUser(owner.userId, (client) =>
      client.query(
        `update public.profiles set visibility = 'public' where id = $1`,
        [owner.userId],
      ),
    )
    const hiddenSex = await asUser(member.userId, (client) =>
      client.query<{ details: { height_cm?: number; sex?: string } }>(
        `select public.get_visible_profile_details($1) as details`,
        [owner.username],
      ),
    )
    expect(hiddenSex.rows[0]!.details.height_cm).toBe(175)
    expect(hiddenSex.rows[0]!.details.sex).toBeUndefined()
    await asUser(owner.userId, (client) =>
      client.query(
        `update public.profiles set visibility = 'private' where id = $1`,
        [owner.userId],
      ),
    )
    await expect(
      asUser(member.userId, (client) =>
        client.query(`select public.get_visible_profile_details($1)`, [
          owner.username,
        ]),
      ),
    ).rejects.toMatchObject({ code: 'P0001' })
    const before = await asUser(owner.userId, (client) =>
      client.query<{ details: { height_cm: number } }>(
        `select public.get_own_profile_details() as details`,
      ),
    )
    await asUser(member.userId, (client) =>
      client.query(
        `select public.update_profile_details(160, 'male', true, true, true)`,
      ),
    )
    const after = await asUser(owner.userId, (client) =>
      client.query<{ details: { height_cm: number } }>(
        `select public.get_own_profile_details() as details`,
      ),
    )
    expect(after.rows[0]!.details.height_cm).toBe(
      before.rows[0]!.details.height_cm,
    )
    await expect(
      asUser(member.userId, (client) =>
        client.query(
          `update public.profile_personal_details set height_cm = 180 where user_id = $1`,
          [owner.userId],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' })

    const lonely = await mustSignup('livre', 'Livre')
    await asUser(lonely.userId, (client) =>
      client.query(
        `select public.update_profile_details(170, null, false, false, false)`,
      ),
    )
    await adminQuery(`delete from auth.users where id = $1`, [lonely.userId])
  })
})

async function cardAverage(name: string) {
  const card = await asUser(owner.userId, (client) =>
    client.query<{
      card: {
        state: string
        attributes: {
          id: string
          name: string
          average: number | null
          voters: number
          state: string
        }[]
      }
    }>(`select public.get_community_player_card($1, $2) as card`, [
      slug,
      member.username,
    ]),
  )
  const attribute = card.rows[0]!.card.attributes.find(
    (item) => item.name === name,
  )
  if (!attribute) throw new Error(name)
  return { ...attribute, state: card.rows[0]!.card.state }
}

async function createCommunity(
  person: Account,
  visibility: 'public' | 'private',
) {
  const created = await asUser(person.userId, (client) =>
    client.query<{ community: { slug: string } }>(
      `select public.create_community($1, 'Volei', $2, $3::uuid[]) as community`,
      [`Cartas ${person.username} ${suffix}`, visibility, [sportId]],
    ),
  )
  return created.rows[0]!.community.slug
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

async function adminQuery<T extends Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
) {
  const client = new Client({ connectionString: env.databaseUrl })
  await client.connect()
  try {
    return await client.query<T>(sql, params)
  } finally {
    await client.end()
  }
}

async function asUser<T>(userId: string, run: (client: Client) => Promise<T>) {
  const client = new Client({ connectionString: env.databaseUrl })
  await client.connect()
  try {
    await client.query('begin')
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: userId, role: 'authenticated' }),
    ])
    await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [
      userId,
    ])
    await client.query(`set local role authenticated`)
    const result = await run(client)
    await client.query('commit')
    return result
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    await client.end()
  }
}
