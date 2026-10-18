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
  username: string
  userId: string
  accessToken: string
}

const env = loadEnv()
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
let ana: Account
let bia: Account
let caio: Account

beforeAll(async () => {
  ana = await mustSignup('ana', 'Ana')
  bia = await mustSignup('bia', 'Bia')
  caio = await mustSignup('caio', 'Caio')
})

afterAll(async () => {
  await admin(async (client) => {
    await client.query(`delete from auth.users where email like $1`, [
      `%${suffix}@padre.test`,
    ])
  })
})

describe('friendships', () => {
  it('lets the addressee see the request and hides it from everyone else', async () => {
    const created = await asUser(ana.userId, (client) =>
      client.query<{ id: string; other_username: string }>(
        `select id, other_username from public.request_friendship($1)`,
        [bia.username],
      ),
    )
    expect(created.rows[0]?.other_username).toBe(bia.username)

    const incoming = await asUser(bia.userId, (client) =>
      client.query<{ side: string; other_username: string }>(
        `select side, other_username from public.list_my_friendships()`,
      ),
    )
    expect(incoming.rows).toEqual([
      { side: 'incoming', other_username: ana.username },
    ])

    const outgoing = await asUser(ana.userId, (client) =>
      client.query<{ side: string }>(
        `select side from public.list_my_friendships()`,
      ),
    )
    expect(outgoing.rows).toEqual([{ side: 'outgoing' }])

    const hidden = await asUser(caio.userId, (client) =>
      client.query(`select id from public.friendships`),
    )
    expect(hidden.rows).toEqual([])
  })

  it('accepts from both sides and refuses the requester, duplicates and outsiders', async () => {
    const friendshipId = (await friendshipBetween(ana.userId, bia.userId))?.id

    await expect(
      asUser(ana.userId, (client) =>
        client.query(
          `select * from public.respond_to_friendship($1, 'accept')`,
          [friendshipId],
        ),
      ),
    ).rejects.toMatchObject({ code: 'P0001' })

    await expect(
      asUser(ana.userId, (client) =>
        client.query(`select * from public.request_friendship($1)`, [
          bia.username,
        ]),
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining('already pending'),
    })

    await expect(
      asUser(caio.userId, (client) =>
        client.query(
          `select * from public.respond_to_friendship($1, 'accept')`,
          [friendshipId],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' })

    const accepted = await asUser(bia.userId, (client) =>
      client.query<{ status: string }>(
        `select status from public.respond_to_friendship($1, 'accept')`,
        [friendshipId],
      ),
    )
    expect(accepted.rows[0]?.status).toBe('accepted')

    const anaFriends = await asUser(ana.userId, (client) =>
      client.query<{ side: string; other_username: string }>(
        `select side, other_username from public.list_my_friendships()`,
      ),
    )
    const biaFriends = await asUser(bia.userId, (client) =>
      client.query<{ side: string; other_username: string }>(
        `select side, other_username from public.list_my_friendships()`,
      ),
    )
    expect(anaFriends.rows).toEqual([
      { side: 'friend', other_username: bia.username },
    ])
    expect(biaFriends.rows).toEqual([
      { side: 'friend', other_username: ana.username },
    ])
  })

  it('keeps one row when both people request each other together', async () => {
    const results = await Promise.allSettled([
      asUser(ana.userId, (client) =>
        client.query(`select id from public.request_friendship($1)`, [
          caio.username,
        ]),
      ),
      asUser(caio.userId, (client) =>
        client.query(`select id from public.request_friendship($1)`, [
          ana.username,
        ]),
      ),
    ])
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1)

    const rows = await admin((client) =>
      client.query<{ status: string }>(
        `select status from public.friendships
         where pair_low = least($1::uuid, $2::uuid)
           and pair_high = greatest($1::uuid, $2::uuid)`,
        [ana.userId, caio.userId],
      ),
    )
    expect(rows.rows).toEqual([{ status: 'pending' }])
    await closePair(ana.userId, caio.userId)
  })

  it('refuses a direct status change, a self request and an anonymous read', async () => {
    const friendship = await friendshipBetween(ana.userId, bia.userId)
    const friendshipId = friendship?.id

    await expect(
      asUser(ana.userId, (client) =>
        client.query(
          `update public.friendships set status = 'accepted' where id = $1`,
          [friendshipId],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' })

    const status = await admin((client) =>
      client.query<{ status: string }>(
        `select status from public.friendships where id = $1`,
        [friendshipId],
      ),
    )
    expect(status.rows[0]?.status).toBe('accepted')

    await expect(
      asUser(ana.userId, (client) =>
        client.query(`select * from public.request_friendship($1)`, [
          ana.username,
        ]),
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining('cannot friend yourself'),
    })

    await expect(
      asUser(ana.userId, (client) =>
        client.query(`select * from public.request_friendship($1)`, [
          'pessoa_inexistente',
        ]),
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining('user not found'),
    })

    await expect(
      asUser(
        null,
        (client) => client.query(`select id from public.friendships`),
        'anon',
      ),
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('reveals only the username of a private profile', async () => {
    const profile = await asUser(bia.userId, (client) =>
      client.query(
        `select display_name, visibility from public.profiles where id = $1`,
        [ana.userId],
      ),
    )
    expect(profile.rows).toEqual([])

    const preferences = await asUser(bia.userId, (client) =>
      client.query(
        `select timezone from public.profile_preferences where user_id = $1`,
        [ana.userId],
      ),
    )
    expect(preferences.rows).toEqual([])

    const listed = await asUser(bia.userId, (client) =>
      client.query(`select other_username from public.list_my_friendships()`),
    )
    expect(listed.rows).toEqual([{ other_username: ana.username }])
    expect(Object.keys(listed.rows[0] ?? {})).toEqual(['other_username'])
  })

  it('reopens a relationship only after the cooldown of a refusal, cancellation or removal', async () => {
    const acceptedId = (await friendshipBetween(ana.userId, bia.userId))?.id
    await asUser(ana.userId, (client) =>
      client.query(
        `select status from public.respond_to_friendship($1, 'remove')`,
        [acceptedId],
      ),
    )
    const gone = await asUser(bia.userId, (client) =>
      client.query(`select id from public.list_my_friendships()`),
    )
    expect(gone.rows).toEqual([])
    await expectReopenThenWait(bia.userId, ana.username)

    const pendingId = (await friendshipBetween(ana.userId, bia.userId))?.id
    await asUser(ana.userId, (client) =>
      client.query(
        `select status from public.respond_to_friendship($1, 'reject')`,
        [pendingId],
      ),
    )
    await expectReopenThenWait(bia.userId, ana.username)

    const nextId = (await friendshipBetween(ana.userId, bia.userId))?.id
    await asUser(bia.userId, (client) =>
      client.query(
        `select status from public.respond_to_friendship($1, 'cancel')`,
        [nextId],
      ),
    )
    await expectReopenThenWait(ana.userId, bia.username)
  })

  it('applies the friendship migration on a clean database', async () => {
    await admin(async (client) => {
      await client.query(
        `select pg_terminate_backend(pid)
         from pg_stat_activity
         where datname = 'padre_friendships_clean' and pid <> pg_backend_pid()`,
      )
      await client.query('drop database if exists padre_friendships_clean')
      await client.query('create database padre_friendships_clean')
    })

    const clean = new Client({
      connectionString: env.databaseUrl.replace(
        /\/postgres$/,
        '/padre_friendships_clean',
      ),
    })
    await clean.connect()
    try {
      await clean.query(`
        do $$
        begin
          if not exists (select 1 from pg_roles where rolname = 'anon') then
            create role anon nologin noinherit;
          end if;
          if not exists (select 1 from pg_roles where rolname = 'authenticated') then
            create role authenticated nologin noinherit;
          end if;
        end
        $$;
        create schema auth;
        create table auth.users (
          id uuid primary key,
          role text,
          raw_user_meta_data jsonb
        );
      `)
      const identity = readFileSync(
        new URL('../migrations/20261018170000_identity.sql', import.meta.url),
        'utf8',
      )
      const friendships = readFileSync(
        new URL(
          '../migrations/20261018200000_friendships.sql',
          import.meta.url,
        ),
        'utf8',
      )
      await clean.query(identity)
      await clean.query(friendships)
      const table = await clean.query(
        `select to_regclass('public.friendships') as name`,
      )
      expect(table.rows[0]?.name).toBe('friendships')
    } finally {
      await clean.end()
      await admin(async (client) => {
        await client.query(
          `select pg_terminate_backend(pid)
           from pg_stat_activity
           where datname = 'padre_friendships_clean' and pid <> pg_backend_pid()`,
        )
        await client.query('drop database if exists padre_friendships_clean')
      })
    }
  })
})

async function expectReopenThenWait(userId: string, username: string) {
  await expect(
    asUser(userId, (client) =>
      client.query(`select id from public.request_friendship($1)`, [username]),
    ),
  ).rejects.toMatchObject({ message: expect.stringContaining('cooldown') })

  await admin(async (client) => {
    await client.query('begin')
    try {
      await client.query(
        `select set_config('padre.friendship_write', 'on', true)`,
      )
      await client.query(
        `update public.friendships
         set closed_at = now() - interval '25 hours'
         where pair_low = least($1::uuid, $2::uuid)
           and pair_high = greatest($1::uuid, $2::uuid)`,
        [ana.userId, bia.userId],
      )
      await client.query('commit')
    } catch (error) {
      await client.query('rollback')
      throw error
    }
  })

  const reopened = await asUser(userId, (client) =>
    client.query<{ status: string }>(
      `select status from public.request_friendship($1)`,
      [username],
    ),
  )
  expect(reopened.rows[0]?.status).toBe('pending')
}

async function friendshipBetween(left: string, right: string) {
  const row = await admin((client) =>
    client.query<{ id: string; status: string }>(
      `select id, status from public.friendships
       where pair_low = least($1::uuid, $2::uuid)
         and pair_high = greatest($1::uuid, $2::uuid)`,
      [left, right],
    ),
  )
  return row.rows[0]
}

async function closePair(left: string, right: string) {
  const current = await friendshipBetween(left, right)
  if (!current || current.status !== 'pending') return
  const requester = await admin((client) =>
    client.query<{ requester_id: string }>(
      `select requester_id from public.friendships where id = $1`,
      [current.id],
    ),
  )
  await asUser(requester.rows[0]!.requester_id, (client) =>
    client.query(`select public.respond_to_friendship($1, 'cancel')`, [
      current.id,
    ]),
  )
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
    headers: {
      apikey: env.anonKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: `${label}-${suffix}@padre.test`,
      password: 'senha-segura',
      data: { username, display_name: displayName },
    }),
  })
  const body = (await response.json()) as {
    access_token?: string
    user?: { id?: string }
  }
  if (!body.access_token || !body.user?.id) {
    throw new Error(`Cadastro de ${label} falhou (${response.status}).`)
  }
  return {
    email: `${label}-${suffix}@padre.test`,
    username,
    userId: body.user.id,
    accessToken: body.access_token,
  }
}
