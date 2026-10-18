import { readFileSync } from 'node:fs'

import { expect, test, type Page } from '@playwright/test'
import { Client } from 'pg'

test('four players confirm a 2x2 and keep that history after a second match', async ({
  browser,
}) => {
  test.setTimeout(240_000)
  const ana = createAccount('ana')
  const bia = createAccount('bia')
  const caio = createAccount('caio')
  const davi = createAccount('davi')
  const title = `Areia ${ana.username.slice(-4)}`
  const contexts = await Promise.all(
    [0, 1, 2, 3].map(() =>
      browser.newContext({ viewport: { width: 390, height: 844 } }),
    ),
  )
  const [pageA, pageB, pageC, pageD] = await Promise.all(
    contexts.map((context) => context.newPage()),
  )
  const pages = [
    { page: pageB!, account: bia, name: 'Bia' },
    { page: pageC!, account: caio, name: 'Caio' },
    { page: pageD!, account: davi, name: 'Davi' },
  ]

  try {
    await signup(pageA!, ana, 'Ana')
    const link = await createBeachMeetup(pageA!, title)
    const meetupPath = new URL(pageA!.url()).pathname
    for (const guest of pages) {
      await signup(guest.page, guest.account, guest.name)
      await guest.page.goto(link)
      await guest.page
        .getByRole('button', { name: 'Confirmar presença' })
        .click()
      await expect(guest.page.getByText('Presença confirmada.')).toBeVisible()
    }

    const meetupId = new URL(pageA!.url()).pathname.split('/').at(-1) ?? ''
    await startMeetup(meetupId)
    await pageA!.reload()
    await expect(pageA!.getByRole('heading', { name: title })).toBeVisible()

    await pageA!.getByRole('button', { name: 'Nova partida' }).click()
    await expect(pageA!.getByText('Partida criada.')).toBeVisible()
    await pageA!.getByLabel('Nome da equipe 1').fill('Azul')
    await pageA!.getByLabel('Nome da equipe 2').fill('Verde')
    await assign(pageA!, ana.username, 'Azul')
    await assign(pageA!, bia.username, 'Azul')
    await assign(pageA!, caio.username, 'Verde')
    await assign(pageA!, davi.username, 'Verde')
    await pageA!.getByRole('button', { name: 'Salvar equipes' }).click()
    await expect(pageA!.getByText('Equipes salvas.')).toBeVisible()

    await pageA!.getByLabel('Pontos de Azul no set 1').fill('21')
    await pageA!.getByLabel('Pontos de Verde no set 1').fill('15')
    await pageA!.getByRole('button', { name: 'Adicionar set' }).click()
    await pageA!.getByLabel('Pontos de Azul no set 2').fill('21')
    await pageA!.getByLabel('Pontos de Verde no set 2').fill('18')
    await pageA!.getByRole('button', { name: 'Salvar placar' }).click()
    await expect(pageA!.getByText('Placar salvo.')).toBeVisible()
    await pageA!
      .getByRole('button', { name: 'Enviar para confirmação' })
      .click()
    await expect(
      pageA!.getByText('Placar enviado para confirmação.'),
    ).toBeVisible()
    await expect(
      pageA!.getByText('Resultado ainda não é definitivo'),
    ).toBeVisible()

    await pageB!.goto(meetupPath)
    await pageB!.getByRole('button', { name: 'Confirmar placar' }).click()
    await expect(pageB!.getByText('Confirmação registrada.')).toBeVisible()
    await pageC!.goto(meetupPath)
    await pageC!.getByRole('button', { name: 'Confirmar placar' }).click()
    await expect(pageC!.getByText('Confirmação registrada.')).toBeVisible()

    for (const page of [pageA!, pageB!, pageC!, pageD!]) {
      await page.goto(meetupPath)
      await expect(page.getByText('Resultado definitivo')).toBeVisible()
      await expect(page.getByText('Azul venceu')).toBeVisible()
    }

    await pageA!.getByRole('button', { name: 'Nova partida' }).click()
    await expect(pageA!.getByText('Partida criada.')).toBeVisible()
    await pageA!.getByLabel('Nome da equipe 1').fill('Azul')
    await pageA!.getByLabel('Nome da equipe 2').fill('Verde')
    await assign(pageA!, ana.username, 'Azul')
    await assign(pageA!, caio.username, 'Azul')
    await assign(pageA!, bia.username, 'Verde')
    await assign(pageA!, davi.username, 'Verde')
    await pageA!.getByRole('button', { name: 'Salvar equipes' }).click()
    await expect(pageA!.getByText('Equipes salvas.')).toBeVisible()

    await pageA!.getByText('Histórico da partida 1').click()
    await expect(pageA!.getByText('A partida ficou confirmada')).toBeVisible()
    await expect(pageA!.getByText('21–15, 21–18')).toBeVisible()
    await expect(pageA!.getByText('Partida 2 · Rascunho')).toBeVisible()
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
  }
})

async function assign(page: Page, username: string, side: string) {
  await page
    .getByRole('group', { name: username })
    .getByRole('radio', { name: side })
    .check()
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
  const link = await page.getByLabel('Link do convite').inputValue()
  expect(link).toContain('/convite/')
  return link
}

async function startMeetup(meetupId: string) {
  const text = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  const databaseUrl = text
    .split('\n')
    .find((line) => line.startsWith('DATABASE_URL='))
    ?.slice('DATABASE_URL='.length)
  if (!databaseUrl) throw new Error('DATABASE_URL ausente.')
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
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
