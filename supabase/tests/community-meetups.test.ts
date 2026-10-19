import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

type Env = { url: string; anonKey: string; databaseUrl: string }
type Account = { username: string; userId: string; email: string }
type Format = { formatId: string; ruleId: string }

const volleyball = 'a1000000-0000-4000-8000-000000000001'
const beachSport = 'a1000000-0000-4000-8000-000000000002'
const env = loadEnv()
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
let ana: Account
let bia: Account
let caio: Account
let davi: Account
let eva: Account
let fabi: Account
let gabi: Account
let beach: Format
let futsal: Format
let publicSlug = ''
let privateSlug = ''
let otherSlug = ''
let meetupId = ''

beforeAll(async () => {
  ;[ana, bia, caio, davi, eva, fabi, gabi] = await Promise.all([
    mustSignup('ana'),
    mustSignup('bia'),
    mustSignup('caio'),
    mustSignup('davi'),
    mustSignup('eva'),
    mustSignup('fabi'),
    mustSignup('gabi'),
  ])
  const catalog = await admin((client) =>
    client.query<{ slug: string; format_id: string; rule_id: string }>(
      `select sport_formats.slug, sport_formats.id as format_id,
              scoring_rule_versions.id as rule_id
       from public.sport_formats
       join public.scoring_rule_versions
         on scoring_rule_versions.format_id = sport_formats.id
        and scoring_rule_versions.active
       where sport_formats.slug in ('beach-2x2', 'futsal-5x5')`,
    ),
  )
  const bySlug = (slug: string) => {
    const row = catalog.rows.find((item) => item.slug === slug)
    if (!row) throw new Error(`Formato ${slug} ausente.`)
    return { formatId: row.format_id, ruleId: row.rule_id }
  }
  beach = bySlug('beach-2x2')
  futsal = bySlug('futsal-5x5')
}, 30_000)

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

