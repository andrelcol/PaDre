import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

type Env = { url: string; anonKey: string; databaseUrl: string }
type Account = { username: string; userId: string }
type CatalogIds = { formatId: string; ruleId: string; otherRuleId: string }

const env = loadEnv()
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
let ana: Account
let bia: Account
let caio: Account
let catalog: CatalogIds
let meetupId: string
let invitationId: string

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
    const futsal = await client.query<{ id: string }>(
      `select scoring_rule_versions.id
       from public.scoring_rule_versions
       join public.sport_formats on sport_formats.id = scoring_rule_versions.format_id
       where sport_formats.slug = 'futsal-5x5' and scoring_rule_versions.active`,
    )
    return {
      formatId: volleyball.rows[0]!.format_id,
      ruleId: volleyball.rows[0]!.rule_id,
      otherRuleId: futsal.rows[0]!.id,
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

describe('meetups', () => {
  it('creates a future meetup and seats the organizer', async () => {
    const created = await asUser(ana.userId, (client) =>
      client.query<{ id: string }>(
        `select public.create_meetup(
           $1, $2, 'Vôlei na quadra', '',
           now() + interval '2 days',
           now() + interval '2 days 2 hours',
           'America/Sao_Paulo',
           'Quadra do clube',
           '',
           12
         ) as id`,
        [catalog.formatId, catalog.ruleId],
      ),
    )
    meetupId = created.rows[0]!.id
    const row = await admin((client) =>
      client.query<{ organizer_id: string; status: string }>(
        `select organizer_id, status,
                (select status from public.meetup_participants
                 where meetup_id = meetups.id and user_id = meetups.organizer_id) as participation
         from public.meetups where id = $1`,
        [meetupId],
      ),
    )
    expect(row.rows[0]).toMatchObject({
      organizer_id: ana.userId,
      status: 'scheduled',
      participation: 'confirmed',
    })
  })

  it('invites a friend and refuses someone who is not a friend', async () => {
    const invited = await asUser(ana.userId, (client) =>
      client.query<{ id: string; status: string; invitee_username: string }>(
        `select id, status, invitee_username from public.invite_to_meetup($1, $2)`,
        [meetupId, bia.username],
      ),
    )
    invitationId = invited.rows[0]!.id
    expect(invited.rows[0]).toMatchObject({
      status: 'pending',
      invitee_username: bia.username,
    })

    await expect(
      asUser(ana.userId, (client) =>
        client.query(`select public.invite_to_meetup($1, $2)`, [
          meetupId,
          caio.username,
        ]),
      ),
    ).rejects.toMatchObject({ message: expect.stringContaining('not friends') })
  })

  it('shows the invite to the guest and hides the meetup from everyone else', async () => {
    const incoming = await asUser(bia.userId, (client) =>
      client.query<{ relation: string }>(
        `select relation from public.list_my_meetups()`,
      ),
    )
    expect(incoming.rows).toEqual([{ relation: 'invited' }])

    const hidden = await asUser(caio.userId, (client) =>
      client.query(`select id from public.meetups`),
    )
    expect(hidden.rows).toEqual([])
    await expect(
      asUser(caio.userId, (client) =>
        client.query(`select public.get_meetup($1)`, [meetupId]),
      ),
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('accepts once, lists the guest as confirmed and ignores a repeated accept', async () => {
    const accepted = await asUser(bia.userId, (client) =>
      client.query<{ respond_to_meetup_invitation: string }>(
        `select public.respond_to_meetup_invitation($1, 'accept')`,
        [invitationId],
      ),
    )
    expect(accepted.rows[0]?.respond_to_meetup_invitation).toBe('accepted')
    const again = await asUser(bia.userId, (client) =>
      client.query<{ respond_to_meetup_invitation: string }>(
        `select public.respond_to_meetup_invitation($1, 'accept')`,
        [invitationId],
      ),
    )
    expect(again.rows[0]?.respond_to_meetup_invitation).toBe('accepted')

    const detail = await asUser(ana.userId, (client) =>
      client.query<{
        detail: {
          confirmed_count: number
          participants: { username: string }[]
        }
      }>(`select public.get_meetup($1) as detail`, [meetupId]),
    )
    expect(detail.rows[0]?.detail.confirmed_count).toBe(2)
    expect(
      detail.rows[0]?.detail.participants
        .map((person) => person.username)
        .sort(),
    ).toEqual([ana.username, bia.username].sort())
  })

  it('refuses edits, accepts and direct inserts from someone who is not allowed', async () => {
    await expect(
      asUser(bia.userId, (client) =>
        client.query(
          `select public.update_meetup($1, $2, $3, null, null, null, null, null, null, null, null)`,
          [meetupId, catalog.formatId, catalog.ruleId],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' })

    await expect(
      asUser(caio.userId, (client) =>
        client.query(
          `select public.respond_to_meetup_invitation($1, 'accept')`,
          [invitationId],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' })

    await expect(
      asUser(caio.userId, (client) =>
        client.query(
          `insert into public.meetup_participants (meetup_id, user_id, status)
           values ($1, $2, 'confirmed')`,
          [meetupId, caio.userId],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' })

    await expect(
      asUser(ana.userId, (client) =>
        client.query(
          `insert into public.meetups (
             organizer_id, sport_format_id, scoring_rule_version_id, title,
             starts_at, ends_at, time_zone, location_name, max_participants
           ) values ($1, $2, $3, 'Falso', now() + interval '3 days', now() + interval '3 days 1 hour',
             'America/Sao_Paulo', 'Lugar', 4)`,
          [caio.userId, catalog.formatId, catalog.ruleId],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('locks structural fields while another person is confirmed and keeps capacity above that count', async () => {
    const current = await admin((client) =>
      client.query<{
        starts_at: Date
        ends_at: Date
        time_zone: string
        max_participants: number
      }>(
        `select starts_at, ends_at, time_zone, max_participants from public.meetups where id = $1`,
        [meetupId],
      ),
    )
    const stored = current.rows[0]!
    await expect(
      asUser(ana.userId, (client) =>
        client.query(
          `select public.update_meetup($1,$2,$3,$4,'',$5,$6,$7,$8,'',$9)`,
          [
            meetupId,
            catalog.formatId,
            catalog.ruleId,
            'Vôlei na quadra',
            new Date(stored.starts_at.getTime() + 24 * 60 * 60 * 1000),
            new Date(stored.ends_at.getTime() + 24 * 60 * 60 * 1000),
            stored.time_zone,
            'Quadra do clube',
            stored.max_participants,
          ],
        ),
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining('structural change locked'),
    })

    await asUser(ana.userId, (client) =>
      client.query(
        `select public.update_meetup(
           meetups.id,
           meetups.sport_format_id,
           meetups.scoring_rule_version_id,
           'Vôlei renomeado',
           '',
           meetups.starts_at,
           meetups.ends_at,
           meetups.time_zone,
           meetups.location_name,
           coalesce(meetups.location_address, ''),
           meetups.max_participants
         )
         from public.meetups
         where meetups.id = $1`,
        [meetupId],
      ),
    )

    await expect(
      asUser(ana.userId, (client) =>
        client.query(
          `select public.update_meetup($1,$2,$3,$4,'',$5,$6,$7,$8,'',$9)`,
          [
            meetupId,
            catalog.formatId,
            catalog.ruleId,
            'Vôlei renomeado',
            stored.starts_at,
            stored.ends_at,
            stored.time_zone,
            'Quadra do clube',
            1,
          ],
        ),
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining('invalid meetup field'),
    })
  })

  it('lets a third friend fill a spot and then refuses a capacity below the confirmed count', async () => {
    const requested = await asUser(ana.userId, (client) =>
      client.query<{ id: string }>(
        `select id from public.request_friendship($1)`,
        [caio.username],
      ),
    )
    await asUser(caio.userId, (client) =>
      client.query(`select public.respond_to_friendship($1, 'accept')`, [
        requested.rows[0]!.id,
      ]),
    )
    const invited = await asUser(ana.userId, (client) =>
      client.query<{ id: string }>(
        `select id from public.invite_to_meetup($1, $2)`,
        [meetupId, caio.username],
      ),
    )
    await asUser(caio.userId, (client) =>
      client.query(`select public.respond_to_meetup_invitation($1, 'accept')`, [
        invited.rows[0]!.id,
      ]),
    )
    const stored = await admin((client) =>
      client.query<{ starts_at: Date; ends_at: Date; time_zone: string }>(
        `select starts_at, ends_at, time_zone from public.meetups where id = $1`,
        [meetupId],
      ),
    )
    await expect(
      asUser(ana.userId, (client) =>
        client.query(
          `select public.update_meetup($1,$2,$3,$4,'',$5,$6,$7,$8,'',2)`,
          [
            meetupId,
            catalog.formatId,
            catalog.ruleId,
            'Vôlei renomeado',
            stored.rows[0]!.starts_at,
            stored.rows[0]!.ends_at,
            stored.rows[0]!.time_zone,
            'Quadra do clube',
          ],
        ),
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining('capacity below confirmed'),
    })
  })

  it('gives the last spot to only one of two simultaneous accepts', async () => {
    const created = await asUser(ana.userId, (client) =>
      client.query<{ id: string }>(
        `select public.create_meetup(
           $1, $2, 'Última vaga', '',
           now() + interval '3 days',
           now() + interval '3 days 2 hours',
           'America/Sao_Paulo',
           'Quadra dois',
           '',
           2
         ) as id`,
        [catalog.formatId, catalog.ruleId],
      ),
    )
    const tightId = created.rows[0]!.id
    const biaInvite = await asUser(ana.userId, (client) =>
      client.query<{ id: string }>(
        `select id from public.invite_to_meetup($1, $2)`,
        [tightId, bia.username],
      ),
    )
    const caioInvite = await asUser(ana.userId, (client) =>
      client.query<{ id: string }>(
        `select id from public.invite_to_meetup($1, $2)`,
        [tightId, caio.username],
      ),
    )
    const results = await Promise.allSettled([
      asUser(bia.userId, (client) =>
        client.query(
          `select public.respond_to_meetup_invitation($1, 'accept')`,
          [biaInvite.rows[0]!.id],
        ),
      ),
      asUser(caio.userId, (client) =>
        client.query(
          `select public.respond_to_meetup_invitation($1, 'accept')`,
          [caioInvite.rows[0]!.id],
        ),
      ),
    ])
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1)
    const rejected = results.find((result) => result.status === 'rejected')
    expect(rejected?.status === 'rejected' && rejected.reason).toMatchObject({
      message: expect.stringContaining('meetup is full'),
    })
    const count = await admin((client) =>
      client.query<{ count: string }>(
        `select count(*)::text as count from public.meetup_participants
         where meetup_id = $1 and status = 'confirmed'`,
        [tightId],
      ),
    )
    expect(count.rows[0]?.count).toBe('2')

    await asUser(ana.userId, (client) =>
      client.query(`select public.cancel_meetup($1)`, [tightId]),
    )
    const pending = await admin((client) =>
      client.query<{ id: string; invitee_id: string }>(
        `select id, invitee_id from public.meetup_invitations
         where meetup_id = $1 and status = 'cancelled'`,
        [tightId],
      ),
    )
    await expect(
      asUser(pending.rows[0]!.invitee_id, (client) =>
        client.query(
          `select public.respond_to_meetup_invitation($1, 'accept')`,
          [pending.rows[0]!.id],
        ),
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining('meetup cancelled'),
    })
  })

  it('lets a guest leave, blocks the organizer from leaving, and unlocks the schedule afterwards', async () => {
    await asUser(bia.userId, (client) =>
      client.query(`select public.leave_meetup($1)`, [meetupId]),
    )
    await asUser(caio.userId, (client) =>
      client.query(`select public.leave_meetup($1)`, [meetupId]),
    )
    const gone = await asUser(bia.userId, (client) =>
      client.query<{ id: string }>(`select id from public.list_my_meetups()`),
    )
    expect(gone.rows.map((row) => row.id)).not.toContain(meetupId)

    await expect(
      asUser(ana.userId, (client) =>
        client.query(`select public.leave_meetup($1)`, [meetupId]),
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining('organizer cannot leave'),
    })

    const stored = await admin((client) =>
      client.query<{ starts_at: Date; ends_at: Date }>(
        `select starts_at, ends_at from public.meetups where id = $1`,
        [meetupId],
      ),
    )
    await asUser(ana.userId, (client) =>
      client.query(
        `select public.update_meetup($1,$2,$3,$4,'',$5,$6,'America/Sao_Paulo',$7,'',4)`,
        [
          meetupId,
          catalog.formatId,
          catalog.ruleId,
          'Vôlei renomeado',
          new Date(stored.rows[0]!.starts_at.getTime() + 60 * 60 * 1000),
          new Date(stored.rows[0]!.ends_at.getTime() + 60 * 60 * 1000),
          'Quadra do clube',
        ],
      ),
    )
    const status = await admin((client) =>
      client.query<{ status: string }>(
        `select status from public.meetups where id = $1`,
        [meetupId],
      ),
    )
    expect(status.rows[0]?.status).toBe('scheduled')
  })

  it('requires an active format and a scoring rule from that format', async () => {
    await expect(
      asUser(ana.userId, (client) =>
        client.query(
          `select public.create_meetup(
             $1, $2, 'Fora', '', now() + interval '4 days', now() + interval '4 days 1 hour',
             'America/Sao_Paulo', 'Lugar', '', 4
           )`,
          ['a9000000-0000-4000-8000-000000000099', catalog.ruleId],
        ),
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining('sport format not found'),
    })

    await expect(
      asUser(ana.userId, (client) =>
        client.query(
          `select public.create_meetup(
             $1, $2, 'Fora', '', now() + interval '4 days', now() + interval '4 days 1 hour',
             'America/Sao_Paulo', 'Lugar', '', 4
           )`,
          [catalog.formatId, catalog.otherRuleId],
        ),
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining('scoring rule does not match format'),
    })
  })

  it('hides meetups from an anonymous role and keeps exposed functions invoker', async () => {
    await expect(
      asUser(
        null,
        (client) => client.query(`select id from public.meetups`),
        'anon',
      ),
    ).rejects.toMatchObject({ code: '42501' })

    const definition = await admin((client) =>
      client.query<{ prosecdef: boolean }>(
        `select prosecdef
         from pg_proc
         join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
         where nspname = 'public' and proname = 'create_meetup'`,
      ),
    )
    expect(definition.rows[0]?.prosecdef).toBe(false)
  })

  it('applies the meetup migrations on a clean database', async () => {
    await admin(async (client) => {
      await client.query(
        `select pg_terminate_backend(pid)
         from pg_stat_activity
         where datname = 'padre_meetups_clean' and pid <> pg_backend_pid()`,
      )
      await client.query('drop database if exists padre_meetups_clean')
      await client.query('create database padre_meetups_clean')
    })
    const clean = new Client({
      connectionString: env.databaseUrl.replace(
        /\/postgres$/,
        '/padre_meetups_clean',
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
      for (const file of [
        '20261018170000_identity.sql',
        '20261018190000_sports_catalog.sql',
        '20261018200000_friendships.sql',
        '20261018210000_friendship_invoker.sql',
        '20261018220000_meetups.sql',
        '20261018230000_meetup_invite_links.sql',
        '20261018240000_matches.sql',
        '20261018250000_statistics.sql',
        '20261019030042_player_relationships.sql',
      ]) {
        await clean.query(
          readFileSync(
            new URL(`../migrations/${file}`, import.meta.url),
            'utf8',
          ),
        )
      }
      const table = await clean.query(
        `select to_regclass('public.meetups') as meetups,
                to_regclass('public.meetup_invite_links') as links,
                to_regclass('public.matches') as matches,
                to_regclass('public.match_player_statistics') as statistics`,
      )
      expect(table.rows[0]).toMatchObject({
        meetups: 'meetups',
        links: 'meetup_invite_links',
        matches: 'matches',
        statistics: 'match_player_statistics',
      })
    } finally {
      await clean.end()
      await admin(async (client) => {
        await client.query(
          `select pg_terminate_backend(pid)
           from pg_stat_activity
           where datname = 'padre_meetups_clean' and pid <> pg_backend_pid()`,
        )
        await client.query('drop database if exists padre_meetups_clean')
      })
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
    user?: { id?: string }
    access_token?: string
  }
  if (!body.user?.id) {
    throw new Error(`Cadastro de ${label} falhou (${response.status}).`)
  }
  return { username, userId: body.user.id }
}
