import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

type Env = { url: string; anonKey: string; databaseUrl: string }
type Account = { username: string; userId: string }
type Format = { formatId: string; ruleId: string }
type Facts = {
  players: string
  stats: string
  outcome: string | null
  status: string
}

const beachSport = 'a1000000-0000-4000-8000-000000000002'
const env = loadEnv()
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const migrationFiles = [
  '20261018170000_identity.sql',
  '20261018190000_sports_catalog.sql',
  '20261018200000_friendships.sql',
  '20261018210000_friendship_invoker.sql',
  '20261018220000_meetups.sql',
  '20261018230000_meetup_invite_links.sql',
  '20261018240000_matches.sql',
  '20261018250000_statistics.sql',
  '20261019030042_player_relationships.sql',
  '20261019032036_communities.sql',
  '20261019092841_community_meetups.sql',
  '20261019140000_historical_delete_guard.sql',
  '20261019180000_community_messages.sql',
  '20261019200000_community_polls.sql',
]
let nina: Account
let owner: Account
let ana: Account
let bia: Account
let caio: Account
let eva: Account
let davi: Account
let beach: Format
let slug = ''
let meetupId = ''
let matchId = ''
let confirmed: Facts

beforeAll(async () => {
  ;[nina, owner, ana, bia, caio, eva, davi] = await Promise.all([
    mustSignup('nina'),
    mustSignup('owner'),
    mustSignup('ana'),
    mustSignup('bia'),
    mustSignup('caio'),
    mustSignup('eva'),
    mustSignup('davi'),
  ])
  const catalog = await admin((client) =>
    client.query<{ format_id: string; rule_id: string }>(
      `select sport_formats.id as format_id, scoring_rule_versions.id as rule_id
       from public.sport_formats
       join public.scoring_rule_versions
         on scoring_rule_versions.format_id = sport_formats.id
        and scoring_rule_versions.active
       where sport_formats.slug = 'beach-2x2'`,
    ),
  )
  beach = {
    formatId: catalog.rows[0]!.format_id,
    ruleId: catalog.rows[0]!.rule_id,
  }
  slug = await createCommunity(owner)
  for (const person of [ana, bia, caio, eva, davi]) {
    await asUser(person.userId, (client) =>
      client.query(`select public.join_public_community($1)`, [slug]),
    )
  }
  meetupId = await communityMeetup(ana, 'Histórico')
  for (const person of [bia, caio, eva]) {
    await asUser(person.userId, (client) =>
      client.query(`select public.join_community_meetup($1)`, [meetupId]),
    )
  }
  await shiftMeetup(meetupId)
  matchId = await play(meetupId)
  const future = await communityMeetup(ana, 'Futuro')
  await asUser(davi.userId, (client) =>
    client.query(`select public.join_community_meetup($1)`, [future]),
  )
  confirmed = await facts(matchId)
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
      `delete from public.communities
       where created_by in (select id from auth.users where email like $1)`,
      emails,
    )
    await client.query(`delete from auth.users where email like $1`, emails)
  })
})

