import { readFileSync } from 'node:fs'

import { expect, test, type Page } from '@playwright/test'
import { Client } from 'pg'

test('confirmed lineups become teammate and opponent records', async ({
  browser,
}) => {
  test.setTimeout(240_000)
  const ana = createAccount('ana')
  const bia = createAccount('bia')
  const caio = createAccount('caio')
  const davi = createAccount('davi')
  const title = `Duplas ${ana.username.slice(-4)}`
  const contexts = await Promise.all(
    [0, 1, 2, 3].map(() =>
      browser.newContext({ viewport: { width: 390, height: 844 } }),
    ),
  )
  const [pageA, pageB, pageC, pageD] = await Promise.all(
    contexts.map((context) => context.newPage()),
  )

  try {
    await signup(pageA!, ana, 'Ana')
    const link = await createBeachMeetup(pageA!, title)
    const meetupPath = new URL(pageA!.url()).pathname
    for (const guest of [
      { page: pageB!, account: bia, name: 'Bia' },
      { page: pageC!, account: caio, name: 'Caio' },
      { page: pageD!, account: davi, name: 'Davi' },
    ]) {
      await signup(guest.page, guest.account, guest.name)
      await guest.page.goto(link)
      await guest.page
        .getByRole('button', { name: 'Confirmar presença' })
        .click()
      await expect(guest.page.getByText('Presença confirmada.')).toBeVisible()
    }

    const meetupId = meetupPath.split('/').at(-1) ?? ''
    await startMeetup(meetupId)
    await pageA!.goto(meetupPath)
    await recordMatch(
      pageA!,
      [
        [ana.username, 'Azul'],
        [bia.username, 'Azul'],
        [caio.username, 'Verde'],
        [davi.username, 'Verde'],
      ],
      ['21', '15', '21', '18'],
    )
    await pageB!.goto(meetupPath)
    await pageB!.getByRole('button', { name: 'Confirmar placar' }).click()
    await pageC!.goto(meetupPath)
    await pageC!.getByRole('button', { name: 'Confirmar placar' }).click()
    await expect(pageC!.getByText('Resultado definitivo')).toBeVisible()

    await pageA!.goto(meetupPath)
    await recordMatch(
      pageA!,
      [
        [ana.username, 'Azul'],
        [caio.username, 'Azul'],
        [bia.username, 'Verde'],
        [davi.username, 'Verde'],
      ],
      ['12', '21', '16', '21'],
    )
    await pageA!.getByRole('button', { name: 'Confirmar placar' }).click()
    await pageB!.goto(meetupPath)
    await pageB!.getByRole('button', { name: 'Confirmar placar' }).click()
    await expect(pageB!.getByText('Resultado definitivo').nth(1)).toBeVisible()

    await pageA!.goto('/perfil')
    const relations = pageA!.getByRole('region', {
      name: 'Companheiros e adversários',
    })
    await expect(
      relations.getByRole('heading', { name: 'Vôlei de areia' }),
    ).toBeVisible()
    await expect(
      definition(pageA!, 'Companheiro mais frequente'),
    ).toContainText(`${bia.username} — 1 partida juntos`)
    await expect(definition(pageA!, 'Adversário mais frequente')).toContainText(
      `${davi.username} — 2 confrontos`,
    )
    await expect(relations.getByText('Amostra insuficiente')).toHaveCount(2)
    await relations
      .getByRole('button', { name: new RegExp(davi.username) })
      .click()
    await expect(definition(pageA!, 'Confrontos')).toHaveText('2')
    await expect(definition(pageA!, 'Vitórias')).toHaveText('1')
    await expect(definition(pageA!, 'Derrotas')).toHaveText('1')
    await expect(relations.getByText(ana.email)).toHaveCount(0)

    await pageB!.goto(meetupPath)
    await expect(pageB!.getByText('entre os confirmados')).toBeVisible()
    await pageB!
      .getByLabel('Jogador', { exact: true })
      .selectOption(ana.username)
    const meetupRelations = pageB!.getByRole('region', {
      name: 'Companheiros e adversários',
    })
    await expect(
      meetupRelations.getByRole('button', { name: new RegExp(davi.username) }),
    ).toContainText('2 confrontos')
    await expect(pageB!.getByText(ana.email)).toHaveCount(0)
    expect(meetupId).not.toBe('')
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
  }
})

