import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

type Env = { url: string; anonKey: string; databaseUrl: string }
type Account = { username: string; userId: string }
type CatalogIds = { formatId: string; ruleId: string }

const env = loadEnv()
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
let ana: Account
let bia: Account
let caio: Account
let catalog: CatalogIds

beforeAll(async () => {
  ana = await mustSignup('ana', 'Ana')
  bia = await mustSignup('bia', 'Bia')
  caio = await mustSignup('caio', 'Caio')
  catalog = await admin(async (client) => {
    const volleyball = await client.query<{
      format_id: string
      rule_id: string
    }>(
      `select sport_formats.id as format_id, scoring_rule_versions.id as rule_id
       from public.sport_formats
       join public.scoring_rule_versions
         on scoring_rule_versions.format_id = sport_formats.id
        and scoring_rule_versions.active
       where sport_formats.slug = 'indoor-6x6'`,
    )
    return {
      formatId: volleyball.rows[0]!.format_id,
      ruleId: volleyball.rows[0]!.rule_id,
    }
  })
  const requested = await asUser(ana.userId, (client) =>
    client.query<{ id: string }>(
      `select id from public.request_friendship($1)`,
      [bia.username],
    ),
  )
  await asUser(bia.userId, (client) =>
    client.query(`select public.respond_to_friendship($1, 'accept')`, [
      requested.rows[0]!.id,
    ]),
  )
})

afterAll(async () => {
  await admin(async (client) => {
    await client.query(`delete from auth.users where email like $1`, [
      `%${suffix}@padre.test`,
    ])
  })
})

