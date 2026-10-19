import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

type Env = { url: string; anonKey: string; databaseUrl: string }
type Account = { username: string; userId: string; email: string }
type Sport = { id: string; name: string }
type Summary = {
  slug: string
  name: string
  description: string
  visibility: string
  member_count: number
  sports: Sport[]
}
type Member = { user_id: string; username: string; role: string }
type Detail = Summary & {
  my_role: string | null
  members: Member[] | null
  invitations: { id: string; username: string }[] | null
}

const volleyball = 'a1000000-0000-4000-8000-000000000001'
const beach = 'a1000000-0000-4000-8000-000000000002'
const futsal = 'a1000000-0000-4000-8000-000000000003'
const footvolley = 'a1000000-0000-4000-8000-000000000005'
const env = loadEnv()
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
let ana: Account
let bia: Account
let caio: Account
let davi: Account

beforeAll(async () => {
  ;[ana, bia, caio, davi] = await Promise.all([
    mustSignup('ana'),
    mustSignup('bia'),
    mustSignup('caio'),
    mustSignup('davi'),
  ])
}, 30_000)

afterAll(async () => {
  await admin(async (client) => {
    await client.query(
      `delete from public.communities
       where created_by in (
         select id from auth.users where email like $1
       )`,
      [`%${suffix}@padre.test`],
    )
    await client.query(`delete from auth.users where email like $1`, [
      `%${suffix}@padre.test`,
    ])
  })
})

