import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'

type Env = {
  url: string
  anonKey: string
  databaseUrl: string
}

const env = loadEnv()
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const expectedSports = [
  'volleyball',
  'beach-volleyball',
  'futsal',
  'beach-tennis',
  'footvolley',
]

describe('sports catalog', () => {
  afterAll(async () => {
    await admin(async (client) => {
      await client.query(`delete from auth.users where email like $1`, [
        `%${suffix}@padre.test`,
      ])
    })
  })

  it('stores the five sports, unique slugs and their formats', async () => {
    const rows = await admin(async (client) => {
      const result = await client.query<{
        slug: string
        format_slug: string
        players_per_side_min: number
        players_per_side_max: number
        version: number
        rule_type: string
      }>(
        `select s.slug, f.slug as format_slug, f.players_per_side_min,
                f.players_per_side_max, r.version, r.rule_type
         from public.sports s
         join public.sport_formats f on f.sport_id = s.id
         join public.scoring_rule_versions r on r.format_id = f.id
         order by s.display_order, f.display_order`,
      )
      return result.rows
    })

    expect(new Set(rows.map((row) => row.slug))).toEqual(
      new Set(expectedSports),
    )
    expect(
      rows
        .filter((row) => row.slug === 'volleyball')
        .map((row) => row.format_slug),
    ).toEqual(['indoor-6x6', 'indoor-4x4'])
    expect(rows.filter((row) => row.slug === 'footvolley')).toEqual([
      expect.objectContaining({
        format_slug: 'footvolley-2x2',
        players_per_side_min: 2,
        players_per_side_max: 2,
        version: 1,
        rule_type: 'set_based',
      }),
    ])
    expect(rows.every((row) => row.version === 1)).toBe(true)
  })

  it('keeps stable identifiers and one active rule per format', async () => {
    const ids = await admin(async (client) => {
      const result = await client.query<{ sport_id: string; rule_id: string }>(
        `select s.id as sport_id, r.id as rule_id
         from public.sports s
         join public.sport_formats f on f.sport_id = s.id
         join public.scoring_rule_versions r on r.format_id = f.id
         where s.slug = 'volleyball' and f.slug = 'indoor-6x6'`,
      )
      return result.rows[0]
    })

    expect(ids).toEqual({
      sport_id: 'a1000000-0000-4000-8000-000000000001',
      rule_id: 'a3000000-0000-4000-8000-000000000001',
    })
  })

  it('rejects a duplicate version, a bad config and a silent rewrite', async () => {
    await expect(
      admin((client) =>
        client.query(
          `insert into public.scoring_rule_versions
             (id, format_id, version, rule_type, origin, config)
           values (
             'a3000000-0000-4000-8000-000000000099',
             'a2000000-0000-4000-8000-000000000001',
             1,
             'set_based',
             'app_proposal',
             '{"sets_to_win":3,"points_to_win_set":25,"minimum_point_difference":2,"deciding_set_points":15,"point_cap":null}'::jsonb
           )`,
        ),
      ),
    ).rejects.toMatchObject({ code: '23505' })

    await expect(
      admin((client) =>
        client.query(
          `insert into public.scoring_rule_versions
             (id, format_id, version, rule_type, origin, config)
           values (
             'a3000000-0000-4000-8000-000000000098',
             'a2000000-0000-4000-8000-000000000005',
             2,
             'goal_based',
             'app_proposal',
             '{"allows_draw":true,"tie_break":"penalties"}'::jsonb
           )`,
        ),
      ),
    ).rejects.toMatchObject({ code: '23514' })

    await expect(
      admin((client) =>
        client.query(
          `update public.scoring_rule_versions
           set config = jsonb_set(config, '{points_to_win_set}', '11')
           where id = 'a3000000-0000-4000-8000-000000000001'`,
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('hides inactive rows and blocks writes from anon and authenticated', async () => {
    const visible = await asRole('anon', null, (client) =>
      client.query<{ slug: string }>(
        `select slug from public.sports order by display_order`,
      ),
    )
    expect(visible.rows.map((row) => row.slug)).toEqual(expectedSports)

    const hidden = await admin(async (client) => {
      await client.query('begin')
      try {
        await client.query(
          `update public.sports set active = false where slug = 'futsal'`,
        )
        await client.query(`set local role anon`)
        const rows = await client.query<{ slug: string }>(
          `select slug from public.sports where slug = 'futsal'`,
        )
        await client.query('rollback')
        return rows.rows
      } catch (error) {
        await client.query('rollback')
        throw error
      }
    })
    expect(hidden).toEqual([])

    await expect(
      asRole('anon', null, (client) =>
        client.query(
          `insert into public.sports (id, slug, name, display_order)
           values ('a1000000-0000-4000-8000-000000000099', 'handball', 'Handebol', 9)`,
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' })

    await expect(
      asRole(
        'authenticated',
        'a1000000-0000-4000-8000-000000000091',
        (client) =>
          client.query(
            `update public.sports set name = 'Outro' where slug = 'futsal'`,
          ),
      ),
    ).rejects.toMatchObject({ code: '42501' })

    await expect(
      asRole(
        'authenticated',
        'a1000000-0000-4000-8000-000000000091',
        (client) =>
          client.query(
            `delete from public.sport_formats where slug = 'indoor-6x6'`,
          ),
      ),
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('lets anonymous and authenticated clients read the catalog over HTTP', async () => {
    const anonymous = await rest(
      env.anonKey,
      'sports?select=slug&order=display_order',
    )
    expect(anonymous.status).toBe(200)
    expect(anonymous.body).toEqual(expectedSports.map((slug) => ({ slug })))

    const account = await mustSignup()
    const formats = await rest(
      account.accessToken,
      'sport_formats?select=slug,sports!inner(slug)&sports.slug=eq.beach-tennis&order=display_order',
    )
    expect(formats.status).toBe(200)
    expect(formats.body).toEqual([
      { slug: 'singles', sports: { slug: 'beach-tennis' } },
      { slug: 'doubles', sports: { slug: 'beach-tennis' } },
    ])

    const write = await rest(account.accessToken, 'sports', {
      method: 'POST',
      body: JSON.stringify({
        id: 'a1000000-0000-4000-8000-000000000097',
        slug: 'handball',
        name: 'Handebol',
        display_order: 9,
      }),
    })
    expect(write.status).toBeGreaterThanOrEqual(400)
  })

  it('applies the catalog migration on an empty database', async () => {
    const maintenance = new Client({ connectionString: env.databaseUrl })
    await maintenance.connect()
    await maintenance.query(
      `select pg_terminate_backend(pid)
       from pg_stat_activity
       where datname = 'padre_catalog_clean' and pid <> pg_backend_pid()`,
    )
    await maintenance.query('drop database if exists padre_catalog_clean')
    await maintenance.query('create database padre_catalog_clean')
    await maintenance.end()

    const clean = new Client({
      connectionString: env.databaseUrl.replace(
        /\/postgres$/,
        '/padre_catalog_clean',
      ),
    })
    await clean.connect()
    try {
      const sql = readFileSync(
        new URL(
          '../migrations/20261018190000_sports_catalog.sql',
          import.meta.url,
        ),
        'utf8',
      )
      await clean.query(sql)
      const sports = await clean.query<{ slug: string }>(
        `select slug from public.sports order by display_order`,
      )
      const rules = await clean.query<{ count: string }>(
        `select count(*)::text as count from public.scoring_rule_versions`,
      )
      expect(sports.rows.map((row) => row.slug)).toEqual(expectedSports)
      expect(rules.rows[0]?.count).toBe('8')
    } finally {
      await clean.end()
      const drop = new Client({ connectionString: env.databaseUrl })
      await drop.connect()
      await drop.query(
        `select pg_terminate_backend(pid)
         from pg_stat_activity
         where datname = 'padre_catalog_clean' and pid <> pg_backend_pid()`,
      )
      await drop.query('drop database if exists padre_catalog_clean')
      await drop.end()
    }
  })
})

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

async function asRole<T>(
  role: 'anon' | 'authenticated',
  userId: string | null,
  run: (client: Client) => Promise<T>,
) {
  return admin(async (client) => {
    await client.query('begin')
    try {
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: userId, role }),
      ])
      await client.query(`set local role ${role}`)
      const result = await run(client)
      await client.query('rollback')
      return result
    } catch (error) {
      await client.query('rollback')
      throw error
    }
  })
}

async function rest(accessToken: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${env.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env.anonKey,
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
      ...init.headers,
    },
  })
  const text = await response.text()
  return {
    status: response.status,
    body: text ? (JSON.parse(text) as unknown) : null,
  }
}

async function mustSignup() {
  const response = await fetch(`${env.url}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      apikey: env.anonKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: `catalog-${suffix}@padre.test`,
      password: 'senha-segura',
      data: {
        username: `cat_${suffix}`,
        display_name: 'Catálogo',
      },
    }),
  })
  const body = (await response.json()) as {
    access_token?: string
    user?: { id?: string }
  }
  if (!body.access_token || !body.user?.id) {
    throw new Error(
      `Cadastro do teste de catálogo falhou (${response.status}).`,
    )
  }
  return { accessToken: body.access_token, userId: body.user.id }
}