describe('meetup invite links', () => {
  it('issues one hashed link and keeps the raw token out of the database', async () => {
    const meetupId = await createMeetup(ana.userId, 8, '2 days')
    const issued = await issueLink(ana.userId, meetupId)
    expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/)

    const stored = await admin((client) =>
      client.query<{
        hash: string
        bytes: number
        same_instant: boolean
      }>(
        `select encode(token_hash, 'hex') as hash,
                octet_length(token_hash) as bytes,
                expires_at = (
                  select starts_at from public.meetups where id = meetup_id
                ) as same_instant
         from public.meetup_invite_links
         where meetup_id = $1 and revoked_at is null`,
        [meetupId],
      ),
    )
    const columns = await admin((client) =>
      client.query<{ column_name: string }>(
        `select column_name
         from information_schema.columns
         where table_schema = 'public'
           and table_name = 'meetup_invite_links'`,
      ),
    )
    const row = stored.rows[0]!
    expect(row.bytes).toBe(32)
    expect(row.hash.includes(issued.token)).toBe(false)
    expect(columns.rows.map((column) => column.column_name)).not.toContain(
      'token',
    )
    expect(row.same_instant).toBe(true)

    const distantId = await createMeetup(ana.userId, 8, '10 days')
    const distant = await issueLink(ana.userId, distantId)
    const window = await admin((client) =>
      client.query<{ expires_at: Date }>(
        `select expires_at from public.meetup_invite_links
         where meetup_id = $1 and revoked_at is null`,
        [distantId],
      ),
    )
    const expiresAt = window.rows[0]!.expires_at.getTime()
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 7 * 24 * 60 * 60 * 1000)
    expect(expiresAt).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000)
    expect(distant.token).not.toBe(issued.token)
  })

  it('lets a stranger preview only the public fields and blocks anonymous confirmation', async () => {
    const meetupId = await createMeetup(ana.userId, 8, '3 days')
    const { token } = await issueLink(ana.userId, meetupId)
    const preview = await asUser(
      null,
      (client) =>
        client.query<{ preview: Record<string, unknown> }>(
          `select public.preview_meetup_invite($1) as preview`,
          [token],
        ),
      'anon',
    )
    const body = preview.rows[0]!.preview
    expect(body.status).toBe('open')
    expect(body.title).toBe('Vôlei na quadra')
    expect(body.location_name).toBe('Quadra do clube')
    expect(body).not.toHaveProperty('location_address')
    expect(body).not.toHaveProperty('token_hash')
    expect(JSON.stringify(body)).not.toContain(token)
    expect(JSON.stringify(body)).not.toContain(ana.username)

    await expect(
      asUser(
        null,
        (client) =>
          client.query(`select public.join_meetup_by_invite($1)`, [token]),
        'anon',
      ),
    ).rejects.toMatchObject({ code: '42501' })

    await expect(
      asUser(
        null,
        (client) => client.query(`select * from public.meetup_invite_links`),
        'anon',
      ),
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('lets someone who is not a friend join once, without creating a friendship', async () => {
    const meetupId = await createMeetup(ana.userId, 8, '3 days')
    const otherId = await createMeetup(ana.userId, 8, '4 days')
    const { token } = await issueLink(ana.userId, meetupId)
    const joined = await asUser(caio.userId, (client) =>
      client.query<{ id: string }>(
        `select public.join_meetup_by_invite($1) as id`,
        [token],
      ),
    )
    expect(joined.rows[0]!.id).toBe(meetupId)
    const again = await asUser(caio.userId, (client) =>
      client.query<{ id: string }>(
        `select public.join_meetup_by_invite($1) as id`,
        [token],
      ),
    )
    expect(again.rows[0]!.id).toBe(meetupId)

    const seats = await admin((client) =>
      client.query<{ count: string; friends: string }>(
        `select
           (select count(*)::text from public.meetup_participants
            where meetup_id = $1 and user_id = $2 and status = 'confirmed') as count,
           (select count(*)::text from public.friendships
            where pair_low = least($3::uuid, $2::uuid)
              and pair_high = greatest($3::uuid, $2::uuid)) as friends`,
        [meetupId, caio.userId, ana.userId],
      ),
    )
    expect(seats.rows[0]).toEqual({ count: '1', friends: '0' })

    await expect(
      asUser(caio.userId, (client) =>
        client.query(`select public.get_meetup($1)`, [otherId]),
      ),
    ).rejects.toMatchObject({ code: '42501' })
    const foreign = await asUser(caio.userId, (client) =>
      client.query<{ preview: { title?: string } }>(
        `select public.preview_meetup_invite($1) as preview`,
        [token],
      ),
    )
    expect(foreign.rows[0]!.preview.title).toBe('Vôlei na quadra')
  })

  it('turns a pending, declined or cancelled internal invite into accepted', async () => {
    const meetupId = await createMeetup(ana.userId, 8, '3 days')
    const pending = await asUser(ana.userId, (client) =>
      client.query<{ id: string }>(
        `select id from public.invite_to_meetup($1, $2)`,
        [meetupId, bia.username],
      ),
    )
    const { token } = await issueLink(ana.userId, meetupId)
    await asUser(bia.userId, (client) =>
      client.query(`select public.join_meetup_by_invite($1)`, [token]),
    )
    const pendingRow = await admin((client) =>
      client.query<{ status: string; count: string }>(
        `select
           (select status from public.meetup_invitations where id = $1) as status,
           (select count(*)::text from public.meetup_participants
            where meetup_id = $2 and status = 'confirmed') as count`,
        [pending.rows[0]!.id, meetupId],
      ),
    )
    expect(pendingRow.rows[0]).toEqual({ status: 'accepted', count: '2' })

    const declinedId = await createMeetup(ana.userId, 8, '4 days')
    const declined = await asUser(ana.userId, (client) =>
      client.query<{ id: string }>(
        `select id from public.invite_to_meetup($1, $2)`,
        [declinedId, bia.username],
      ),
    )
    await asUser(bia.userId, (client) =>
      client.query(
        `select public.respond_to_meetup_invitation($1, 'decline')`,
        [declined.rows[0]!.id],
      ),
    )
    const declinedToken = (await issueLink(ana.userId, declinedId)).token
    await asUser(bia.userId, (client) =>
      client.query(`select public.join_meetup_by_invite($1)`, [declinedToken]),
    )
    const declinedRow = await admin((client) =>
      client.query<{ status: string }>(
        `select status from public.meetup_invitations where id = $1`,
        [declined.rows[0]!.id],
      ),
    )
    expect(declinedRow.rows[0]?.status).toBe('accepted')

    const cancelledId = await createMeetup(ana.userId, 8, '5 days')
    const cancelled = await asUser(ana.userId, (client) =>
      client.query<{ id: string }>(
        `select id from public.invite_to_meetup($1, $2)`,
        [cancelledId, bia.username],
      ),
    )
    await asUser(ana.userId, (client) =>
      client.query(`select public.cancel_meetup_invitation($1)`, [
        cancelled.rows[0]!.id,
      ]),
    )
    const cancelledToken = (await issueLink(ana.userId, cancelledId)).token
    await asUser(bia.userId, (client) =>
      client.query(`select public.join_meetup_by_invite($1)`, [cancelledToken]),
    )
    const cancelledRow = await admin((client) =>
      client.query<{ status: string }>(
        `select status from public.meetup_invitations where id = $1`,
        [cancelled.rows[0]!.id],
      ),
    )
    expect(cancelledRow.rows[0]?.status).toBe('accepted')
  })

  it('rejects an expired, revoked, cancelled or started meetup and keeps confirmed people', async () => {
    const meetupId = await createMeetup(ana.userId, 8, '3 days')
    const { token } = await issueLink(ana.userId, meetupId)
    await asUser(bia.userId, (client) =>
      client.query(`select public.join_meetup_by_invite($1)`, [token]),
    )
    await asUser(ana.userId, (client) =>
      client.query(`select public.revoke_meetup_invite_link($1)`, [meetupId]),
    )
    const stillThere = await admin((client) =>
      client.query<{ count: string }>(
        `select count(*)::text as count from public.meetup_participants
         where meetup_id = $1 and user_id = $2 and status = 'confirmed'`,
        [meetupId, bia.userId],
      ),
    )
    expect(stillThere.rows[0]?.count).toBe('1')
    const biaPreview = await asUser(bia.userId, (client) =>
      client.query<{ preview: { status: string; meetup_id: string } }>(
        `select public.preview_meetup_invite($1) as preview`,
        [token],
      ),
    )
    expect(biaPreview.rows[0]!.preview.status).toBe('confirmed')
    const hidden = await asUser(caio.userId, (client) =>
      client.query<{ preview: Record<string, unknown> }>(
        `select public.preview_meetup_invite($1) as preview`,
        [token],
      ),
    )
    expect(hidden.rows[0]!.preview).toEqual({ status: 'unavailable' })
    await expect(
      asUser(caio.userId, (client) =>
        client.query(`select public.join_meetup_by_invite($1)`, [token]),
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining('invite unavailable'),
    })

    const expiredId = await createMeetup(ana.userId, 8, '3 days')
    const expired = await issueLink(ana.userId, expiredId)
    await admin((client) =>
      client.query(
        `do $$
         begin
           perform set_config('padre.meetup_write', 'on', true);
           update public.meetup_invite_links
           set expires_at = now() - interval '1 minute'
           where meetup_id = ${sqlLiteral(expiredId)}
             and revoked_at is null;
         end
         $$;`,
      ),
    )
    const expiredPreview = await asUser(
      null,
      (client) =>
        client.query<{ preview: { status: string } }>(
          `select public.preview_meetup_invite($1) as preview`,
          [expired.token],
        ),
      'anon',
    )
    expect(expiredPreview.rows[0]!.preview.status).toBe('expired')
    await expect(
      asUser(caio.userId, (client) =>
        client.query(`select public.join_meetup_by_invite($1)`, [
          expired.token,
        ]),
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining('invite unavailable'),
    })

    const cancelledId = await createMeetup(ana.userId, 8, '3 days')
    const cancelled = await issueLink(ana.userId, cancelledId)
    await asUser(ana.userId, (client) =>
      client.query(`select public.cancel_meetup($1)`, [cancelledId]),
    )
    const cancelledPreview = await asUser(caio.userId, (client) =>
      client.query<{ preview: { status: string } }>(
        `select public.preview_meetup_invite($1) as preview`,
        [cancelled.token],
      ),
    )
    expect(cancelledPreview.rows[0]!.preview.status).toBe('cancelled')
    await expect(
      asUser(caio.userId, (client) =>
        client.query(`select public.join_meetup_by_invite($1)`, [
          cancelled.token,
        ]),
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining('meetup cancelled'),
    })

    const startedId = await createMeetup(ana.userId, 8, '3 days')
    const started = await issueLink(ana.userId, startedId)
    await admin((client) =>
      client.query(
        `do $$
         begin
           perform set_config('padre.meetup_write', 'on', true);
           update public.meetups
           set starts_at = now() - interval '1 hour',
               ends_at = now() - interval '30 minutes'
           where id = ${sqlLiteral(startedId)};
         end
         $$;`,
      ),
    )
    await expect(
      asUser(caio.userId, (client) =>
        client.query(`select public.join_meetup_by_invite($1)`, [
          started.token,
        ]),
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining('invite unavailable'),
    })
  })

  it('gives the last seat to only one of two overlapping joins', async () => {
    const meetupId = await createMeetup(ana.userId, 2, '3 days')
    const { token } = await issueLink(ana.userId, meetupId)
    const results = await raceForSeat(token, bia.userId, caio.userId)
    expect(results.fulfilled).toBe(1)
    expect(results.rejected).toContain('meetup is full')
    const count = await admin((client) =>
      client.query<{ count: string }>(
        `select count(*)::text as count from public.meetup_participants
         where meetup_id = $1 and status = 'confirmed'`,
        [meetupId],
      ),
    )
    expect(count.rows[0]?.count).toBe('2')
  })

  it('revokes the previous link when another is generated', async () => {
    const meetupId = await createMeetup(ana.userId, 8, '3 days')
    const first = await issueLink(ana.userId, meetupId)
    const second = await issueLink(ana.userId, meetupId)
    const open = await admin((client) =>
      client.query<{ count: string }>(
        `select count(*)::text as count from public.meetup_invite_links
         where meetup_id = $1 and revoked_at is null`,
        [meetupId],
      ),
    )
    expect(open.rows[0]?.count).toBe('1')
    await expect(
      asUser(caio.userId, (client) =>
        client.query(`select public.join_meetup_by_invite($1)`, [first.token]),
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining('invite unavailable'),
    })
    const joined = await asUser(caio.userId, (client) =>
      client.query<{ id: string }>(
        `select public.join_meetup_by_invite($1) as id`,
        [second.token],
      ),
    )
    expect(joined.rows[0]!.id).toBe(meetupId)
  })

  it('stops a guest, a former participant and another organizer from bypassing the link', async () => {
    const meetupId = await createMeetup(ana.userId, 8, '3 days')
    const { token } = await issueLink(ana.userId, meetupId)
    await asUser(bia.userId, (client) =>
      client.query(`select public.join_meetup_by_invite($1)`, [token]),
    )
    await asUser(bia.userId, (client) =>
      client.query(`select public.leave_meetup($1)`, [meetupId]),
    )
    const replacement = await issueLink(ana.userId, meetupId)
    await expect(
      asUser(bia.userId, (client) =>
        client.query(`select public.join_meetup_by_invite($1)`, [
          replacement.token,
        ]),
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining('participation cannot be reopened'),
    })

    await expect(
      asUser(caio.userId, (client) =>
        client.query(`select public.create_meetup_invite_link($1)`, [meetupId]),
      ),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(
      asUser(caio.userId, (client) =>
        client.query(`select public.revoke_meetup_invite_link($1)`, [meetupId]),
      ),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(
      asUser(bia.userId, (client) =>
        client.query(
          `update public.meetup_invite_links set revoked_at = now() where meetup_id = $1`,
          [meetupId],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(
      admin((client) =>
        client.query(
          `do $$
           begin
             perform set_config('padre.meetup_write', 'on', true);
             update public.meetup_invite_links
             set token_hash = extensions.digest('outro-segredo', 'sha256')
             where meetup_id = ${sqlLiteral(meetupId)}
               and revoked_at is null;
           end
           $$;`,
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('keeps privileged bodies out of the anonymous role', async () => {
    const privileges = await admin((client) =>
      client.query<{
        schema: string
        name: string
        definer: boolean
        anon: boolean
        authenticated: boolean
      }>(
        `select n.nspname as schema,
                p.proname as name,
                p.prosecdef as definer,
                has_function_privilege('anon', p.oid, 'execute') as anon,
                has_function_privilege('authenticated', p.oid, 'execute') as authenticated
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where (n.nspname, p.proname) in (
           ('public', 'preview_meetup_invite'),
           ('private', 'preview_meetup_invite'),
           ('public', 'join_meetup_by_invite'),
           ('private', 'join_meetup_by_invite'),
           ('public', 'create_meetup_invite_link'),
           ('private', 'create_meetup_invite_link'),
           ('public', 'create_meetup'),
           ('private', 'create_meetup'),
           ('public', 'request_friendship'),
           ('private', 'request_friendship'),
           ('private', 'invite_token_hash'),
           ('private', 'lock_meetup')
         )`,
      ),
    )
    const byName = (schema: string, name: string) =>
      privileges.rows.find((row) => row.schema === schema && row.name === name)

    expect(byName('public', 'preview_meetup_invite')).toMatchObject({
      definer: false,
      anon: true,
      authenticated: true,
    })
    expect(byName('private', 'preview_meetup_invite')).toMatchObject({
      definer: true,
      anon: true,
      authenticated: true,
    })
    for (const name of ['join_meetup_by_invite', 'create_meetup_invite_link']) {
      expect(byName('public', name)).toMatchObject({
        definer: false,
        anon: false,
        authenticated: true,
      })
      expect(byName('private', name)).toMatchObject({
        definer: true,
        anon: false,
        authenticated: true,
      })
    }
    expect(byName('public', 'create_meetup')).toMatchObject({
      definer: false,
      anon: false,
    })
    expect(byName('private', 'create_meetup')).toMatchObject({
      definer: true,
      anon: false,
    })
    expect(byName('public', 'request_friendship')).toMatchObject({
      definer: false,
      anon: false,
    })
    expect(byName('private', 'request_friendship')).toMatchObject({
      definer: true,
      anon: false,
    })
    expect(byName('private', 'invite_token_hash')?.anon).toBe(false)
    expect(byName('private', 'lock_meetup')?.anon).toBe(false)
    expect(byName('private', 'lock_meetup')?.authenticated).toBe(false)
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

async function createMeetup(userId: string, capacity: number, start: string) {
  const created = await asUser(userId, (client) =>
    client.query<{ id: string }>(
      `select public.create_meetup(
         $1, $2, 'Vôlei na quadra', '',
         now() + $3::interval,
         now() + $3::interval + interval '2 hours',
         'America/Sao_Paulo',
         'Quadra do clube',
         'Rua das Flores, 10',
         $4
       ) as id`,
      [catalog.formatId, catalog.ruleId, start, capacity],
    ),
  )
  return created.rows[0]!.id
}

async function issueLink(userId: string, meetupId: string) {
  const issued = await asUser(userId, (client) =>
    client.query<{ token: string; expires_at: Date }>(
      `select token, expires_at from public.create_meetup_invite_link($1)`,
      [meetupId],
    ),
  )
  return issued.rows[0]!
}

async function raceForSeat(token: string, firstId: string, secondId: string) {
  const first = new Client({ connectionString: env.databaseUrl })
  const second = new Client({ connectionString: env.databaseUrl })
  await first.connect()
  await second.connect()
  try {
    await first.query('begin')
    await second.query('begin')
    await assume(first, firstId)
    await assume(second, secondId)
    const held = await first.query<{ id: string }>(
      `select public.join_meetup_by_invite($1) as id`,
      [token],
    )
    const waiting = second.query(`select public.join_meetup_by_invite($1)`, [
      token,
    ])
    await new Promise((resolve) => setTimeout(resolve, 200))
    await first.query('commit')
    let rejected = ''
    try {
      await waiting
      await second.query('commit')
    } catch (error) {
      rejected = error instanceof Error ? error.message : ''
      await second.query('rollback')
    }
    return { fulfilled: held.rowCount ?? 0, rejected }
  } finally {
    await first.end()
    await second.end()
  }
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
  const body = (await response.json()) as { user?: { id?: string } }
  if (!body.user?.id) {
    throw new Error(`Cadastro de ${label} falhou (${response.status}).`)
  }
  return { username, userId: body.user.id }
}
