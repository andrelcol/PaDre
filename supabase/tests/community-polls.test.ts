import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

type Env = { url: string; anonKey: string; databaseUrl: string }
type Account = { username: string; userId: string }
type PollOption = {
  id: string
  label: string
  sport_id: string | null
  starts_at: string | null
  time_zone: string | null
  vote_count: number
  percent: number | null
  leading: boolean
}
type Poll = {
  id: string
  question: string
  kind: string
  selection_mode: string
  max_selections: number
  effective_status: string
  participant_count: number
  my_option_ids: string[]
  can_close: boolean
  can_cancel: boolean
  created_by_username: string | null
  options: PollOption[]
}

const volleyball = 'a1000000-0000-4000-8000-000000000001'
const futsal = 'a1000000-0000-4000-8000-000000000003'
const beachTennis = 'a1000000-0000-4000-8000-000000000004'
const footvolley = 'a1000000-0000-4000-8000-000000000005'
const env = loadEnv()
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
let ana: Account
let bia: Account
let caio: Account
let davi: Account
let eva: Account
let nina: Account
let gabi: Account
let slug = ''
let privateSlug = ''
let otherSlug = ''
let beach: { formatId: string; ruleId: string }

beforeAll(async () => {
  ;[ana, bia, caio, davi, eva, nina, gabi] = await Promise.all([
    mustSignup('ana'),
    mustSignup('bia'),
    mustSignup('caio'),
    mustSignup('davi'),
    mustSignup('eva'),
    mustSignup('nina'),
    mustSignup('gabi'),
  ])
  const catalog = await admin((client) =>
    client.query<{ format_id: string; rule_id: string }>(
      `select sport_formats.id as format_id, scoring_rule_versions.id as rule_id
       from public.sport_formats
       join public.scoring_rule_versions
         on scoring_rule_versions.format_id = sport_formats.id
        and scoring_rule_versions.active
       where sport_formats.slug = 'footvolley-2x2'`,
    ),
  )
  beach = {
    formatId: catalog.rows[0]!.format_id,
    ruleId: catalog.rows[0]!.rule_id,
  }
  slug = await createCommunity(ana, 'public', [
    volleyball,
    beachTennis,
    footvolley,
  ])
  for (const person of [bia, caio, eva, nina, gabi]) {
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
  privateSlug = await createCommunity(ana, 'private', [volleyball])
  otherSlug = await createCommunity(davi, 'public', [volleyball])
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

describe('community polls', () => {
  it('creates a poll inside the community and refuses an incomplete one', async () => {
    const poll = await createPoll(ana, slug, 'general', 'single', 1, [
      { label: 'Manhã' },
      { label: 'Tarde' },
    ])
    expect(poll.kind).toBe('general')
    expect(poll.max_selections).toBe(1)
    expect(poll.options).toHaveLength(2)
    const stored = await admin((client) =>
      client.query<{ community_id: string; slug: string }>(
        `select poll.community_id, community.slug
         from public.community_polls poll
         join public.communities community on community.id = poll.community_id
         where poll.id = $1`,
        [poll.id],
      ),
    )
    expect(stored.rows[0]!.slug).toBe(slug)

    await expect(
      createPoll(ana, slug, 'general', 'single', 1, [{ label: 'Só uma' }]),
    ).rejects.toThrow(/too few options/)
    await expect(
      createPoll(
        ana,
        slug,
        'general',
        'single',
        1,
        Array.from({ length: 11 }, (_, index) => ({ label: `Opção ${index}` })),
      ),
    ).rejects.toThrow(/too many options/)
    await expect(
      createPoll(ana, slug, 'general', 'single', 1, [
        { label: 'Quadra' },
        { label: '  quadra  ' },
      ]),
    ).rejects.toThrow(/duplicate option/)
    await expect(
      createPoll(ana, slug, 'general', 'single', 1, [
        { label: ' ' },
        { label: 'Cheia' },
      ]),
    ).rejects.toThrow(/invalid option/)
  })

  it('hides polls from outsiders, pending invites and anonymous users', async () => {
    const poll = await createPoll(ana, slug, 'general', 'single', 1, [
      { label: 'Dentro' },
      { label: 'Fora' },
    ])
    await expect(list(davi, slug)).rejects.toMatchObject({ code: '42501' })
    await expect(get(davi, poll.id)).rejects.toMatchObject({ code: '42501' })
    await expect(
      vote(davi, poll.id, [poll.options[0]!.id]),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(list(null, slug)).rejects.toMatchObject({ code: '42501' })
    await expect(
      vote(null, poll.id, [poll.options[0]!.id]),
    ).rejects.toMatchObject({ code: '42501' })

    const hidden = await createPoll(ana, privateSlug, 'general', 'single', 1, [
      { label: 'Segredo' },
      { label: 'Aberto' },
    ])
    await asUser(ana.userId, (client) =>
      client.query(`select public.invite_to_community($1, $2)`, [
        privateSlug,
        davi.username,
      ]),
    )
    await expect(list(davi, privateSlug)).rejects.toMatchObject({
      code: 'P0001',
    })
    await expect(get(davi, hidden.id)).rejects.toMatchObject({ code: 'P0001' })
  })

  it('replaces a single vote and refuses a second option', async () => {
    const poll = await createPoll(caio, slug, 'general', 'single', 1, [
      { label: 'Azul' },
      { label: 'Verde' },
    ])
    const [blue, green] = poll.options
    const first = await vote(caio, poll.id, [blue!.id])
    expect(first.my_option_ids).toEqual([blue!.id])
    expect(option(first, 'Azul').vote_count).toBe(1)

    const changed = await vote(caio, poll.id, [green!.id])
    expect(changed.my_option_ids).toEqual([green!.id])
    expect(option(changed, 'Azul').vote_count).toBe(0)
    expect(option(changed, 'Verde').vote_count).toBe(1)
    expect(await voteRows(poll.id, caio.userId)).toBe(1)

    await expect(vote(caio, poll.id, [blue!.id, green!.id])).rejects.toThrow(
      /too many selections/,
    )
    const kept = await get(caio, poll.id)
    expect(kept.my_option_ids).toEqual([green!.id])
    expect(await voteRows(poll.id, caio.userId)).toBe(1)
  })

  it('stores a multiple selection, rejects the excess and stays idempotent', async () => {
    const poll = await createPoll(bia, slug, 'general', 'multiple', 2, [
      { label: 'Nove' },
      { label: 'Onze' },
      { label: 'Dezasseis' },
    ])
    const [nine, eleven, sixteen] = poll.options
    const other = await createPoll(bia, slug, 'general', 'single', 1, [
      { label: 'Uma' },
      { label: 'Outra' },
    ])
    const chosen = await vote(bia, poll.id, [nine!.id, eleven!.id])
    expect(chosen.my_option_ids).toEqual([nine!.id, eleven!.id])
    expect(chosen.participant_count).toBe(1)
    expect(await voteRows(poll.id, bia.userId)).toBe(2)

    await expect(
      vote(bia, poll.id, [nine!.id, eleven!.id, sixteen!.id]),
    ).rejects.toThrow(/too many selections/)
    await expect(vote(bia, poll.id, [other.options[0]!.id])).rejects.toThrow(
      /option is not in poll/,
    )
    await expect(vote(bia, poll.id, [nine!.id, nine!.id])).rejects.toThrow(
      /duplicate option/,
    )

    const repeated = await vote(bia, poll.id, [nine!.id, eleven!.id])
    expect(repeated.my_option_ids).toEqual([nine!.id, eleven!.id])
    expect(await voteRows(poll.id, bia.userId)).toBe(2)

    const cleared = await vote(bia, poll.id, [])
    expect(cleared.my_option_ids).toEqual([])
    expect(cleared.participant_count).toBe(0)
    expect(option(cleared, 'Nove').vote_count).toBe(0)
  })

  it('keeps one selection when the same person votes twice at once', async () => {
    const poll = await createPoll(caio, slug, 'general', 'single', 1, [
      { label: 'Primeira' },
      { label: 'Segunda' },
    ])
    const outcome = await race(
      caio.userId,
      caio.userId,
      (client) =>
        client.query(`select public.vote_community_poll($1, $2::uuid[])`, [
          poll.id,
          [poll.options[0]!.id],
        ]),
      (client) =>
        client.query(`select public.vote_community_poll($1, $2::uuid[])`, [
          poll.id,
          [poll.options[1]!.id],
        ]),
    )
    expect(outcome).toBe('ok')
    const seen = await get(ana, poll.id)
    expect(seen.participant_count).toBe(1)
    expect(option(seen, 'Segunda').vote_count).toBe(1)
    expect(option(seen, 'Primeira').vote_count).toBe(0)
    expect(await voteRows(poll.id, caio.userId)).toBe(1)
  })

  it('does not accept a vote that was waiting for the poll to close', async () => {
    const poll = await createPoll(ana, slug, 'general', 'single', 1, [
      { label: 'Fica' },
      { label: 'Sai' },
    ])
    await vote(caio, poll.id, [poll.options[0]!.id])
    const outcome = await race(
      ana.userId,
      caio.userId,
      (client) =>
        client.query(`select public.close_community_poll($1)`, [poll.id]),
      (client) =>
        client.query(`select public.vote_community_poll($1, $2::uuid[])`, [
          poll.id,
          [poll.options[1]!.id],
        ]),
    )
    expect(outcome).toMatchObject({
      code: 'P0001',
      message: expect.stringContaining('poll closed'),
    })
    const closed = await get(ana, poll.id)
    expect(closed.effective_status).toBe('closed')
    expect(option(closed, 'Fica').vote_count).toBe(1)
    expect(option(closed, 'Sai').vote_count).toBe(0)
  })

  it('keeps the vote that won the lock and then closes', async () => {
    const poll = await createPoll(ana, slug, 'general', 'single', 1, [
      { label: 'Antes' },
      { label: 'Durante' },
    ])
    const outcome = await race(
      caio.userId,
      ana.userId,
      (client) =>
        client.query(`select public.vote_community_poll($1, $2::uuid[])`, [
          poll.id,
          [poll.options[1]!.id],
        ]),
      (client) =>
        client.query(`select public.close_community_poll($1)`, [poll.id]),
    )
    expect(outcome).toBe('ok')
    const closed = await get(bia, poll.id)
    expect(closed.effective_status).toBe('closed')
    expect(option(closed, 'Durante').vote_count).toBe(1)
  })

  it('closes on the deadline without a scheduler', async () => {
    const poll = await createPoll(bia, slug, 'general', 'single', 1, [
      { label: 'Ainda' },
      { label: 'Já' },
    ])
    await vote(caio, poll.id, [poll.options[0]!.id])
    await admin((client) =>
      client.query(
        `update public.community_polls
         set closes_at = now() - interval '1 minute'
         where id = $1`,
        [poll.id],
      ),
    )
    await expect(vote(caio, poll.id, [poll.options[1]!.id])).rejects.toThrow(
      /poll closed/,
    )
    const expired = await get(ana, poll.id)
    expect(expired.effective_status).toBe('closed')
    expect(option(expired, 'Ainda').vote_count).toBe(1)
    const closedPage = await list(ana, slug, 'closed')
    expect(closedPage.polls.some((item) => item.id === poll.id)).toBe(true)
    const openPage = await list(ana, slug, 'open')
    expect(openPage.polls.some((item) => item.id === poll.id)).toBe(false)
  })

  it('lets the creator close and an admin cancel, and stops everyone else', async () => {
    const own = await createPoll(caio, slug, 'general', 'single', 1, [
      { label: 'Minha' },
      { label: 'Outra' },
    ])
    await vote(eva, own.id, [own.options[0]!.id])
    const closed = await close(caio, own.id)
    expect(closed.effective_status).toBe('closed')
    expect(option(closed, 'Minha').vote_count).toBe(1)
    await expect(vote(eva, own.id, [own.options[1]!.id])).rejects.toThrow(
      /poll closed/,
    )
    const again = await close(caio, own.id)
    expect(again.effective_status).toBe('closed')

    const foreign = await createPoll(caio, slug, 'general', 'single', 1, [
      { label: 'Deles' },
      { label: 'Nossa' },
    ])
    await expect(cancel(eva, foreign.id)).rejects.toMatchObject({
      code: '42501',
    })
    expect((await list(davi, otherSlug)).polls).toEqual([])
    await expect(close(davi, foreign.id)).rejects.toMatchObject({
      code: '42501',
    })
    const cancelled = await cancel(bia, foreign.id)
    expect(cancelled.effective_status).toBe('cancelled')
    expect(cancelled.options.every((item) => item.leading === false)).toBe(true)
    await expect(
      vote(caio, foreign.id, [foreign.options[0]!.id]),
    ).rejects.toThrow(/poll cancelled/)
  })

  it('aggregates percentages, ties and an empty poll from the votes themselves', async () => {
    const poll = await createPoll(bia, slug, 'general', 'multiple', 2, [
      { label: 'Rede' },
      { label: 'Areia' },
      { label: 'Quadra' },
    ])
    const [net, sand] = poll.options
    await vote(bia, poll.id, [net!.id, sand!.id])
    await vote(caio, poll.id, [net!.id])
    const result = await get(ana, poll.id)
    expect(result.participant_count).toBe(2)
    expect(option(result, 'Rede')).toMatchObject({
      vote_count: 2,
      percent: 100,
      leading: false,
    })
    expect(option(result, 'Areia')).toMatchObject({
      vote_count: 1,
      percent: 50,
    })
    expect(option(result, 'Quadra').vote_count).toBe(0)
    const closed = await close(bia, poll.id)
    expect(option(closed, 'Rede').leading).toBe(true)
    expect(option(closed, 'Areia').leading).toBe(false)
    expect(
      option(closed, 'Rede').percent! +
        option(closed, 'Areia').percent! +
        option(closed, 'Quadra').percent!,
    ).toBe(150)

    const tied = await createPoll(ana, slug, 'general', 'single', 1, [
      { label: 'Empate A' },
      { label: 'Empate B' },
    ])
    await vote(bia, tied.id, [tied.options[0]!.id])
    await vote(caio, tied.id, [tied.options[1]!.id])
    const tie = await close(ana, tied.id)
    expect(tie.options.filter((item) => item.leading)).toHaveLength(2)

    const empty = await createPoll(ana, slug, 'general', 'single', 1, [
      { label: 'Ninguém A' },
      { label: 'Ninguém B' },
    ])
    const untouched = await close(ana, empty.id)
    expect(untouched.participant_count).toBe(0)
    expect(untouched.options.every((item) => item.leading === false)).toBe(true)
    expect(untouched.options.every((item) => item.percent === null)).toBe(true)
  })

  it('does not reveal individual votes, even to an admin', async () => {
    const poll = await createPoll(bia, slug, 'general', 'single', 1, [
      { label: 'Oculta' },
      { label: 'Visível' },
    ])
    await vote(caio, poll.id, [poll.options[0]!.id])
    for (const person of [bia, ana, eva]) {
      const seen = JSON.stringify(await get(person, poll.id))
      expect(seen).not.toContain(caio.userId)
      expect(seen).not.toContain(caio.username)
      expect(seen).not.toContain('user_id')
    }
    await expect(
      asUser(bia.userId, (client) =>
        client.query(`select * from public.community_poll_votes`),
      ),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(
      asUser(bia.userId, (client) =>
        client.query(
          `insert into public.community_poll_votes (poll_id, option_id, user_id)
           values ($1, $2, $3)`,
          [poll.id, poll.options[1]!.id, caio.userId],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('refuses to change a published poll or option', async () => {
    const poll = await createPoll(bia, slug, 'general', 'single', 1, [
      { label: 'Fixa' },
      { label: 'Estável' },
    ])
    await expect(
      admin(async (client) => {
        await client.query('begin')
        await client.query(`select set_config('padre.poll_write', 'on', true)`)
        await client.query(
          `update public.community_polls set question = 'Trocada' where id = $1`,
          [poll.id],
        )
      }),
    ).rejects.toThrow(/poll is immutable/)
    await expect(
      admin(async (client) => {
        await client.query('begin')
        await client.query(`select set_config('padre.poll_write', 'on', true)`)
        await client.query(
          `update public.community_poll_options set label = 'Trocada' where id = $1`,
          [poll.options[0]!.id],
        )
      }),
    ).rejects.toThrow(/poll is immutable/)
    await expect(
      asUser(caio.userId, (client) =>
        client.query(
          `update public.community_poll_options set label = 'Trocada' where id = $1`,
          [poll.options[0]!.id],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('uses a real community sport, a zoned instant, and a manual place name', async () => {
    const sport = await createPoll(ana, slug, 'sport', 'single', 1, [
      { sport_id: volleyball },
      { sport_id: beachTennis },
      { sport_id: footvolley },
    ])
    expect(sport.options.map((item) => item.label)).toEqual([
      'Vôlei',
      'Beach tennis',
      'Futevôlei',
    ])
    expect(sport.options.map((item) => item.sport_id)).toEqual([
      volleyball,
      beachTennis,
      footvolley,
    ])
    await expect(
      createPoll(ana, slug, 'sport', 'single', 1, [
        { sport_id: volleyball },
        { sport_id: futsal },
      ]),
    ).rejects.toThrow(/sport not in community/)

    const starts = '2026-10-25T13:00:00.000Z'
    const schedule = await createPoll(ana, slug, 'schedule', 'single', 1, [
      {
        label: 'Sábado',
        starts_at: starts,
        time_zone: 'America/Sao_Paulo',
      },
      { label: 'De manhã' },
    ])
    const timed = option(schedule, 'Sábado')
    expect(new Date(timed.starts_at!).toISOString()).toBe(starts)
    expect(timed.time_zone).toBe('America/Sao_Paulo')
    expect(option(schedule, 'De manhã').starts_at).toBeNull()
    const stored = await admin((client) =>
      client.query<{ starts_at: Date; time_zone: string }>(
        `select starts_at, time_zone
         from public.community_poll_options
         where id = $1`,
        [timed.id],
      ),
    )
    expect(stored.rows[0]!.starts_at.toISOString()).toBe(starts)
    expect(stored.rows[0]!.time_zone).toBe('America/Sao_Paulo')

    const place = await createPoll(ana, slug, 'location', 'single', 1, [
      { label: 'Quadra central' },
      { label: 'Praia' },
    ])
    expect(place.options.every((item) => item.sport_id === null)).toBe(true)
    const columns = await admin((client) =>
      client.query(
        `select column_name
         from information_schema.columns
         where table_schema = 'public'
           and table_name = 'community_poll_options'
           and column_name = 'place_id'`,
      ),
    )
    expect(columns.rowCount).toBe(0)
    const another = await createPoll(bia, slug, 'location', 'single', 1, [
      { label: 'Quadra central' },
      { label: 'Ginásio' },
    ])
    expect(another.id).not.toBe(place.id)
  })

  it('drops access after leaving or being removed and keeps the aggregate', async () => {
    const poll = await createPoll(bia, slug, 'general', 'single', 1, [
      { label: 'Ficou' },
      { label: 'Saiu' },
    ])
    await vote(eva, poll.id, [poll.options[0]!.id])
    await vote(gabi, poll.id, [poll.options[1]!.id])
    await asUser(eva.userId, (client) =>
      client.query(`select public.leave_community($1)`, [slug]),
    )
    await asUser(ana.userId, (client) =>
      client.query(`select public.remove_community_member($1, $2)`, [
        slug,
        gabi.username,
      ]),
    )
    await expect(get(eva, poll.id)).rejects.toMatchObject({ code: '42501' })
    await expect(get(gabi, poll.id)).rejects.toMatchObject({ code: '42501' })
    await expect(
      vote(eva, poll.id, [poll.options[1]!.id]),
    ).rejects.toMatchObject({ code: '42501' })
    const kept = await get(ana, poll.id)
    expect(kept.participant_count).toBe(2)
    expect(JSON.stringify(kept)).not.toContain(eva.username)
    expect(JSON.stringify(kept)).not.toContain(gabi.username)
  })

  it('does not block account deletion and does not erase sports history', async () => {
    const poll = await createPoll(nina, slug, 'general', 'single', 1, [
      { label: 'Autora' },
      { label: 'Colega' },
    ])
    await vote(nina, poll.id, [poll.options[0]!.id])
    await vote(bia, poll.id, [poll.options[1]!.id])
    const definition = await admin((client) =>
      client.query<{ def: string }>(
        `select pg_get_functiondef('private.protect_profile_delete()'::regprocedure) as def`,
      ),
    )
    expect(definition.rows[0]!.def).not.toContain('community_poll')

    await admin((client) =>
      client.query(`delete from auth.users where id = $1`, [nina.userId]),
    )
    const author = await admin((client) =>
      client.query<{ created_by: string | null }>(
        `select created_by from public.community_polls where id = $1`,
        [poll.id],
      ),
    )
    expect(author.rows[0]!.created_by).toBeNull()
    expect(await voteRows(poll.id, nina.userId)).toBe(0)
    const kept = await get(bia, poll.id)
    expect(option(kept, 'Colega').vote_count).toBe(1)
    expect(kept.created_by_username).toBeNull()

    await asUser(eva.userId, (client) =>
      client.query(`select public.join_public_community($1)`, [slug]),
    )
    const meetup = await asUser(ana.userId, (client) =>
      client.query<{ id: string }>(
        `select public.create_community_meetup(
           $1, $2, $3, 'Histórico', '',
           now() + interval '3 days',
           now() + interval '3 days 2 hours',
           'America/Sao_Paulo', 'Quadra', '', 8
         ) as id`,
        [slug, beach.formatId, beach.ruleId],
      ),
    )
    const meetupId = meetup.rows[0]!.id
    for (const person of [bia, caio, eva]) {
      await asUser(person.userId, (client) =>
        client.query(`select public.join_community_meetup($1)`, [meetupId]),
      )
    }
    const match = await asUser(ana.userId, (client) =>
      client.query<{ id: string }>(`select public.create_match($1) as id`, [
        meetupId,
      ]),
    )
    const matchId = match.rows[0]!.id
    await asUser(ana.userId, (client) =>
      client.query(
        `select public.set_match_lineup($1, 'Azul', $2, 'Verde', $3)`,
        [matchId, [ana.userId, bia.userId], [caio.userId, eva.userId]],
      ),
    )
    await admin(async (client) => {
      await client.query('begin')
      await client.query(`select set_config('padre.meetup_write', 'on', true)`)
      await client.query(
        `update public.meetups
         set starts_at = now() - interval '2 hours',
             ends_at = now() - interval '1 hour'
         where id = $1`,
        [meetupId],
      )
      await client.query('commit')
    })
    await asUser(ana.userId, (client) =>
      client.query(`select public.set_match_result($1, $2::jsonb)`, [
        matchId,
        JSON.stringify({
          sets: [
            [18, 15],
            [18, 16],
          ],
        }),
      ]),
    )
    await asUser(ana.userId, (client) =>
      client.query(`select public.submit_match($1)`, [matchId]),
    )
    await asUser(ana.userId, (client) =>
      client.query(`select public.confirm_match($1)`, [matchId]),
    )
    await asUser(caio.userId, (client) =>
      client.query(`select public.confirm_match($1)`, [matchId]),
    )
    await expect(
      admin((client) =>
        client.query(`delete from auth.users where id = $1`, [caio.userId]),
      ),
    ).rejects.toThrow(/escalação/)
    const still = await admin((client) =>
      client.query(`select id from public.matches where id = $1`, [matchId]),
    )
    expect(still.rowCount).toBe(1)
  })
})

describe('community poll limits', () => {
  it('stops the eleventh poll in the same hour', async () => {
    const own = await createCommunity(gabi, 'public', [volleyball])
    for (let index = 0; index < 10; index += 1) {
      await createPoll(gabi, own, 'general', 'single', 1, [
        { label: `Limite ${index} A` },
        { label: `Limite ${index} B` },
      ])
    }
    await expect(
      createPoll(gabi, own, 'general', 'single', 1, [
        { label: 'Passou A' },
        { label: 'Passou B' },
      ]),
    ).rejects.toThrow(/too many polls/)
  })
})

function option(poll: Poll, label: string) {
  return poll.options.find((item) => item.label === label)!
}

async function voteRows(pollId: string, userId: string) {
  const result = await admin((client) =>
    client.query<{ count: string }>(
      `select count(*)::text as count
       from public.community_poll_votes
       where poll_id = $1 and user_id = $2`,
      [pollId, userId],
    ),
  )
  return Number(result.rows[0]!.count)
}

async function createPoll(
  person: Account,
  communitySlug: string,
  kind: string,
  mode: string,
  maxSelections: number,
  options: unknown[],
  question = 'Qual vamos escolher hoje?',
) {
  const result = await asUser(person.userId, (client) =>
    client.query<{ poll: Poll }>(
      `select public.create_community_poll(
         $1, $2, '', $3, $4, $5, now() + interval '2 days', $6::jsonb
       ) as poll`,
      [
        communitySlug,
        question,
        kind,
        mode,
        maxSelections,
        JSON.stringify(options),
      ],
    ),
  )
  return result.rows[0]!.poll
}

async function list(
  person: Account | null,
  communitySlug: string,
  status = 'open',
  pageLimit = 20,
) {
  const run = (client: Client) =>
    client.query<{ page: { polls: Poll[]; has_older: boolean } }>(
      `select public.list_community_polls($1, $2, $3, null, null) as page`,
      [communitySlug, status, pageLimit],
    )
  const result = person
    ? await asUser(person.userId, run)
    : await asUser(null, run, 'anon')
  return result.rows[0]!.page
}

async function get(person: Account, pollId: string) {
  const result = await asUser(person.userId, (client) =>
    client.query<{ poll: Poll }>(
      `select public.get_community_poll($1) as poll`,
      [pollId],
    ),
  )
  return result.rows[0]!.poll
}

async function vote(
  person: Account | null,
  pollId: string,
  optionIds: string[],
) {
  const run = (client: Client) =>
    client.query<{ poll: Poll }>(
      `select public.vote_community_poll($1, $2::uuid[]) as poll`,
      [pollId, optionIds],
    )
  const result = person
    ? await asUser(person.userId, run)
    : await asUser(null, run, 'anon')
  return result.rows[0]!.poll
}

async function close(person: Account, pollId: string) {
  const result = await asUser(person.userId, (client) =>
    client.query<{ poll: Poll }>(
      `select public.close_community_poll($1) as poll`,
      [pollId],
    ),
  )
  return result.rows[0]!.poll
}

async function cancel(person: Account, pollId: string) {
  const result = await asUser(person.userId, (client) =>
    client.query<{ poll: Poll }>(
      `select public.cancel_community_poll($1) as poll`,
      [pollId],
    ),
  )
  return result.rows[0]!.poll
}

async function createCommunity(
  person: Account,
  visibility: 'public' | 'private',
  sportIds: string[],
) {
  const created = await asUser(person.userId, (client) =>
    client.query<{ community: { slug: string } }>(
      `select public.create_community($1, 'Quadra', $2, $3::uuid[]) as community`,
      [`Grupo ${person.username}`, visibility, sportIds],
    ),
  )
  return created.rows[0]!.community.slug
}

async function race(
  leftId: string,
  rightId: string,
  first: (client: Client) => Promise<unknown>,
  second: (client: Client) => Promise<unknown>,
) {
  const left = new Client({ connectionString: env.databaseUrl })
  const right = new Client({ connectionString: env.databaseUrl })
  await left.connect()
  await right.connect()
  try {
    await left.query('begin')
    await right.query('begin')
    await assume(left, leftId)
    await assume(right, rightId)
    await first(left)
    let finished = false
    const pending = second(right).then(
      () => {
        finished = true
        return 'ok' as const
      },
      (error: { message?: string; code?: string }) => {
        finished = true
        return error
      },
    )
    await new Promise((resolve) => setTimeout(resolve, 250))
    expect(finished).toBe(false)
    await left.query('commit')
    const outcome = await pending
    if (outcome === 'ok') await right.query('commit')
    else await right.query('rollback')
    return outcome
  } finally {
    await left.end()
    await right.end()
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
  await client.query(`set local statement_timeout = '8s'`)
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