function definition(page: Page, label: string) {
  return page
    .getByRole('region', { name: 'Companheiros e adversários' })
    .locator(`div:has(> dt:text-is("${label}"))`)
    .locator('dd')
}

async function recordMatch(
  page: Page,
  assignments: [string, string][],
  scores: [string, string, string, string],
) {
  await page.getByRole('button', { name: 'Nova partida' }).click()
  await expect(page.getByText('Partida criada.')).toBeVisible()
  await page.getByLabel('Nome da equipe 1').fill('Azul')
  await page.getByLabel('Nome da equipe 2').fill('Verde')
  for (const [username, side] of assignments) {
    await page
      .getByRole('group', { name: username })
      .getByRole('radio', { name: side })
      .check()
  }
  await page.getByRole('button', { name: 'Salvar equipes' }).click()
  await expect(page.getByText('Equipes salvas.')).toBeVisible()
  await page.getByLabel('Pontos de Azul no set 1').fill(scores[0])
  await page.getByLabel('Pontos de Verde no set 1').fill(scores[1])
  await page.getByRole('button', { name: 'Adicionar set' }).click()
  await page.getByLabel('Pontos de Azul no set 2').fill(scores[2])
  await page.getByLabel('Pontos de Verde no set 2').fill(scores[3])
  await page.getByRole('button', { name: 'Salvar placar' }).click()
  await expect(page.getByText('Placar salvo.')).toBeVisible()
  await page.getByRole('button', { name: 'Enviar para confirmação' }).click()
  await expect(page.getByText('Placar enviado para confirmação.')).toBeVisible()
}

async function createBeachMeetup(page: Page, title: string) {
  await page.goto('/encontros/novo')
  await page.getByLabel('Modalidade').selectOption({ label: 'Vôlei de areia' })
  await page.getByLabel('Formato').selectOption({ label: 'Vôlei de areia 2x2' })
  await page.getByLabel('Título').fill(title)
  await page.getByLabel('Local').fill('Areia do clube')
  await page.getByLabel('Capacidade, incluindo quem organiza').fill('4')
  await page.getByRole('button', { name: 'Criar encontro' }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  await page.getByRole('button', { name: 'Gerar link' }).click()
  await page.getByRole('button', { name: 'Confirmar novo link' }).click()
  await expect(page.getByText('Link gerado.')).toBeVisible()
  return page.getByLabel('Link do convite').inputValue()
}

async function startMeetup(meetupId: string) {
  const client = await database()
  try {
    await client.query('begin')
    await client.query(`select set_config('padre.meetup_write', 'on', true)`)
    await client.query(
      `update public.meetups
       set starts_at = now() - interval '1 hour',
           ends_at = now() + interval '1 hour'
       where id = $1`,
      [meetupId],
    )
    await client.query('commit')
  } finally {
    await client.end()
  }
}

async function database() {
  const text = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  const databaseUrl = text
    .split('\n')
    .find((line) => line.startsWith('DATABASE_URL='))
    ?.slice('DATABASE_URL='.length)
  if (!databaseUrl) throw new Error('DATABASE_URL ausente.')
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  return client
}

function createAccount(label: string) {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  return {
    email: `${label}-${suffix}@padre.test`,
    username: `${label}${suffix}`.replace(/[^a-z0-9_]/g, '').slice(0, 30),
    password: 'senha-segura',
  }
}

async function signup(
  page: Page,
  account: { email: string; username: string; password: string },
  name: string,
) {
  await page.goto('/cadastrar')
  await page.getByLabel('Nome', { exact: true }).fill(name)
  await page.getByLabel('Nome de usuário').fill(account.username)
  await page.getByLabel('E-mail').fill(account.email)
  await page.getByLabel('Senha').fill(account.password)
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await expect(page.getByRole('heading', { name: 'Meu perfil' })).toBeVisible()
}