describe('community meetups', () => {
  it('lets an active member publish a meetup in the community sport', async () => {
    publicSlug = await createCommunity(ana, 'public', [volleyball, beachSport])
    await join(bia, publicSlug)
    await join(caio, publicSlug)
    await join(eva, publicSlug)
    await join(fabi, publicSlug)
    await join(gabi, publicSlug)
    await asUser(ana.userId, (client) =>
      client.query(`select public.set_community_member_role($1, $2, 'admin')`, [
        publicSlug,
        bia.username,
      ]),
    )

    meetupId = await communityMeetup(caio, publicSlug, beach, 6, 'Areia')
    const row = await admin((client) =>
      client.query<{
        community_id: string
        organizer_id: string
        scoring_rule_version_id: string
        sport_id: string
        confirmed: number
      }>(
        `select meetups.community_id, meetups.organizer_id,
                meetups.scoring_rule_version_id, sport_formats.sport_id,
                private.confirmed_count(meetups.id) as confirmed
         from public.meetups
         join public.sport_formats on sport_formats.id = meetups.sport_format_id
         where meetups.id = $1`,
        [meetupId],
      ),
    )
    const stored = row.rows[0]
    expect(stored?.organizer_id).toBe(caio.userId)
    expect(stored?.scoring_rule_version_id).toBe(beach.ruleId)
    expect(stored?.sport_id).toBe(beachSport)
    expect(stored?.confirmed).toBe(1)
    const linked = await admin((client) =>
      client.query(
        `select 1 from public.community_sports
         where community_id = $1 and sport_id = $2`,
        [stored?.community_id, beachSport],
      ),
    )
    expect(linked.rowCount).toBe(1)

    for (const person of [ana, bia, caio]) {
      const listed = await asUser(person.userId, (client) =>
        client.query<{ payload: { total: number; meetups: { id: string }[] } }>(
          `select public.list_community_meetups($1, 20, 0) as payload`,
          [publicSlug],
        ),
      )
      expect(listed.rows[0]?.payload.total).toBe(1)
      expect(listed.rows[0]?.payload.meetups.map((item) => item.id)).toEqual([
        meetupId,
      ])
      const detail = await asUser(person.userId, (client) =>
        client.query<{ detail: { id: string; community_slug: string } }>(
          `select public.get_meetup($1) as detail`,
          [meetupId],
        ),
      )
      expect(detail.rows[0]?.detail.id).toBe(meetupId)
      expect(detail.rows[0]?.detail.community_slug).toBe(publicSlug)
    }
  })

  it('hides the meetup from outsiders, removed paths and anonymous callers', async () => {
    await expect(
      asUser(davi.userId, (client) =>
        client.query(`select public.get_meetup($1)`, [meetupId]),
      ),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(
      asUser(davi.userId, (client) =>
        client.query(`select public.list_community_meetups($1, 20, 0)`, [
          publicSlug,
        ]),
      ),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(
      asUser(davi.userId, (client) =>
        client.query(`select public.join_community_meetup($1)`, [meetupId]),
      ),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(
      asUser(
        null,
        (client) =>
          client.query(`select public.list_community_meetups($1, 20, 0)`, [
            publicSlug,
          ]),
        'anon',
      ),
    ).rejects.toMatchObject({ code: '42501' })

    const visible = await asUser(davi.userId, (client) =>
      client.query(`select id from public.meetups`),
    )
    expect(visible.rows).toEqual([])
  })

  it('confirms a member without creating a friendship and keeps one seat each', async () => {
    const joined = await asUser(bia.userId, (client) =>
      client.query<{ join_community_meetup: string }>(
        `select public.join_community_meetup($1)`,
        [meetupId],
      ),
    )
    expect(joined.rows[0]?.join_community_meetup).toBe('confirmed')
    const again = await asUser(bia.userId, (client) =>
      client.query<{ join_community_meetup: string }>(
        `select public.join_community_meetup($1)`,
        [meetupId],
      ),
    )
    expect(again.rows[0]?.join_community_meetup).toBe('confirmed')
    expect(await confirmedCount(meetupId)).toBe(2)
    expect(await friendshipCount()).toBe(0)

    await expect(
      communityMeetup(caio, publicSlug, futsal, 4, 'Futsal'),
    ).rejects.toThrow(/sport not in community/)
  })

  it('refuses a second confirmation when the last seat is taken', async () => {
    const tight = await communityMeetup(caio, publicSlug, beach, 2, 'Última')
    await asUser(bia.userId, (client) =>
      client.query(`select public.join_community_meetup($1)`, [tight]),
    )
    await expect(
      asUser(eva.userId, (client) =>
        client.query(`select public.join_community_meetup($1)`, [tight]),
      ),
    ).rejects.toThrow(/meetup is full/)
    expect(await confirmedCount(tight)).toBe(2)
  })

  it('lets only one of two concurrent joins take the last seat', async () => {
    const tight = await communityMeetup(caio, publicSlug, beach, 2, 'Disputa')
    const race = await overlap(
      bia.userId,
      `select public.join_community_meetup($1)`,
      [tight],
      eva.userId,
      `select public.join_community_meetup($1)`,
      [tight],
    )
    expect(race.overlapped).toBe(true)
    const outcomes = [race.held, race.second]
    expect(outcomes.filter((item) => item.ok)).toHaveLength(1)
    expect(outcomes.filter((item) => !item.ok)).toHaveLength(1)
    expect(await confirmedCount(tight)).toBe(2)
  })

  it('does not confirm a member removed in the same race', async () => {
    const target = await communityMeetup(caio, publicSlug, beach, 4, 'Saída')
    const race = await overlap(
      ana.userId,
      `select public.remove_community_member($1, $2)`,
      [publicSlug, gabi.username],
      gabi.userId,
      `select public.join_community_meetup($1)`,
      [target],
    )
    expect(race.overlapped).toBe(true)
    const membership = await admin((client) =>
      client.query<{ status: string }>(
        `select status from public.community_members
         where user_id = $1
           and community_id = (select id from public.communities where slug = $2)`,
        [gabi.userId, publicSlug],
      ),
    )
    expect(membership.rows[0]?.status).toBe('removed')
    const seat = await admin((client) =>
      client.query(
        `select status from public.meetup_participants
         where meetup_id = $1 and user_id = $2 and status = 'confirmed'`,
        [target, gabi.userId],
      ),
    )
    expect(seat.rowCount).toBe(0)
  })

  it('lets the organizer and an admin cancel, and refuses everyone else', async () => {
    const own = await communityMeetup(caio, publicSlug, beach, 4, 'Do Caio')
    const cancelled = await asUser(caio.userId, (client) =>
      client.query<{ cancel_meetup: string }>(
        `select public.cancel_meetup($1)`,
        [own],
      ),
    )
    expect(cancelled.rows[0]?.cancel_meetup).toBe('cancelled')

    const foreign = await communityMeetup(eva, publicSlug, beach, 4, 'Da Eva')
    await expect(
      asUser(caio.userId, (client) =>
        client.query(`select public.cancel_meetup($1)`, [foreign]),
      ),
    ).rejects.toMatchObject({ code: '42501' })

    otherSlug = await createCommunity(davi, 'public', [volleyball])
    await join(fabi, otherSlug)
    await asUser(davi.userId, (client) =>
      client.query(`select public.set_community_member_role($1, $2, 'admin')`, [
        otherSlug,
        fabi.username,
      ]),
    )
    await expect(
      asUser(fabi.userId, (client) =>
        client.query(`select public.cancel_meetup($1)`, [foreign]),
      ),
    ).rejects.toMatchObject({ code: '42501' })

    const moderated = await asUser(bia.userId, (client) =>
      client.query<{ cancel_meetup: string }>(
        `select public.cancel_meetup($1)`,
        [foreign],
      ),
    )
    expect(moderated.rows[0]?.cancel_meetup).toBe('cancelled')
    const audit = await admin((client) =>
      client.query<{ actor_id: string; action: string }>(
        `select actor_id, action from public.meetup_audit_logs where meetup_id = $1`,
        [foreign],
      ),
    )
    expect(audit.rows).toEqual([{ actor_id: bia.userId, action: 'cancelled' }])

    const privateMeetup = await asUser(ana.userId, (client) =>
      client.query<{ id: string }>(
        `select public.create_meetup(
           $1, $2, 'Privado', '', now() + interval '4 days',
           now() + interval '4 days 2 hours', 'America/Sao_Paulo',
           'Quadra', '', 4
         ) as id`,
        [beach.formatId, beach.ruleId],
      ),
    )
    const privateId = privateMeetup.rows[0]!.id
    const stored = await admin((client) =>
      client.query<{ community_id: string | null }>(
        `select community_id from public.meetups where id = $1`,
        [privateId],
      ),
    )
    expect(stored.rows[0]?.community_id).toBeNull()
    await expect(
      asUser(bia.userId, (client) =>
        client.query(`select public.get_meetup($1)`, [privateId]),
      ),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(
      asUser(bia.userId, (client) =>
        client.query(`select public.cancel_meetup($1)`, [privateId]),
      ),
    ).rejects.toMatchObject({ code: '42501' })
    const listed = await asUser(bia.userId, (client) =>
      client.query<{ payload: { meetups: { id: string }[] } }>(
        `select public.list_community_meetups($1, 50, 0) as payload`,
        [publicSlug],
      ),
    )
    expect(
      listed.rows[0]?.payload.meetups.some((item) => item.id === privateId),
    ).toBe(false)
  })

  it('keeps private invites working and blocks them on community meetups', async () => {
    const requested = await asUser(ana.userId, (client) =>
      client.query<{ id: string }>(
        `select id from public.request_friendship($1)`,
        [bia.username],
      ),
    )
    await asUser(bia.userId, (client) =>
      client.query(`select public.respond_to_friendship($1, 'accept')`, [
        requested.rows[0]?.id,
      ]),
    )
    const privateMeetup = await asUser(ana.userId, (client) =>
      client.query<{ id: string }>(
        `select public.create_meetup(
           $1, $2, 'Convite privado', '', now() + interval '5 days',
           now() + interval '5 days 2 hours', 'America/Sao_Paulo',
           'Quadra', '', 4
         ) as id`,
        [beach.formatId, beach.ruleId],
      ),
    )
    const privateId = privateMeetup.rows[0]!.id
    const invited = await asUser(ana.userId, (client) =>
      client.query<{ status: string }>(
        `select status from public.invite_to_meetup($1, $2)`,
        [privateId, bia.username],
      ),
    )
    expect(invited.rows[0]?.status).toBe('pending')
    const link = await asUser(ana.userId, (client) =>
      client.query<{ token: string }>(
        `select token from public.create_meetup_invite_link($1)`,
        [privateId],
      ),
    )
    expect(link.rows[0]?.token).toBeTruthy()

    await expect(
      asUser(caio.userId, (client) =>
        client.query(`select public.invite_to_meetup($1, $2)`, [
          meetupId,
          bia.username,
        ]),
      ),
    ).rejects.toThrow(/community meetup has no invite/)
    await expect(
      asUser(caio.userId, (client) =>
        client.query(`select public.create_meetup_invite_link($1)`, [meetupId]),
      ),
    ).rejects.toThrow(/community meetup has no invite/)
    const joined = await asUser(davi.userId, (client) =>
      client.query<{ join_meetup_by_invite: string }>(
        `select public.join_meetup_by_invite($1)`,
        [link.rows[0]?.token],
      ),
    )
    expect(joined.rows[0]?.join_meetup_by_invite).toBe(privateId)
    await expect(
      asUser(davi.userId, (client) =>
        client.query(`select public.join_meetup_by_invite('token-invalido')`),
      ),
    ).rejects.toThrow(/invite unavailable/)

    await expect(
      admin(async (client) => {
        await client.query('begin')
        await client.query(
          `select set_config('padre.meetup_write', 'on', true)`,
        )
        await client.query(
          `insert into public.meetup_invitations
             (meetup_id, inviter_id, invitee_id, status)
           values ($1, $2, $3, 'pending')`,
          [meetupId, caio.userId, davi.userId],
        )
      }),
    ).rejects.toThrow(/community meetup has no invite/)
  })

  it('keeps a private community meetup invisible to non members', async () => {
    privateSlug = await createCommunity(ana, 'private', [beachSport])
    await asUser(ana.userId, (client) =>
      client.query(`select public.invite_to_community($1, $2)`, [
        privateSlug,
        bia.username,
      ]),
    )
    const invitation = await asUser(bia.userId, (client) =>
      client.query<{
        payload: { invitations: { id: string; slug: string }[] }
      }>(`select public.list_my_community_invitations() as payload`),
    )
    const invitationId = invitation.rows[0]?.payload.invitations.find(
      (item) => item.slug === privateSlug,
    )?.id
    await asUser(bia.userId, (client) =>
      client.query(
        `select public.respond_to_community_invitation($1, 'accept')`,
        [invitationId],
      ),
    )
    const hidden = await communityMeetup(ana, privateSlug, beach, 4, 'Fechado')
    const seen = await asUser(bia.userId, (client) =>
      client.query<{ payload: { meetups: { id: string }[] } }>(
        `select public.list_community_meetups($1, 20, 0) as payload`,
        [privateSlug],
      ),
    )
    expect(seen.rows[0]?.payload.meetups.map((item) => item.id)).toEqual([
      hidden,
    ])
    await asUser(bia.userId, (client) =>
      client.query(`select public.join_community_meetup($1)`, [hidden]),
    )
    await expect(
      asUser(caio.userId, (client) =>
        client.query(`select public.list_community_meetups($1, 20, 0)`, [
          privateSlug,
        ]),
      ),
    ).rejects.toThrow(/not found/)
    await expect(
      asUser(caio.userId, (client) =>
        client.query(`select public.get_meetup($1)`, [hidden]),
      ),
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('plays several matches and keeps one statistic row per player', async () => {
    const played = await communityMeetup(caio, publicSlug, beach, 6, 'Jogo')
    for (const person of [ana, bia, eva]) {
      await asUser(person.userId, (client) =>
        client.query(`select public.join_community_meetup($1)`, [played]),
      )
    }
    await shiftMeetup(played)
    const first = await playMatch(played)
    const second = await playMatch(played)
    expect(await contributionCount(first)).toBe(4)
    expect(await contributionCount(second)).toBe(4)
    const distinct = await admin((client) =>
      client.query<{ count: string }>(
        `select count(*)::text as count from (
           select distinct match_id, user_id
           from public.match_player_statistics
           where match_id in ($1, $2)
         ) rows`,
        [first, second],
      ),
    )
    expect(distinct.rows[0]?.count).toBe('8')
    await asUser(ana.userId, (client) =>
      client.query(`select public.confirm_match($1)`, [second]),
    )
    expect(await contributionCount(second)).toBe(4)

    await asUser(eva.userId, (client) =>
      client.query(`select public.leave_community($1)`, [publicSlug]),
    )
    expect(await participation(played, eva.userId)).toBe('confirmed')
    expect(await contributionCount(first)).toBe(4)
    await expect(
      asUser(eva.userId, (client) =>
        client.query(`select public.get_meetup($1)`, [played]),
      ),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(
      asUser(eva.userId, (client) =>
        client.query(`select public.join_community_meetup($1)`, [meetupId]),
      ),
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('frees a future seat on leave or removal and blocks an organizer exit', async () => {
    await asUser(eva.userId, (client) =>
      client.query(`select public.join_public_community($1)`, [publicSlug]),
    )
    const future = await communityMeetup(caio, publicSlug, beach, 6, 'Amanhã')
    await asUser(eva.userId, (client) =>
      client.query(`select public.join_community_meetup($1)`, [future]),
    )
    await asUser(eva.userId, (client) =>
      client.query(`select public.leave_community($1)`, [publicSlug]),
    )
    expect(await participation(future, eva.userId)).toBe('left')
    expect(await confirmedCount(future)).toBe(1)
    await expect(
      asUser(eva.userId, (client) =>
        client.query(`select public.join_community_meetup($1)`, [future]),
      ),
    ).rejects.toThrow(/cannot be reopened|not allowed/)

    await asUser(fabi.userId, (client) =>
      client.query(`select public.join_community_meetup($1)`, [future]),
    )
    const organized = await communityMeetup(
      fabi,
      publicSlug,
      beach,
      4,
      'Da Fabi',
    )
    await expect(
      asUser(fabi.userId, (client) =>
        client.query(`select public.leave_community($1)`, [publicSlug]),
      ),
    ).rejects.toThrow(/cancel community meetups before leaving/)
    await expect(
      asUser(bia.userId, (client) =>
        client.query(`select public.remove_community_member($1, $2)`, [
          publicSlug,
          fabi.username,
        ]),
      ),
    ).rejects.toThrow(/cancel community meetups before leaving/)
    const still = await asUser(ana.userId, (client) =>
      client.query<{ payload: { members: { username: string }[] } }>(
        `select public.get_community($1) as payload`,
        [publicSlug],
      ),
    )
    expect(
      still.rows[0]?.payload.members.some(
        (member) => member.username === fabi.username,
      ),
    ).toBe(true)

    await asUser(fabi.userId, (client) =>
      client.query(`select public.cancel_meetup($1)`, [organized]),
    )
    await asUser(bia.userId, (client) =>
      client.query(`select public.remove_community_member($1, $2)`, [
        publicSlug,
        fabi.username,
      ]),
    )
    expect(await participation(future, fabi.userId)).toBe('removed')
    await expect(
      asUser(fabi.userId, (client) =>
        client.query(`select public.list_community_meetups($1, 20, 0)`, [
          publicSlug,
        ]),
      ),
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('refuses to delete an owner or community organizer and keeps the rows', async () => {
    const before = await snapshot()
    await expect(deleteUser(ana.userId)).rejects.toThrow(/proprietária/)
    await expect(deleteUser(caio.userId)).rejects.toThrow(
      /encontros comunitários/,
    )
    expect(await snapshot()).toEqual(before)

    const client = new Client({ connectionString: env.databaseUrl })
    await client.connect()
    try {
      await client.query('begin')
      await expect(
        client.query(`delete from public.communities where slug = $1`, [
          publicSlug,
        ]),
      ).rejects.toMatchObject({ code: '23503' })
      await client.query('rollback')
    } finally {
      await client.end()
    }
    expect(await snapshot()).toEqual(before)
  })

  it('rejects direct changes to community, organizer, capacity and participation', async () => {
    await expect(
      asUser(caio.userId, (client) =>
        client.query(
          `update public.meetups set max_participants = 8 where id = $1`,
          [meetupId],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(
      asUser(bia.userId, (client) =>
        client.query(
          `insert into public.meetup_participants (meetup_id, user_id, status)
           values ($1, $2, 'confirmed')`,
          [meetupId, bia.userId],
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
          `update public.meetups set community_id = null where id = $1`,
          [meetupId],
        )
      }),
    ).rejects.toThrow(/meetup timestamps are protected/)
  })
})

async function snapshot() {
  return admin(async (client) => {
    const communities = await client.query<{ count: string }>(
      `select count(*)::text as count from public.communities where slug = $1`,
      [publicSlug],
    )
    const meetups = await client.query<{ count: string }>(
      `select count(*)::text as count from public.meetups where id = $1`,
      [meetupId],
    )
    const stats = await client.query<{ count: string }>(
      `select count(*)::text as count
       from public.match_player_statistics
       where match_id in (
         select id from public.matches where meetup_id in (
           select id from public.meetups where community_id = (
             select id from public.communities where slug = $1
           )
         )
       )`,
      [publicSlug],
    )
    return {
      communities: communities.rows[0]?.count,
      meetups: meetups.rows[0]?.count,
      stats: stats.rows[0]?.count,
    }
  })
}

async function deleteUser(userId: string) {
  const client = new Client({ connectionString: env.databaseUrl })
  await client.connect()
  try {
    await client.query('begin')
    try {
      await client.query(`delete from auth.users where id = $1`, [userId])
      await client.query('rollback')
    } catch (error) {
      await client.query('rollback')
      throw error
    }
  } finally {
    await client.end()
  }
}

async function playMatch(id: string) {
  const created = await asUser(caio.userId, (client) =>
    client.query<{ id: string }>(`select public.create_match($1) as id`, [id]),
  )
  const matchId = created.rows[0]!.id
  await asUser(caio.userId, (client) =>
    client.query(
      `select public.set_match_lineup($1, 'Azul', $2, 'Verde', $3)`,
      [matchId, [caio.userId, bia.userId], [ana.userId, eva.userId]],
    ),
  )
  await asUser(caio.userId, (client) =>
    client.query(`select public.set_match_result($1, $2::jsonb)`, [
      matchId,
      JSON.stringify({
        sets: [
          [21, 15],
          [21, 18],
        ],
      }),
    ]),
  )
  await asUser(caio.userId, (client) =>
    client.query(`select public.submit_match($1)`, [matchId]),
  )
  await asUser(bia.userId, (client) =>
    client.query(`select public.confirm_match($1)`, [matchId]),
  )
  await asUser(ana.userId, (client) =>
    client.query(`select public.confirm_match($1)`, [matchId]),
  )
  return matchId
}

async function contributionCount(matchId: string) {
  const result = await admin((client) =>
    client.query<{ count: string }>(
      `select count(*)::text as count
       from public.match_player_statistics where match_id = $1`,
      [matchId],
    ),
  )
  return Number(result.rows[0]?.count ?? 0)
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

async function confirmedCount(id: string) {
  const result = await admin((client) =>
    client.query<{ count: number }>(
      `select private.confirmed_count($1) as count`,
      [id],
    ),
  )
  return result.rows[0]?.count
}

async function participation(id: string, userId: string) {
  const result = await admin((client) =>
    client.query<{ status: string }>(
      `select status from public.meetup_participants
       where meetup_id = $1 and user_id = $2`,
      [id, userId],
    ),
  )
  return result.rows[0]?.status ?? null
}

async function friendshipCount() {
  const ids = [ana, bia, caio, davi, eva, fabi, gabi].map(
    (person) => person.userId,
  )
  const result = await admin((client) =>
    client.query<{ count: string }>(
      `select count(*)::text as count from public.friendships
       where pair_low = any($1::uuid[]) or pair_high = any($1::uuid[])`,
      [ids],
    ),
  )
  return Number(result.rows[0]?.count ?? 0)
}

async function communityMeetup(
  person: Account,
  slug: string,
  format: Format,
  capacity: number,
  title: string,
) {
  const created = await asUser(person.userId, (client) =>
    client.query<{ id: string }>(
      `select public.create_community_meetup(
         $1, $2, $3, $4, '',
         now() + interval '3 days',
         now() + interval '3 days 2 hours',
         'America/Sao_Paulo', 'Quadra', '', $5
       ) as id`,
      [slug, format.formatId, format.ruleId, title, capacity],
    ),
  )
  return created.rows[0]!.id
}

async function createCommunity(
  person: Account,
  visibility: 'public' | 'private',
  sports: string[],
) {
  const created = await asUser(person.userId, (client) =>
    client.query<{ community: { slug: string } }>(
      `select public.create_community($1, 'Quadra', $2, $3) as community`,
      [`Grupo ${person.username}`, visibility, sports],
    ),
  )
  return created.rows[0]!.community.slug
}

async function join(person: Account, slug: string) {
  await asUser(person.userId, (client) =>
    client.query(`select public.join_public_community($1)`, [slug]),
  )
}

async function overlap(
  firstUser: string,
  firstSql: string,
  firstParams: unknown[],
  secondUser: string,
  secondSql: string,
  secondParams: unknown[],
) {
  const first = new Client({ connectionString: env.databaseUrl })
  const second = new Client({ connectionString: env.databaseUrl })
  await first.connect()
  await second.connect()
  try {
    await first.query('begin')
    await second.query('begin')
    await first.query(`set local statement_timeout = '8s'`)
    await second.query(`set local statement_timeout = '8s'`)
    await assume(first, firstUser)
    await assume(second, secondUser)
    const held = await first.query(firstSql, firstParams)
    let settled = false
    const waiting = second.query(secondSql, secondParams).then(
      (result) => {
        settled = true
        return { ok: true as const, result }
      },
      (error: unknown) => {
        settled = true
        return { ok: false as const, error }
      },
    )
    await new Promise((resolve) => setTimeout(resolve, 200))
    const overlapped = !settled
    await first.query('commit')
    const secondOutcome = await waiting
    if (secondOutcome.ok) await second.query('commit')
    else await second.query('rollback')
    return {
      overlapped,
      held: { ok: true as const, result: held },
      second: secondOutcome,
    }
  } catch (error) {
    await first.query('rollback').catch(() => undefined)
    await second.query('rollback').catch(() => undefined)
    throw error
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
  const email = `${label}-${suffix}@padre.test`
  const response = await fetch(`${env.url}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: env.anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      password: 'senha-segura',
      data: { username, display_name: `Segredo ${label}` },
    }),
  })
  const body = (await response.json()) as { user?: { id?: string } }
  if (!body.user?.id) throw new Error(`Cadastro de ${label} falhou.`)
  return { username, userId: body.user.id, email }
}
