import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

type Env = { url: string; anonKey: string; databaseUrl: string }
type Account = { username: string; userId: string }
type Format = { formatId: string; ruleId: string }
type ChatMessage = {
  id: string
  author_username: string
  body: string
  created_at: string
  deleted: boolean
  meetup: {
    id: string
    title: string
    status: string
    open_spots: number
  } | null
}

const beachSport = 'a1000000-0000-4000-8000-000000000002'
const env = loadEnv()
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
let ana: Account
let bia: Account
let caio: Account
let davi: Account
let eva: Account
let nina: Account
let beach: Format
let slug = ''
let privateSlug = ''
let otherSlug = ''

beforeAll(async () => {
  ;[ana, bia, caio, davi, eva, nina] = await Promise.all([
    mustSignup('ana'),
    mustSignup('bia'),
    mustSignup('caio'),
    mustSignup('davi'),
    mustSignup('eva'),
    mustSignup('nina'),
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
  slug = await createCommunity(ana, 'public')
  for (const person of [bia, caio, eva, nina]) {
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
  privateSlug = await createCommunity(ana, 'private')
  otherSlug = await createCommunity(davi, 'public')
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

describe('community messages', () => {
  it('lets active members talk and hides the chat from everyone else', async () => {
    const first = await send(ana, slug, 'Primeira')
    expect(first.author_username).toBe(ana.username)
    expect(await texts(bia, slug)).toEqual(['Primeira'])
    expect(await texts(caio, slug)).toEqual(['Primeira'])
    await expect(list(davi, slug)).rejects.toMatchObject({ code: '42501' })
    await expect(send(davi, slug, 'Fora')).rejects.toMatchObject({
      code: '42501',
    })
    await expect(list(null, slug)).rejects.toMatchObject({ code: '42501' })

    const requested = await asUser(davi.userId, (client) =>
      client.query<{ id: string }>(
        `select id from public.request_friendship($1)`,
        [ana.username],
      ),
    )
    await asUser(ana.userId, (client) =>
      client.query(`select public.respond_to_friendship($1, 'accept')`, [
        requested.rows[0]!.id,
      ]),
    )
    await expect(list(davi, slug)).rejects.toMatchObject({ code: '42501' })

    await send(bia, slug, 'Segunda')
    await send(caio, slug, 'Terceira')
    expect(await texts(ana, slug)).toEqual(['Primeira', 'Segunda', 'Terceira'])
  })

  it('pages backward without duplicating messages', async () => {
    const page = await list(ana, slug, null, null, 2)
    expect(page.has_older).toBe(true)
    expect(page.messages.map((message) => message.body)).toEqual([
      'Segunda',
      'Terceira',
    ])
    const oldest = page.messages[0]!
    const older = await list(ana, slug, oldest.created_at, oldest.id, 2)
    expect(older.messages.map((message) => message.body)).toEqual(['Primeira'])
    const ids = [...older.messages, ...page.messages].map(
      (message) => message.id,
    )
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('protects author, time and direct writes', async () => {
    const message = (await list(ana, slug, null, null, 1)).messages[0]!
    await expect(
      asUser(ana.userId, (client) =>
        client.query(
          `update public.community_messages
           set author_id = $2, created_at = now()
           where id = $1`,
          [message.id, bia.userId],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(
      admin(async (client) => {
        await client.query('begin')
        await client.query(
          `select set_config('padre.message_write', 'on', true)`,
        )
        await client.query(
          `update public.community_messages
           set author_id = $2
           where id = $1`,
          [message.id, bia.userId],
        )
      }),
    ).rejects.toThrow(/message identity is protected/)
    const kept = await admin((client) =>
      client.query<{ author_id: string }>(
        `select author_id::text from public.community_messages where id = $1`,
        [message.id],
      ),
    )
    expect(kept.rows[0]?.author_id).not.toBe(bia.userId)
  })

  it('lets the author and the managers remove a message without keeping the text', async () => {
    const own = await send(caio, slug, 'Minha')
    await asUser(caio.userId, (client) =>
      client.query(`select public.delete_community_message($1)`, [own.id]),
    )
    expect((await byId(ana, own.id)).body).toBe('')
    expect((await byId(ana, own.id)).deleted).toBe(true)

    const foreign = await send(caio, slug, 'Deles')
    const firstId = (await list(ana, slug, null, null, 50)).messages.find(
      (message) => message.body === 'Primeira',
    )!.id
    await expect(
      asUser(caio.userId, (client) =>
        client.query(`select public.delete_community_message($1)`, [firstId]),
      ),
    ).rejects.toMatchObject({ code: '42501' })
    await asUser(bia.userId, (client) =>
      client.query(`select public.delete_community_message($1)`, [foreign.id]),
    )
    expect((await byId(ana, foreign.id)).body).toBe('')

    const moderated = await send(nina, slug, 'Moderar')
    await expect(
      asUser(davi.userId, (client) =>
        client.query(`select public.delete_community_message($1)`, [
          moderated.id,
        ]),
      ),
    ).rejects.toMatchObject({ code: '42501' })
    await asUser(ana.userId, (client) =>
      client.query(`select public.delete_community_message($1)`, [
        moderated.id,
      ]),
    )
    const stored = await admin((client) =>
      client.query<{ body: string }>(
        `select body from public.community_messages where id = $1`,
        [moderated.id],
      ),
    )
    expect(stored.rows[0]?.body).toBe('')
    expect((await byId(bia, moderated.id)).deleted).toBe(true)
  })

  it('drops chat access when someone leaves or is removed and keeps the history', async () => {
    const before = await texts(ana, slug)
    await asUser(caio.userId, (client) =>
      client.query(`select public.leave_community($1)`, [slug]),
    )
    await expect(list(caio, slug)).rejects.toMatchObject({ code: '42501' })
    await expect(send(caio, slug, 'Voltei')).rejects.toMatchObject({
      code: '42501',
    })
    expect(await texts(ana, slug)).toEqual(before)

    await asUser(ana.userId, (client) =>
      client.query(`select public.remove_community_member($1, $2)`, [
        slug,
        nina.username,
      ]),
    )
    await expect(list(nina, slug)).rejects.toMatchObject({ code: '42501' })
    expect((await texts(bia, slug)).length).toBeGreaterThan(0)
  })

  it('keeps private and public chats closed to outsiders and pending invites', async () => {
    await send(ana, privateSlug, 'Segredo')
    await expect(list(davi, privateSlug)).rejects.toMatchObject({
      code: 'P0001',
    })
    await expect(send(davi, privateSlug, 'Oi')).rejects.toMatchObject({
      code: 'P0001',
    })
    await asUser(ana.userId, (client) =>
      client.query(`select public.invite_to_community($1, $2)`, [
        privateSlug,
        davi.username,
      ]),
    )
    await expect(list(davi, privateSlug)).rejects.toMatchObject({
      code: 'P0001',
    })
    await expect(list(davi, slug)).rejects.toMatchObject({ code: '42501' })
    expect(await texts(ana, privateSlug)).toEqual(['Segredo'])
  })

  it('rejects empty, huge and abusive sends, including concurrent ones', async () => {
    await expect(send(ana, slug, '   \n\t  ')).rejects.toThrow(/empty message/)
    await expect(send(ana, slug, 'a'.repeat(2001))).rejects.toThrow(
      /message is too long/,
    )
    await expect(send(ana, slug, 'oi\u0007')).rejects.toThrow(/invalid message/)

    const gabi = await mustSignup('gabi')
    await asUser(gabi.userId, (client) =>
      client.query(`select public.join_public_community($1)`, [slug]),
    )
    for (let index = 0; index < 5; index += 1) {
      await send(gabi, slug, `rajada-${index}`)
    }
    await expect(send(gabi, slug, 'rajada-extra')).rejects.toThrow(
      /too many messages/,
    )

    const hugo = await mustSignup('hugo')
    await asUser(hugo.userId, (client) =>
      client.query(`select public.join_public_community($1)`, [slug]),
    )
    for (let index = 0; index < 4; index += 1) {
      await send(hugo, slug, `junto-${index}`)
    }
    await overlap(
      hugo.userId,
      async (client) => {
        await client.query(
          `select public.send_community_message($1, $2, null, $3)`,
          [slug, 'junto-five', crypto.randomUUID()],
        )
      },
      async (client) => {
        await client.query(
          `select public.send_community_message($1, $2, null, $3)`,
          [slug, 'junto-six', crypto.randomUUID()],
        )
      },
    )
  })

  it('returns the same message when the request id is repeated', async () => {
    const requestId = crypto.randomUUID()
    const first = await asUser(ana.userId, (client) =>
      client.query<{ message: ChatMessage }>(
        `select public.send_community_message($1, 'Igual', null, $2) as message`,
        [slug, requestId],
      ),
    )
    const second = await asUser(ana.userId, (client) =>
      client.query<{ message: ChatMessage }>(
        `select public.send_community_message($1, 'Igual', null, $2) as message`,
        [slug, requestId],
      ),
    )
    expect(second.rows[0]?.message.id).toBe(first.rows[0]?.message.id)
    const copies = await admin((client) =>
      client.query(
        `select 1 from public.community_messages
         where client_request_id = $1`,
        [requestId],
      ),
    )
    expect(copies.rowCount).toBe(1)
    const another = await send(ana, slug, 'Igual')
    expect(another.id).not.toBe(first.rows[0]?.message.id)
  })

  it('shares only a meetup from the same community and keeps its live status', async () => {
    const meetupId = await communityMeetup(ana, slug, 'Coletivo')
    const shared = await asUser(ana.userId, (client) =>
      client.query<{ message: ChatMessage }>(
        `select public.send_community_message($1, 'Bora', $2, $3) as message`,
        [slug, meetupId, crypto.randomUUID()],
      ),
    )
    expect(shared.rows[0]?.message.meetup).toMatchObject({
      id: meetupId,
      title: 'Coletivo',
      status: 'scheduled',
    })

    const privateMeetup = await asUser(ana.userId, (client) =>
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
    await expect(
      asUser(ana.userId, (client) =>
        client.query(`select public.send_community_message($1, '', $2, $3)`, [
          slug,
          privateMeetup.rows[0]!.id,
          crypto.randomUUID(),
        ]),
      ),
    ).rejects.toThrow(/meetup is not in community/)

    const otherMeetup = await communityMeetup(davi, otherSlug, 'Outro grupo')
    await expect(
      asUser(ana.userId, (client) =>
        client.query(`select public.send_community_message($1, '', $2, $3)`, [
          slug,
          otherMeetup,
          crypto.randomUUID(),
        ]),
      ),
    ).rejects.toThrow(/meetup is not in community/)

    await asUser(ana.userId, (client) =>
      client.query(`select public.cancel_meetup($1)`, [meetupId]),
    )
    const after = await byId(bia, shared.rows[0]!.message.id)
    expect(after.meetup?.status).toBe('cancelled')
  })

  it('does not let chat block account deletion or confirmed sports history', async () => {
    const quiet = await mustSignup('quiet')
    const quietSlug = slug
    await asUser(quiet.userId, (client) =>
      client.query(`select public.join_public_community($1)`, [quietSlug]),
    )
    await send(quiet, quietSlug, 'Só conversa')
    await admin(async (client) => {
      await client.query('begin')
      try {
        await client.query(`delete from auth.users where id = $1`, [
          quiet.userId,
        ])
        const profile = await client.query(
          `select 1 from public.profiles where id = $1`,
          [quiet.userId],
        )
        const messages = await client.query(
          `select 1 from public.community_messages where author_id = $1`,
          [quiet.userId],
        )
        expect(profile.rowCount).toBe(0)
        expect(messages.rowCount).toBe(0)
      } finally {
        await client.query('rollback')
      }
    })

    const meetupId = await communityMeetup(ana, slug, 'Histórico')
    for (const person of [bia, eva]) {
      await asUser(person.userId, (client) =>
        client.query(`select public.join_community_meetup($1)`, [meetupId]),
      )
    }
    await asUser(caio.userId, (client) =>
      client.query(`select public.join_public_community($1)`, [slug]),
    )
    await asUser(caio.userId, (client) =>
      client.query(`select public.join_community_meetup($1)`, [meetupId]),
    )
    await shift(meetupId)
    const matchId = await play(meetupId)
    await send(eva, slug, 'Joguei')
    await expect(
      admin(async (client) => {
        await client.query('begin')
        try {
          await client.query(`delete from auth.users where id = $1`, [
            eva.userId,
          ])
        } finally {
          await client.query('rollback')
        }
      }),
    ).rejects.toThrow(/escalação/)
    const stats = await admin((client) =>
      client.query(
        `select 1 from public.match_player_statistics
         where match_id = $1 and user_id = $2`,
        [matchId, eva.userId],
      ),
    )
    expect(stats.rowCount).toBe(1)
    expect((await texts(ana, slug)).includes('Joguei')).toBe(true)
  })
})

async function texts(person: Account, communitySlug: string) {
  const page = await list(person, communitySlug, null, null, 50)
  return page.messages
    .filter((message) => !message.deleted)
    .map((message) => message.body)
}

async function byId(person: Account, id: string) {
  const page = await list(person, slug, null, null, 50)
  const privatePage =
    person.userId === ana.userId
      ? await list(person, privateSlug, null, null, 50)
      : null
  return [...page.messages, ...(privatePage?.messages ?? [])].find(
    (message) => message.id === id,
  )!
}

async function list(
  person: Account | null,
  communitySlug: string,
  beforeAt: string | null = null,
  beforeId: string | null = null,
  pageLimit = 50,
) {
  const run = (client: Client) =>
    client.query<{ page: { has_older: boolean; messages: ChatMessage[] } }>(
      `select public.list_community_messages($1, $2, $3, $4) as page`,
      [communitySlug, beforeAt, beforeId, pageLimit],
    )
  const result = person
    ? await asUser(person.userId, run)
    : await asUser(null, run, 'anon')
  return result.rows[0]!.page
}

async function send(person: Account, communitySlug: string, body: string) {
  const result = await asUser(person.userId, (client) =>
    client.query<{ message: ChatMessage }>(
      `select public.send_community_message($1, $2, null, $3) as message`,
      [communitySlug, body, crypto.randomUUID()],
    ),
  )
  return result.rows[0]!.message
}

async function createCommunity(
  person: Account,
  visibility: 'public' | 'private',
) {
  const created = await asUser(person.userId, (client) =>
    client.query<{ community: { slug: string } }>(
      `select public.create_community($1, 'Quadra', $2, $3::uuid[]) as community`,
      [`Grupo ${person.username}`, visibility, [beachSport]],
    ),
  )
  return created.rows[0]!.community.slug
}

async function communityMeetup(
  person: Account,
  communitySlug: string,
  title: string,
) {
  const created = await asUser(person.userId, (client) =>
    client.query<{ id: string }>(
      `select public.create_community_meetup(
         $1, $2, $3, $4, '',
         now() + interval '3 days',
         now() + interval '3 days 2 hours',
         'America/Sao_Paulo', 'Quadra', '', 8
       ) as id`,
      [communitySlug, beach.formatId, beach.ruleId, title],
    ),
  )
  return created.rows[0]!.id
}

async function shift(id: string) {
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
  const matchId = created.rows[0]!.id
  await asUser(ana.userId, (client) =>
    client.query(
      `select public.set_match_lineup($1, 'Azul', $2, 'Verde', $3)`,
      [matchId, [ana.userId, bia.userId], [caio.userId, eva.userId]],
    ),
  )
  await asUser(ana.userId, (client) =>
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
  await asUser(ana.userId, (client) =>
    client.query(`select public.submit_match($1)`, [matchId]),
  )
  await asUser(ana.userId, (client) =>
    client.query(`select public.confirm_match($1)`, [matchId]),
  )
  await asUser(caio.userId, (client) =>
    client.query(`select public.confirm_match($1)`, [matchId]),
  )
  return matchId
}

async function overlap(
  userId: string,
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
    await assume(left, userId)
    await assume(right, userId)
    await first(left)
    let finished = false
    const pending = second(right).then(
      () => {
        finished = true
      },
      (error: unknown) => {
        finished = true
        throw error
      },
    )
    await new Promise((resolve) => setTimeout(resolve, 250))
    expect(finished).toBe(false)
    await left.query('commit')
    await expect(pending).rejects.toThrow(/too many messages/)
    await right.query('rollback')
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
