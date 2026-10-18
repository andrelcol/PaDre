import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

type Env = {
  url: string
  anonKey: string
  databaseUrl: string
}

type Account = {
  email: string
  password: string
  username: string
  displayName: string
  userId: string
  accessToken: string
}

const env = loadEnv()
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
let ana: Account
let bia: Account

beforeAll(async () => {
  ana = await mustSignup({
    email: `ana-${suffix}@padre.test`,
    password: 'senha-segura',
    username: `Ana_${suffix}`,
    displayName: 'Ana José',
    metadata: { visibility: 'public' },
  })
  bia = await mustSignup({
    email: `bia-${suffix}@padre.test`,
    password: 'senha-segura',
    username: `bia_${suffix}`,
    displayName: 'Bia',
  })
})

afterAll(async () => {
  await admin(async (client) => {
    await client.query(`delete from auth.users where email like $1`, [
      `%${suffix}@padre.test`,
    ])
  })
})

describe('identity database policies', () => {
  it('creates one private profile and private preferences for each signup', async () => {
    const rows = await admin(async (client) => {
      const profiles = await client.query<{
        username: string
        display_name: string
        visibility: string
        timezone: string
      }>(
        `select p.username, p.display_name, p.visibility, f.timezone
         from public.profiles p
         join public.profile_preferences f on f.user_id = p.id
         where p.id = $1`,
        [ana.userId],
      )
      return profiles.rows
    })

    expect(rows).toEqual([
      {
        username: `ana_${suffix}`,
        display_name: 'Ana José',
        visibility: 'private',
        timezone: 'America/Sao_Paulo',
      },
    ])
  })

  it('rejects an invalid username and does not keep the account', async () => {
    const email = `joao-${suffix}@padre.test`
    const result = await signup({
      email,
      password: 'senha-segura',
      username: 'João',
      displayName: 'João',
    })

    expect(result.status).toBeGreaterThanOrEqual(400)
    const count = await admin(async (client) => {
      const found = await client.query(
        `select 1 from auth.users where email = $1`,
        [email],
      )
      return found.rowCount
    })
    expect(count).toBe(0)
  })

  it('rejects a username that differs only by case', async () => {
    const result = await signup({
      email: `ana-dup-${suffix}@padre.test`,
      password: 'senha-segura',
      username: `ANA_${suffix}`,
      displayName: 'Outra Ana',
    })

    expect(result.status).toBeGreaterThanOrEqual(400)
  })

  it('lets the owner read and update the profile without changing the id or created_at', async () => {
    const before = await admin(async (client) => {
      const row = await client.query<{ id: string; created_at: Date }>(
        `select id, created_at from public.profiles where id = $1`,
        [ana.userId],
      )
      return row.rows[0]
    })

    const updated = await asRole(
      'authenticated',
      ana.userId,
      async (client) => {
        const own = await client.query<{ username: string }>(
          `select username from public.profiles where id = $1`,
          [ana.userId],
        )
        const write = await client.query(
          `update public.profiles
         set display_name = 'Ana Souza', visibility = 'public'
         where id = $1`,
          [ana.userId],
        )
        return { username: own.rows[0]?.username, rowCount: write.rowCount }
      },
      true,
    )

    expect(updated).toEqual({ username: `ana_${suffix}`, rowCount: 1 })

    const after = await admin(async (client) => {
      const row = await client.query<{
        id: string
        display_name: string
        visibility: string
        created_at: Date
      }>(
        `select id, display_name, visibility, created_at from public.profiles where id = $1`,
        [ana.userId],
      )
      return row.rows[0]
    })

    expect(after?.id).toBe(before?.id)
    expect(after?.created_at.toISOString()).toBe(
      before?.created_at.toISOString(),
    )
    expect(after?.display_name).toBe('Ana Souza')
    expect(after?.visibility).toBe('public')
  })

  it('blocks changing the profile id and updated_at directly', async () => {
    await expect(
      asRole('authenticated', ana.userId, (client) =>
        client.query(`update public.profiles set id = $1 where id = $2`, [
          bia.userId,
          ana.userId,
        ]),
      ),
    ).rejects.toMatchObject({ code: '42501' })

    await expect(
      asRole('authenticated', ana.userId, (client) =>
        client.query(
          `update public.profiles set updated_at = now() where id = $1`,
          [ana.userId],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('blocks writing another profile and reading another preference', async () => {
    const write = await asRole('authenticated', bia.userId, (client) =>
      client.query(
        `update public.profiles set display_name = 'invasor' where id = $1`,
        [ana.userId],
      ),
    )
    expect(write.rowCount).toBe(0)

    const preferences = await asRole('authenticated', bia.userId, (client) =>
      client.query(
        `select timezone from public.profile_preferences where user_id = $1`,
        [ana.userId],
      ),
    )
    expect(preferences.rows).toEqual([])

    const name = await admin(async (client) => {
      const row = await client.query<{ display_name: string }>(
        `select display_name from public.profiles where id = $1`,
        [ana.userId],
      )
      return row.rows[0]?.display_name
    })
    expect(name).toBe('Ana Souza')
  })

  it('shows a public profile to another authenticated user and hides a private one', async () => {
    const publicRows = await asRole('authenticated', bia.userId, (client) =>
      client.query<{ username: string; display_name: string }>(
        `select username, display_name from public.profiles where id = $1`,
        [ana.userId],
      ),
    )
    expect(publicRows.rows).toEqual([
      { username: `ana_${suffix}`, display_name: 'Ana Souza' },
    ])

    const privateRows = await asRole('authenticated', ana.userId, (client) =>
      client.query(`select username from public.profiles where id = $1`, [
        bia.userId,
      ]),
    )
    expect(privateRows.rows).toEqual([])
  })

  it('rejects anonymous reads, inserts, friends visibility and an unknown time zone', async () => {
    await expect(
      asRole('anon', null, (client) =>
        client.query(`select id from public.profiles`),
      ),
    ).rejects.toMatchObject({ code: '42501' })

    await expect(
      asRole('authenticated', ana.userId, (client) =>
        client.query(
          `insert into public.profiles (id, username, display_name)
           values ($1, 'intruso_local', 'Intruso')`,
          [bia.userId],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' })

    await expect(
      asRole('authenticated', ana.userId, (client) =>
        client.query(
          `update public.profiles set visibility = 'friends' where id = $1`,
          [ana.userId],
        ),
      ),
    ).rejects.toMatchObject({ code: '23514' })

    await expect(
      asRole('authenticated', ana.userId, (client) =>
        client.query(
          `update public.profile_preferences set timezone = 'Mars/Olympus' where user_id = $1`,
          [ana.userId],
        ),
      ),
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('enforces the same boundaries through the REST API', async () => {
    const own = await rest(
      ana.accessToken,
      `profiles?select=username,visibility&id=eq.${ana.userId}`,
    )
    expect(own.status).toBe(200)
    expect(own.body).toEqual([
      { username: `ana_${suffix}`, visibility: 'public' },
    ])

    const hiddenPreferences = await rest(
      bia.accessToken,
      `profile_preferences?select=timezone&user_id=eq.${ana.userId}`,
    )
    expect(hiddenPreferences.status).toBe(200)
    expect(hiddenPreferences.body).toEqual([])

    const anonymous = await rest(env.anonKey, 'profiles?select=id')
    expect(anonymous.status).toBeGreaterThanOrEqual(400)

    const blockedWrite = await rest(
      bia.accessToken,
      `profiles?id=eq.${ana.userId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ display_name: 'pela api' }),
      },
    )
    expect([200, 204]).toContain(blockedWrite.status)

    const unchanged = await admin(async (client) => {
      const row = await client.query<{ display_name: string }>(
        `select display_name from public.profiles where id = $1`,
        [ana.userId],
      )
      return row.rows[0]?.display_name
    })
    expect(unchanged).toBe('Ana Souza')
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

async function signup(input: {
  email: string
  password: string
  username: string
  displayName: string
  metadata?: Record<string, string>
}) {
  const response = await fetch(`${env.url}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      apikey: env.anonKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      data: {
        username: input.username,
        display_name: input.displayName,
        ...input.metadata,
      },
    }),
  })
  const body = (await response.json()) as {
    msg?: string
    message?: string
    access_token?: string
    user?: { id?: string }
    session?: { access_token?: string } | null
  }
  return {
    status: response.status,
    userId: body.user?.id ?? null,
    accessToken: body.access_token ?? body.session?.access_token ?? null,
    message: body.msg ?? body.message ?? '',
  }
}

async function mustSignup(input: {
  email: string
  password: string
  username: string
  displayName: string
  metadata?: Record<string, string>
}): Promise<Account> {
  const result = await signup(input)
  if (result.status !== 200 || !result.userId || !result.accessToken) {
    throw new Error(`Cadastro falhou (${result.status}): ${result.message}`)
  }
  return { ...input, userId: result.userId, accessToken: result.accessToken }
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
  commit = false,
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
      await client.query(commit ? 'commit' : 'rollback')
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