describe('historical delete guard', () => {
  it('deletes an account with no sports history and restores it on rollback', async () => {
    await admin(async (client) => {
      await client.query('begin')
      try {
        await client.query(`delete from auth.users where id = $1`, [
          nina.userId,
        ])
        const profile = await client.query(
          `select 1 from public.profiles where id = $1`,
          [nina.userId],
        )
        expect(profile.rowCount).toBe(0)
      } finally {
        await client.query('rollback')
      }
      const restored = await client.query(
        `select 1 from public.profiles where id = $1`,
        [nina.userId],
      )
      expect(restored.rowCount).toBe(1)
    })

    await admin(async (client) => {
      await client.query('begin')
      try {
        await client.query(`delete from public.profiles where id = $1`, [
          nina.userId,
        ])
        const profile = await client.query(
          `select 1 from public.profiles where id = $1`,
          [nina.userId],
        )
        const authUser = await client.query(
          `select 1 from auth.users where id = $1`,
          [nina.userId],
        )
        expect(profile.rowCount).toBe(0)
        expect(authUser.rowCount).toBe(1)
      } finally {
        await client.query('rollback')
      }
    })
    expect(await facts(matchId)).toEqual(confirmed)
  })

  it('keeps a confirmed lineup, result and the other players statistics', async () => {
    await expect(refused(bia.userId, 'auth.users')).resolves.toContain(
      'escalação',
    )
    await expect(refused(bia.userId, 'public.profiles')).resolves.toContain(
      'escalação',
    )
    expect(await facts(matchId)).toEqual(confirmed)
    const peers = await admin((client) =>
      client.query<{ user_id: string }>(
        `select user_id::text
         from public.match_player_statistics
         where match_id = $1 and user_id <> $2
         order by user_id`,
        [matchId, bia.userId],
      ),
    )
    expect(peers.rows.map((row) => row.user_id).sort()).toEqual(
      [ana.userId, caio.userId, eva.userId].sort(),
    )
  })

  it('refuses to delete a community owner or a meetup organizer', async () => {
    await expect(refused(owner.userId, 'auth.users')).resolves.toContain(
      'proprietária',
    )
    await expect(refused(owner.userId, 'public.profiles')).resolves.toContain(
      'proprietária',
    )
    await expect(refused(ana.userId, 'auth.users')).resolves.toContain(
      'encontros comunitários',
    )
    const still = await admin((client) =>
      client.query<{ communities: string; meetups: string; matches: string }>(
        `select
           (select count(*) from public.communities where slug = $1)::text as communities,
           (select count(*) from public.meetups where id = $2)::text as meetups,
           (select count(*) from public.matches where id = $3)::text as matches`,
        [slug, meetupId, matchId],
      ),
    )
    expect(still.rows[0]).toEqual({
      communities: '1',
      meetups: '1',
      matches: '1',
    })
    expect(await facts(matchId)).toEqual(confirmed)
  })

  it('removes a community member without destroying confirmed results', async () => {
    await asUser(owner.userId, (client) =>
      client.query(`select public.remove_community_member($1, $2)`, [
        slug,
        bia.username,
      ]),
    )
    expect(await facts(matchId)).toEqual(confirmed)
    const participation = await admin((client) =>
      client.query<{ status: string }>(
        `select status from public.meetup_participants
         where meetup_id = $1 and user_id = $2`,
        [meetupId, bia.userId],
      ),
    )
    expect(participation.rows[0]?.status).toBe('confirmed')
    const profile = await admin((client) =>
      client.query(`select 1 from public.profiles where id = $1`, [bia.userId]),
    )
    expect(profile.rowCount).toBe(1)
  })

  it('reprojects statistics without changing the confirmed contributions', async () => {
    await admin(async (client) => {
      await client.query('begin')
      try {
        const before = await factsOn(client, matchId)
        await client.query(`select private.reproject_all_statistics()`)
        expect(await factsOn(client, matchId)).toEqual(before)
      } finally {
        await client.query('rollback')
      }
    })
    expect(await facts(matchId)).toEqual(confirmed)
  })

  it('leaves no dangling sports references after a refused delete', async () => {
    await refused(bia.userId, 'auth.users')
    const orphans = await admin((client) =>
      client.query<{
        players: string
        stats: string
        creator: string
        organizer: string
        owner: string
      }>(
        `select
           (select count(*) from public.match_players as players
             where players.match_id = $1
               and not exists (
                 select 1 from public.profiles
                 where profiles.id = players.user_id
               ))::text as players,
           (select count(*) from public.match_player_statistics as stats
             where stats.match_id = $1
               and not exists (
                 select 1 from public.profiles
                 where profiles.id = stats.user_id
               ))::text as stats,
           (select count(*) from public.matches
             where matches.id = $1
               and not exists (
                 select 1 from public.profiles
                 where profiles.id = matches.created_by
               ))::text as creator,
           (select count(*) from public.meetups
             where meetups.id = $2
               and not exists (
                 select 1 from public.profiles
                 where profiles.id = meetups.organizer_id
               ))::text as organizer,
           (select count(*) from public.communities
             where communities.slug = $3
               and not exists (
                 select 1 from public.profiles
                 where profiles.id = communities.created_by
               ))::text as owner`,
        [matchId, meetupId, slug],
      ),
    )
    expect(orphans.rows[0]).toEqual({
      players: '0',
      stats: '0',
      creator: '0',
      organizer: '0',
      owner: '0',
    })
  })

  it('protects private invite links and refuses them on a community meetup', async () => {
    const privateMeetup = await asUser(nina.userId, (client) =>
      client.query<{ id: string }>(
        `select public.create_meetup(
           $1, $2, 'Privado', '',
           now() + interval '4 days',
           now() + interval '4 days 2 hours',
           'America/Sao_Paulo', 'Quadra', '', 8
         ) as id`,
        [beach.formatId, beach.ruleId],
      ),
    )
    const privateId = privateMeetup.rows[0]!.id
    const issued = await asUser(nina.userId, (client) =>
      client.query<{ token: string }>(
        `select token from public.create_meetup_invite_link($1)`,
        [privateId],
      ),
    )
    const token = issued.rows[0]!.token
    await asUser(davi.userId, (client) =>
      client.query(`select public.join_meetup_by_invite($1)`, [token]),
    )
    const stored = await admin((client) =>
      client.query<{ matches: boolean; raw: boolean }>(
        `select token_hash = private.invite_token_hash($2) as matches,
                position($2 in token_hash::text) > 0 as raw
         from public.meetup_invite_links
         where meetup_id = $1 and revoked_at is null`,
        [privateId, token],
      ),
    )
    expect(stored.rows[0]).toEqual({ matches: true, raw: false })

    await expect(
      asUser(nina.userId, (client) =>
        client.query(
          `update public.meetup_invite_links
           set token_hash = decode(repeat('ab', 32), 'hex')
           where meetup_id = $1`,
          [privateId],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' })

    await expect(
      admin(async (client) => {
        await client.query('begin')
        await client.query(
          `select set_config('padre.meetup_write', 'on', true)`,
        )
        await client.query(
          `update public.meetup_invite_links
           set token_hash = decode(repeat('ab', 32), 'hex'),
               created_by = $2,
               meetup_id = $3
           where meetup_id = $1`,
          [privateId, ana.userId, meetupId],
        )
      }),
    ).rejects.toThrow(/meetup timestamps are protected/)

    const revoked = await asUser(nina.userId, (client) =>
      client.query(`select public.revoke_meetup_invite_link($1)`, [privateId]),
    )
    expect(revoked.rowCount).toBe(1)
    const hashAfter = await admin((client) =>
      client.query<{ matches: boolean; revoked: boolean }>(
        `select token_hash = private.invite_token_hash($2) as matches,
                revoked_at is not null as revoked
         from public.meetup_invite_links
         where meetup_id = $1`,
        [privateId, token],
      ),
    )
    expect(hashAfter.rows[0]).toEqual({ matches: true, revoked: true })

    await expect(refused(nina.userId, 'auth.users')).resolves.toContain(
      'organiza encontros',
    )
    const kept = await admin((client) =>
      client.query(`select 1 from public.meetups where id = $1`, [privateId]),
    )
    expect(kept.rowCount).toBe(1)

    await expect(
      asUser(ana.userId, (client) =>
        client.query(`select public.create_meetup_invite_link($1)`, [meetupId]),
      ),
    ).rejects.toThrow(/community meetup has no invite/)
    await expect(
      admin(async (client) => {
        await client.query('begin')
        await client.query(
          `select set_config('padre.meetup_write', 'on', true)`,
        )
        await client.query(
          `insert into public.meetup_invite_links
             (meetup_id, created_by, token_hash, expires_at)
           values ($1, $2, decode(repeat('cd', 32), 'hex'), now() + interval '1 day')`,
          [meetupId, ana.userId],
        )
      }),
    ).rejects.toThrow(/community meetup has no invite/)
    expect(await facts(matchId)).toEqual(confirmed)
  })

  it('deletes a member without confirmed history and keeps the confirmed match', async () => {
    const draftMeetup = await asUser(nina.userId, (client) =>
      client.query<{ id: string }>(
        `select id from public.meetups
         where organizer_id = $1 and community_id is null
         order by created_at desc
         limit 1`,
        [nina.userId],
      ),
    )
    const draftMeetupId = draftMeetup.rows[0]!.id
    const anaToken = await openLink(draftMeetupId)
    await asUser(ana.userId, (client) =>
      client.query(`select public.join_meetup_by_invite($1)`, [anaToken]),
    )
    const biaToken = await openLink(draftMeetupId)
    await asUser(bia.userId, (client) =>
      client.query(`select public.join_meetup_by_invite($1)`, [biaToken]),
    )
    const draft = await asUser(nina.userId, (client) =>
      client.query<{ id: string }>(`select public.create_match($1) as id`, [
        draftMeetupId,
      ]),
    )
    const draftId = draft.rows[0]!.id
    await asUser(nina.userId, (client) =>
      client.query(
        `select public.set_match_lineup($1, 'Azul', $2, 'Verde', $3)`,
        [draftId, [nina.userId, davi.userId], [ana.userId, bia.userId]],
      ),
    )

    await admin(async (client) => {
      await client.query('begin')
      try {
        await client.query(`delete from auth.users where id = $1`, [
          davi.userId,
        ])
        const gone = await client.query(
          `select 1 from public.match_players
           where match_id = $1 and user_id = $2`,
          [draftId, davi.userId],
        )
        const confirmedPlayers = await client.query(
          `select 1 from public.match_players
           where match_id = $1 and user_id = $2`,
          [matchId, bia.userId],
        )
        expect(gone.rowCount).toBe(0)
        expect(confirmedPlayers.rowCount).toBe(1)
        expect(await factsOn(client, matchId)).toEqual(confirmed)
      } finally {
        await client.query('rollback')
      }
      const restored = await client.query(
        `select 1 from public.profiles where id = $1`,
        [davi.userId],
      )
      expect(restored.rowCount).toBe(1)
    })
  })

  it('matches the live guard with a database built only from migrations', async () => {
    await admin(async (client) => {
      await client.query(
        `select pg_terminate_backend(pid)
         from pg_stat_activity
         where datname = 'padre_history_clean' and pid <> pg_backend_pid()`,
      )
      await client.query('drop database if exists padre_history_clean')
      await client.query('create database padre_history_clean')
    })
    const clean = new Client({
      connectionString: env.databaseUrl.replace(
        /\/postgres$/,
        '/padre_history_clean',
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
      for (const file of migrationFiles) {
        await clean.query(
          readFileSync(
            new URL(`../migrations/${file}`, import.meta.url),
            'utf8',
          ),
        )
      }
      const names = [
        'protect_profile_delete',
        'protect_meetup_write',
        'create_meetup_invite_link',
        'revoke_meetup_invite_link',
        'join_meetup_by_invite',
      ]
      const signature = `
        select n.nspname || '.' || p.proname || '(' ||
               pg_get_function_identity_arguments(p.oid) || ')' as sig,
               md5(pg_get_functiondef(p.oid)) as digest
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where p.proname = any($1)
        order by 1
      `
      const live = await admin((client) => client.query(signature, [names]))
      const rebuilt = await clean.query(signature, [names])
      expect(rebuilt.rows).toEqual(live.rows)

      const rules = `
        select conname, pg_get_constraintdef(oid) as def
        from pg_constraint
        where conname in (
          'meetups_organizer_id_fkey',
          'matches_created_by_fkey',
          'match_results_created_by_fkey',
          'match_player_statistics_user_id_fkey',
          'match_audit_logs_actor_id_fkey',
          'communities_created_by_fkey'
        )
        order by conname
      `
      const liveRules = await admin((client) => client.query(rules))
      const cleanRules = await clean.query(rules)
      expect(cleanRules.rows).toEqual(liveRules.rows)
      for (const row of liveRules.rows as { def: string }[]) {
        expect(row.def).toContain('ON DELETE RESTRICT')
      }
    } finally {
      await clean.end()
      await admin(async (client) => {
        await client.query(
          `select pg_terminate_backend(pid)
           from pg_stat_activity
           where datname = 'padre_history_clean' and pid <> pg_backend_pid()`,
        )
        await client.query('drop database if exists padre_history_clean')
      })
    }
  })
})

async function refused(
  userId: string,
  table: 'auth.users' | 'public.profiles',
) {
  let message = ''
  await admin(async (client) => {
    await client.query('begin')
    try {
      await client.query(`delete from ${table} where id = $1`, [userId])
      message = 'a exclusão foi aceita'
    } catch (error) {
      const caught = error as { code?: string; message?: string }
      expect(caught.code).toBe('P0001')
      message = caught.message ?? ''
    } finally {
      await client.query('rollback')
    }
  })
  return message
}

async function facts(id: string) {
  return admin((client) => factsOn(client, id))
}

async function factsOn(client: Client, id: string): Promise<Facts> {
  const players = await client.query(
    `select user_id::text
     from public.match_players
     where match_id = $1
     order by user_id`,
    [id],
  )
  const stats = await client.query(
    `select user_id::text, result, points_for, points_against, sets_won, sets_lost
     from public.match_player_statistics
     where match_id = $1
     order by user_id`,
    [id],
  )
  const match = await client.query<{ status: string; outcome: string | null }>(
    `select matches.status, match_results.outcome
     from public.matches
     left join public.match_results
       on match_results.match_id = matches.id
      and match_results.superseded_at is null
     where matches.id = $1`,
    [id],
  )
  return {
    players: JSON.stringify(players.rows),
    stats: JSON.stringify(stats.rows),
    outcome: match.rows[0]?.outcome ?? null,
    status: match.rows[0]?.status ?? '',
  }
}

async function openLink(id: string) {
  await asUser(nina.userId, (client) =>
    client.query(`select public.revoke_meetup_invite_link($1)`, [id]),
  ).catch(() => undefined)
  const issued = await asUser(nina.userId, (client) =>
    client.query<{ token: string }>(
      `select token from public.create_meetup_invite_link($1)`,
      [id],
    ),
  )
  return issued.rows[0]!.token
}

async function createCommunity(person: Account) {
  const created = await asUser(person.userId, (client) =>
    client.query<{ community: { slug: string } }>(
      `select public.create_community($1, 'Quadra', 'public', $2::uuid[]) as community`,
      [`Grupo ${person.username}`, [beachSport]],
    ),
  )
  return created.rows[0]!.community.slug
}

async function communityMeetup(person: Account, title: string) {
  const created = await asUser(person.userId, (client) =>
    client.query<{ id: string }>(
      `select public.create_community_meetup(
         $1, $2, $3, $4, '',
         now() + interval '3 days',
         now() + interval '3 days 2 hours',
         'America/Sao_Paulo', 'Quadra', '', 8
       ) as id`,
      [slug, beach.formatId, beach.ruleId, title],
    ),
  )
  return created.rows[0]!.id
}

async function shiftMeetup(id: string) {
  await admin(async (client) => {
    await client.query('begin')
    await client.query(`select set_config('padre.meetup_write', 'on', true)`)
    await client.query(
      `update public.meetups
       set starts_at = now() - interval '2 hours',
           ends_at = now() - interval '1 hour'
       where id = $1`,
      [id],
    )
    await client.query('commit')
  })
}

async function play(id: string) {
  const created = await asUser(ana.userId, (client) =>
    client.query<{ id: string }>(`select public.create_match($1) as id`, [id]),
  )
  const createdId = created.rows[0]!.id
  await asUser(ana.userId, (client) =>
    client.query(
      `select public.set_match_lineup($1, 'Azul', $2, 'Verde', $3)`,
      [createdId, [ana.userId, bia.userId], [caio.userId, eva.userId]],
    ),
  )
  await asUser(ana.userId, (client) =>
    client.query(`select public.set_match_result($1, $2::jsonb)`, [
      createdId,
      JSON.stringify({
        sets: [
          [21, 15],
          [21, 18],
        ],
      }),
    ]),
  )
  await asUser(ana.userId, (client) =>
    client.query(`select public.submit_match($1)`, [createdId]),
  )
  await asUser(ana.userId, (client) =>
    client.query(`select public.confirm_match($1)`, [createdId]),
  )
  await asUser(caio.userId, (client) =>
    client.query(`select public.confirm_match($1)`, [createdId]),
  )
  return createdId
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
      await client.query('set local role authenticated')
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