describe('communities', () => {
  it('creates a public community whose creator is the only owner', async () => {
    const slug = await create(ana, 'Vôlei da Praia', 'public', [
      volleyball,
      beach,
    ])
    const detail = await read(ana, slug)
    expect(detail).toMatchObject({
      name: 'Vôlei da Praia',
      description: 'Quadra e areia',
      visibility: 'public',
      member_count: 1,
      my_role: 'owner',
    })
    expect(detail.sports.map((sport) => sport.name)).toEqual([
      'Vôlei',
      'Vôlei de areia',
    ])
    expect(detail.members).toEqual([
      { user_id: ana.userId, username: ana.username, role: 'owner' },
    ])
    expect(await ownerCount(slug)).toBe(1)
    const createdBy = await admin((client) =>
      client.query<{ created_by: string }>(
        `select created_by from public.communities where slug = $1`,
        [slug],
      ),
    )
    expect(createdBy.rows[0]?.created_by).toBe(ana.userId)
    expect(JSON.stringify(detail)).not.toContain('@')
    expect(JSON.stringify(detail)).not.toContain('Segredo')
  })

  it('lets another person discover and join without becoming friends or an admin', async () => {
    const slug = await create(ana, 'Pelada aberta', 'public', [volleyball])
    const discovered = await catalog(null)
    expect(discovered.communities.map((item) => item.slug)).toContain(slug)
    const preview = await read(null, slug)
    expect(preview.my_role).toBeNull()
    expect(preview.members).toBeNull()
    expect(preview.invitations).toBeNull()
    expect(JSON.stringify(preview)).not.toContain(ana.username)

    await join(bia, slug)
    const membership = await read(bia, slug)
    expect(membership.my_role).toBe('member')
    expect(membership.member_count).toBe(2)
    expect(membership.members?.map((member) => member.username).sort()).toEqual(
      [ana.username, bia.username].sort(),
    )
    expect(JSON.stringify(membership)).not.toContain('@')
    expect(JSON.stringify(membership)).not.toContain('Segredo')
    const friends = await admin((client) =>
      client.query<{ count: string }>(
        `select count(*)::text as count from public.friendships
         where requester_id = $1 or addressee_id = $1
            or requester_id = $2 or addressee_id = $2`,
        [ana.userId, bia.userId],
      ),
    )
    expect(friends.rows[0]?.count).toBe('0')

    await expect(
      setRole(bia, slug, bia.username, 'admin'),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(
      setRole(bia, slug, bia.username, 'owner'),
    ).rejects.toMatchObject({
      message: expect.stringContaining('invalid role'),
    })
    await expect(
      asUser(bia.userId, (client) =>
        client.query(
          `update public.community_members set role = 'admin' where user_id = $1`,
          [bia.userId],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' })
    expect(await roleOf(slug, bia.userId)).toBe('member')
  })

  it('lets the owner promote an admin who can invite but cannot remove the owner', async () => {
    const slug = await create(ana, 'Time da Ana', 'public', [futsal])
    await join(bia, slug)
    await join(caio, slug)
    expect(await setRole(ana, slug, bia.username, 'admin')).toMatchObject({
      role: 'admin',
    })
    const invited = await invite(bia, slug, davi.username)
    expect(invited.status).toBe('pending')
    const caller = await admin((client) =>
      client.query<{ inviter_id: string }>(
        `select inviter_id from public.community_invitations where id = $1`,
        [invited.id],
      ),
    )
    expect(caller.rows[0]?.inviter_id).toBe(bia.userId)
    await expect(remove(bia, slug, ana.username)).rejects.toMatchObject({
      code: '42501',
    })
    expect(await roleOf(slug, ana.userId)).toBe('owner')
    await expect(
      setRole(caio, slug, davi.username, 'admin'),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(invite(caio, slug, davi.username)).rejects.toMatchObject({
      code: '42501',
    })
    await expect(
      update(caio, slug, 'Nome novo', 'public'),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(
      setSports(caio, slug, [futsal, volleyball]),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(remove(bia, slug, caio.username)).resolves.toMatchObject({
      status: 'removed',
    })
    expect(await statusOf(slug, caio.userId)).toBe('removed')
    expect(await roleOf(slug, caio.userId)).toBe('member')
    await respond(davi, invited.id, 'accept')
    await setRole(ana, slug, davi.username, 'admin')
    await expect(remove(bia, slug, davi.username)).rejects.toMatchObject({
      code: '42501',
    })
    await expect(
      update(bia, slug, 'Time novo', 'private'),
    ).rejects.toMatchObject({ code: '42501' })
    expect(await update(bia, slug, 'Time novo', 'public')).toMatchObject({
      slug,
    })
    expect((await read(ana, slug)).name).toBe('Time novo')
  })

  it('hides a private community until the invited person accepts', async () => {
    const slug = await create(ana, 'Grupo fechado', 'private', [
      volleyball,
      futsal,
    ])
    const discovered = await catalog(bia)
    expect(discovered.communities.map((item) => item.slug)).not.toContain(slug)
    const missing = await readFailure(davi, 'comunidade-inexistente')
    const hidden = await readFailure(davi, slug)
    expect(hidden).toContain('not found')
    expect(hidden).toBe(missing)
    await expect(join(davi, slug)).rejects.toMatchObject({
      message: expect.stringContaining('not found'),
    })
    await expect(invite(caio, slug, davi.username)).rejects.toMatchObject({
      message: expect.stringContaining('not found'),
    })

    const invited = await invite(ana, slug, davi.username)
    await expect(respond(caio, invited.id, 'accept')).rejects.toMatchObject({
      code: '42501',
    })
    await expect(invite(ana, slug, davi.username)).rejects.toMatchObject({
      message: expect.stringContaining('invitation already pending'),
    })
    const mine = await invitations(davi)
    expect(mine.invitations).toEqual([
      expect.objectContaining({
        id: invited.id,
        slug,
        name: 'Grupo fechado',
        visibility: 'private',
      }),
    ])
    expect(JSON.stringify(mine)).not.toContain('@')
    expect(JSON.stringify(mine)).not.toContain('Segredo')
    await respond(davi, invited.id, 'accept')
    const detail = await read(davi, slug)
    expect(detail.my_role).toBe('member')
    expect(detail.members?.map((member) => member.username)).toContain(
      davi.username,
    )
    expect(await statusOf(slug, davi.userId)).toBe('active')
    const rows = await admin((client) =>
      client.query<{ count: string }>(
        `select count(*)::text as count from public.community_members
         where user_id = $1 and community_id = (
           select id from public.communities where slug = $2
         )`,
        [davi.userId, slug],
      ),
    )
    expect(rows.rows[0]?.count).toBe('1')
  })

  it('lets a member leave and keeps the owner in place', async () => {
    const slug = await create(ana, 'Saída livre', 'public', [volleyball])
    await join(bia, slug)
    await setRole(ana, slug, bia.username, 'admin')
    await leave(bia, slug)
    expect(await statusOf(slug, bia.userId)).toBe('left')
    expect(await roleOf(slug, bia.userId)).toBe('member')
    expect((await read(ana, slug)).members).toEqual([
      { user_id: ana.userId, username: ana.username, role: 'owner' },
    ])
    await expect(leave(ana, slug)).rejects.toMatchObject({
      message: expect.stringContaining('owner cannot leave'),
    })
    expect(await ownerCount(slug)).toBe(1)
    expect(await statusOf(slug, ana.userId)).toBe('active')
  })

  it('reopens a voluntary exit and requires an invite after removal', async () => {
    const slug = await create(ana, 'Porta de volta', 'public', [volleyball])
    await join(bia, slug)
    await leave(bia, slug)
    await join(bia, slug)
    expect(await statusOf(slug, bia.userId)).toBe('active')
    expect(await roleOf(slug, bia.userId)).toBe('member')
    expect(await membershipRows(slug, bia.userId)).toBe(1)

    await join(caio, slug)
    await setRole(ana, slug, caio.username, 'admin')
    await remove(ana, slug, caio.username)
    await expect(join(caio, slug)).rejects.toMatchObject({
      message: expect.stringContaining('reentry requires invitation'),
    })
    const invited = await invite(ana, slug, caio.username)
    await respond(caio, invited.id, 'accept')
    expect(await statusOf(slug, caio.userId)).toBe('active')
    expect(await roleOf(slug, caio.userId)).toBe('member')
    expect(await membershipRows(slug, caio.userId)).toBe(1)
    expect(await ownerCount(slug)).toBe(1)
  })

  it('keeps one sport row and refuses an unknown or newly inactive sport', async () => {
    const slug = await create(ana, 'Várias quadras', 'public', [
      volleyball,
      volleyball,
      futsal,
    ])
    expect((await read(ana, slug)).sports.map((sport) => sport.id)).toEqual([
      volleyball,
      futsal,
    ])
    await setSports(ana, slug, [futsal, volleyball, beach])
    expect(await sportRows(slug)).toBe(3)
    await expect(setSports(ana, slug, [])).rejects.toMatchObject({
      message: expect.stringContaining('sport required'),
    })
    await expect(
      setSports(ana, slug, ['a1000000-0000-4000-8000-000000000099']),
    ).rejects.toMatchObject({
      message: expect.stringContaining('unknown sport'),
    })
    await expect(
      admin((client) =>
        client.query(
          `insert into public.community_sports (community_id, sport_id)
           select id, $2 from public.communities where slug = $1`,
          [slug, volleyball],
        ),
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining('direct community writes'),
    })

    await setSports(ana, slug, [volleyball, footvolley])
    await admin((client) =>
      client.query(`update public.sports set active = false where id = $1`, [
        footvolley,
      ]),
    )
    try {
      const kept = await read(ana, slug)
      expect(kept.sports.map((sport) => sport.name)).toContain('Futevôlei')
      await setSports(ana, slug, [volleyball, footvolley])
      await setSports(ana, slug, [volleyball, futsal])
      await expect(
        setSports(ana, slug, [volleyball, footvolley]),
      ).rejects.toMatchObject({
        message: expect.stringContaining('unknown sport'),
      })
    } finally {
      await admin((client) =>
        client.query(`update public.sports set active = true where id = $1`, [
          footvolley,
        ]),
      )
    }
  })

  it('blocks anonymous changes, direct writes and private profile fields', async () => {
    const slug = await create(ana, 'Catálogo aberto', 'public', [beach])
    await expect(
      create(null, 'Anonima', 'public', [volleyball]),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(join(null, slug)).rejects.toMatchObject({ code: '42501' })
    await expect(invite(null, slug, bia.username)).rejects.toMatchObject({
      code: '42501',
    })
    await expect(
      asUser(
        null,
        (client) => client.query(`select * from public.communities`),
        'anon',
      ),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(
      asUser(ana.userId, (client) =>
        client.query(
          `insert into public.communities (slug, name, visibility, created_by)
           values ('forjada', 'Forjada', 'public', $1)`,
          [ana.userId],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' })
    const anonView = await catalog(null)
    const card = anonView.communities.find((item) => item.slug === slug)
    expect(card).toMatchObject({
      name: 'Catálogo aberto',
      member_count: 1,
    })
    expect(JSON.stringify(card)).not.toContain('@')
    expect(JSON.stringify(card)).not.toContain('Segredo')
    expect(card?.sports.map((sport) => sport.name)).toEqual(['Vôlei de areia'])
  })

  it('serializes concurrent creates and joins', async () => {
    const name = `Concorrente ${suffix.slice(0, 6)}`
    const created = await overlap(
      ana.userId,
      bia.userId,
      `select public.create_community($1, '', 'public', $2::uuid[]) as community`,
      [name, [volleyball]],
      [name, [volleyball]],
    )
    expect(created.overlapped).toBe(true)
    expect(created.second.ok).toBe(true)
    const firstSlug = created.held.rows[0]?.community.slug as string
    const secondSlug = created.second.ok
      ? (created.second.result.rows[0]?.community.slug as string)
      : ''
    expect(firstSlug).not.toBe(secondSlug)
    expect(await ownerCount(firstSlug)).toBe(1)
    expect(await ownerCount(secondSlug)).toBe(1)
    const slugs = await admin((client) =>
      client.query<{ count: string }>(
        `select count(*)::text as count from public.communities where slug = $1`,
        [firstSlug],
      ),
    )
    expect(slugs.rows[0]?.count).toBe('1')

    await join(caio, firstSlug)
    const raced = await overlap(
      caio.userId,
      caio.userId,
      `select public.join_public_community($1)`,
      [firstSlug],
      [firstSlug],
    )
    expect(raced.overlapped).toBe(true)
    expect(await membershipRows(firstSlug, caio.userId)).toBe(1)
    expect(await ownerCount(firstSlug)).toBe(1)

    const both = await overlap(
      bia.userId,
      davi.userId,
      `select public.join_public_community($1)`,
      [firstSlug],
      [firstSlug],
    )
    expect(both.overlapped).toBe(true)
    expect(both.second.ok).toBe(true)
    expect(await statusOf(firstSlug, bia.userId)).toBe('active')
    expect(await statusOf(firstSlug, davi.userId)).toBe('active')
    expect(await ownerCount(firstSlug)).toBe(1)
    expect(await membershipRows(firstSlug, bia.userId)).toBe(1)
  })

  it('limits repeated invitations from the same manager', async () => {
    const slug = await create(ana, 'Convites', 'private', [volleyball])
    await expect(invite(ana, slug, ana.username)).rejects.toMatchObject({
      message: expect.stringContaining('cannot invite yourself'),
    })
    await expect(invite(ana, slug, 'pessoa-inexistente')).rejects.toMatchObject(
      { message: expect.stringContaining('user not found') },
    )
    const first = await invite(ana, slug, bia.username)
    await respond(bia, first.id, 'decline')
    await expect(invite(ana, slug, bia.username)).rejects.toMatchObject({
      message: expect.stringContaining('invitation cooldown'),
    })
    await admin(async (client) => {
      await client.query('begin')
      await client.query(
        `select set_config('padre.community_write', 'on', true)`,
      )
      await client.query(
        `update public.community_invitations
         set responded_at = now() - interval '25 hours'
         where id = $1`,
        [first.id],
      )
      await client.query('commit')
    })
    await expect(invite(ana, slug, bia.username)).resolves.toMatchObject({
      status: 'pending',
    })
    await cancel(ana, (await invitations(bia)).invitations[0]!.id)

    const people = await insertPeople(30)
    for (const person of people) {
      await invite(ana, slug, person.username)
    }
    await expect(invite(ana, slug, caio.username)).rejects.toMatchObject({
      message: expect.stringContaining('too many pending invitations'),
    })
  })

  it('gives two communities with the same name different slugs', async () => {
    const first = await create(ana, 'Vôlei Âmbar', 'public', [volleyball])
    const second = await create(bia, 'Volei Ambar', 'public', [volleyball])
    expect(first.replace(/-\d+$/, '')).toBe('volei-ambar')
    expect(second.replace(/-\d+$/, '')).toBe('volei-ambar')
    expect(first).not.toBe(second)
    const mine = await asUser(ana.userId, (client) =>
      client.query<{ communities: { communities: Summary[] } }>(
        `select public.list_my_communities() as communities`,
      ),
    )
    expect(
      mine.rows[0]?.communities.communities.some(
        (item) => item.slug === first && item.visibility === 'public',
      ),
    ).toBe(true)
  })
})

const create = (
  account: Account | null,
  name: string,
  visibility: string,
  sports: string[],
) =>
  asUser(
    account?.userId ?? null,
    async (client) => {
      const created = await client.query<{ community: { slug: string } }>(
        `select public.create_community($1, 'Quadra e areia', $2, $3::uuid[]) as community`,
        [name, visibility, sports],
      )
      return created.rows[0]!.community.slug
    },
    account ? 'authenticated' : 'anon',
  )

function read(account: Account | null, slug: string) {
  return asUser(
    account?.userId ?? null,
    async (client) => {
      const result = await client.query<{ community: Detail }>(
        `select public.get_community($1) as community`,
        [slug],
      )
      return result.rows[0]!.community
    },
    account ? 'authenticated' : 'anon',
  )
}

async function readFailure(account: Account, slug: string) {
  try {
    await read(account, slug)
  } catch (error) {
    return error instanceof Error ? error.message : ''
  }
  throw new Error('a leitura deveria falhar')
}

function catalog(account: Account | null) {
  return asUser(
    account?.userId ?? null,
    async (client) => {
      const result = await client.query<{
        communities: { communities: Summary[] }
      }>(`select public.list_public_communities() as communities`)
      return result.rows[0]!.communities
    },
    account ? 'authenticated' : 'anon',
  )
}

function invitations(account: Account) {
  return asUser(account.userId, async (client) => {
    const result = await client.query<{
      invitations: {
        invitations: {
          id: string
          slug: string
          name: string
          visibility: string
        }[]
      }
    }>(`select public.list_my_community_invitations() as invitations`)
    return result.rows[0]!.invitations
  })
}

const join = (account: Account | null, slug: string) =>
  asUser(
    account?.userId ?? null,
    (client) => client.query(`select public.join_public_community($1)`, [slug]),
    account ? 'authenticated' : 'anon',
  )

const leave = (account: Account, slug: string) =>
  asUser(account.userId, (client) =>
    client.query(`select public.leave_community($1)`, [slug]),
  )

function invite(account: Account | null, slug: string, username: string) {
  return asUser(
    account?.userId ?? null,
    async (client) => {
      const result = await client.query<{
        invitation: { id: string; status: string }
      }>(`select public.invite_to_community($1, $2) as invitation`, [
        slug,
        username,
      ])
      return result.rows[0]!.invitation
    },
    account ? 'authenticated' : 'anon',
  )
}

const respond = (account: Account, invitationId: string, action: string) =>
  asUser(account.userId, (client) =>
    client.query(`select public.respond_to_community_invitation($1, $2)`, [
      invitationId,
      action,
    ]),
  )

const cancel = (account: Account, invitationId: string) =>
  asUser(account.userId, (client) =>
    client.query(`select public.cancel_community_invitation($1)`, [
      invitationId,
    ]),
  )

function setRole(
  account: Account,
  slug: string,
  username: string,
  role: string,
) {
  return asUser(account.userId, async (client) => {
    const result = await client.query<{ change: { role: string } }>(
      `select public.set_community_member_role($1, $2, $3) as change`,
      [slug, username, role],
    )
    return result.rows[0]!.change
  })
}

function remove(account: Account, slug: string, username: string) {
  return asUser(account.userId, async (client) => {
    const result = await client.query<{ change: { status: string } }>(
      `select public.remove_community_member($1, $2) as change`,
      [slug, username],
    )
    return result.rows[0]!.change
  })
}

function update(
  account: Account,
  slug: string,
  name: string,
  visibility: string,
) {
  return asUser(account.userId, async (client) => {
    const result = await client.query<{ community: { slug: string } }>(
      `select public.update_community($1, $2, '', $3) as community`,
      [slug, name, visibility],
    )
    return result.rows[0]!.community
  })
}

function setSports(account: Account, slug: string, sports: string[]) {
  return asUser(account.userId, (client) =>
    client.query(`select public.set_community_sports($1, $2::uuid[])`, [
      slug,
      sports,
    ]),
  )
}

async function ownerCount(slug: string) {
  const result = await admin((client) =>
    client.query<{ count: string }>(
      `select count(*)::text as count from public.community_members
       where community_id = (select id from public.communities where slug = $1)
         and role = 'owner' and status = 'active'`,
      [slug],
    ),
  )
  return Number(result.rows[0]?.count ?? 0)
}

async function roleOf(slug: string, userId: string) {
  const result = await admin((client) =>
    client.query<{ role: string }>(
      `select role from public.community_members
       where user_id = $2 and community_id = (
         select id from public.communities where slug = $1
       )`,
      [slug, userId],
    ),
  )
  return result.rows[0]?.role
}

async function statusOf(slug: string, userId: string) {
  const result = await admin((client) =>
    client.query<{ status: string }>(
      `select status from public.community_members
       where user_id = $2 and community_id = (
         select id from public.communities where slug = $1
       )`,
      [slug, userId],
    ),
  )
  return result.rows[0]?.status
}

async function membershipRows(slug: string, userId: string) {
  const result = await admin((client) =>
    client.query<{ count: string }>(
      `select count(*)::text as count from public.community_members
       where user_id = $2 and community_id = (
         select id from public.communities where slug = $1
       )`,
      [slug, userId],
    ),
  )
  return Number(result.rows[0]?.count ?? 0)
}

async function sportRows(slug: string) {
  const result = await admin((client) =>
    client.query<{ count: string }>(
      `select count(*)::text as count from public.community_sports
       where community_id = (select id from public.communities where slug = $1)`,
      [slug],
    ),
  )
  return Number(result.rows[0]?.count ?? 0)
}

async function insertPeople(count: number) {
  return admin(async (client) => {
    const people: { username: string }[] = []
    for (let index = 0; index < count; index += 1) {
      const username = `u${index.toString(36)}${suffix}`
        .replace(/[^a-z0-9_]/g, '')
        .slice(0, 30)
      await client.query(
        `insert into auth.users (id, email, raw_user_meta_data)
         values (gen_random_uuid(), $1, jsonb_build_object('username', $2::text, 'display_name', $3::text))`,
        [`cap${index}-${suffix}@padre.test`, username, `Segredo ${index}`],
      )
      people.push({ username })
    }
    return people
  })
}

async function overlap(
  firstUser: string,
  secondUser: string,
  sql: string,
  firstParams: unknown[],
  secondParams: unknown[],
) {
  const first = new Client({ connectionString: env.databaseUrl })
  const second = new Client({ connectionString: env.databaseUrl })
  await first.connect()
  await second.connect()
  try {
    await first.query('begin')
    await second.query('begin')
    await assume(first, firstUser)
    await assume(second, secondUser)
    const held = await first.query<{ community: { slug: string } }>(
      sql,
      firstParams,
    )
    let settled = false
    const waiting = second
      .query<{ community: { slug: string } }>(sql, secondParams)
      .then(
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
    return { overlapped, held, second: secondOutcome }
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
