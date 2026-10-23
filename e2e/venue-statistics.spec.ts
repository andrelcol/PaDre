import { readFileSync } from 'node:fs'

import { expect, test, type Page } from '@playwright/test'
import { Client } from 'pg'

const mobile = { width: 390, height: 844 }
const desktop = { width: 1280, height: 800 }

test('players compare confirmed results across two venues', async ({
  browser,
}) => {
  test.setTimeout(420_000)
  const ana = createAccount('ana')
  const bia = createAccount('bia')
  const caio = createAccount('caio')
  const davi = createAccount('davi')
  const eva = createAccount('eva')
  const central = `Central ${ana.username.slice(-4)}`
  const arena = `Arena ${ana.username.slice(-4)}`
  const title = `Areia ${ana.username.slice(-4)}`
  const contexts = await Promise.all(
    [0, 1, 2, 3].map(() => browser.newContext({ viewport: mobile })),
  )
  const [pageA, pageB, pageC, pageD] = await Promise.all(
    contexts.map((context) => context.newPage()),
  )
  const desktopContext = await browser.newContext({ viewport: desktop })
  const outsider = await browser.newContext({ viewport: mobile })

  try {
    await signup(pageA!, ana, 'Ana')
    await createPinnedVenue(pageA!, central)
    await createPlainVenue(pageA!, arena)

    const link = await createBeachMeetup(pageA!, title, central)
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
    await pageA!.reload()
    await playSetMatch(pageA!, pageB!, pageC!, {
      blue: [ana.username, bia.username],
      green: [caio.username, davi.username],
      scores: [
        ['21', '15'],
        ['21', '18'],
      ],
    })
    await expect(pageA!.getByText('Azul venceu')).toBeVisible()

    await playSetMatch(pageA!, pageC!, pageB!, {
      blue: [ana.username, caio.username],
      green: [bia.username, davi.username],
      scores: [
        ['15', '21'],
        ['18', '21'],
      ],
    })
    await expect(pageA!.getByText('Verde venceu')).toBeVisible()

    const arenaLink = await createBeachMeetup(pageA!, `${title} arena`, arena)
    const arenaPath = new URL(pageA!.url()).pathname
    for (const guest of [pageB!, pageC!, pageD!]) {
      await guest.goto(arenaLink)
      await guest.getByRole('button', { name: 'Confirmar presença' }).click()
      await expect(guest.getByText('Presença confirmada.')).toBeVisible()
    }
    await startMeetup(arenaPath.split('/').at(-1) ?? '')
    await pageA!.goto(arenaPath)
    await playSetMatch(pageA!, pageB!, pageC!, {
      blue: [ana.username, bia.username],
      green: [caio.username, davi.username],
      scores: [
        ['21', '12'],
        ['21', '16'],
      ],
    })

    const manualLink = await createManualMeetup(pageA!, `${title} manual`)
    const manualPath = new URL(pageA!.url()).pathname
    for (const guest of [pageB!, pageC!, pageD!]) {
      await guest.goto(manualLink)
      await guest.getByRole('button', { name: 'Confirmar presença' }).click()
      await expect(guest.getByText('Presença confirmada.')).toBeVisible()
    }
    await startMeetup(manualPath.split('/').at(-1) ?? '')
    await pageA!.goto(manualPath)
    await playSetMatch(pageA!, pageB!, pageC!, {
      blue: [ana.username, bia.username],
      green: [caio.username, davi.username],
      scores: [
        ['21', '11'],
        ['21', '14'],
      ],
    })

    await pageA!.goto('/perfil')
    const performance = pageA!.getByRole('region', {
      name: 'Desempenho por local',
    })
    await expect(performance.getByText(central)).toBeVisible()
    await expect(performance.getByText(arena)).toBeVisible()
    await expect(performance.getByText('Sem local cadastrado')).toBeVisible()
    await expect(performance.getByText('2 partidas, 1 vitórias')).toBeVisible()
    await performance.getByLabel('Modalidade').selectOption({
      label: 'Vôlei de areia',
    })
    await performance.getByLabel('Formato').selectOption({
      label: 'Vôlei de areia 2x2',
    })
    await expect(performance.getByText('2 partidas, 1 vitórias')).toBeVisible()
    await expect(performance.getByText(arena)).toBeVisible()

    await pageA!.goto('/locais')
    const card = pageA!.getByRole('article').filter({ hasText: central })
    await card.getByRole('button', { name: 'Arquivar local' }).click()
    await card.getByRole('button', { name: 'Confirmar arquivamento' }).click()
    await pageA!.getByRole('tab', { name: 'Mapa' }).click()
    await pageA!.getByRole('button', { name: central }).click()
    await expect(
      pageA!.getByText('Vôlei de areia: 2 partidas, 1 vitórias, 50,0%'),
    ).toBeVisible()

    await pageA!.goto('/perfil')
    await expect(
      pageA!
        .getByRole('region', { name: 'Desempenho por local' })
        .getByText(central),
    ).toBeVisible()

    await pageA!.goto('/comunidades/nova')
    await pageA!.getByLabel('Nome').fill(`Privada ${ana.username.slice(-4)}`)
    await pageA!.getByLabel('Descrição').fill('Quadra fechada')
    await pageA!.getByRole('radio', { name: 'Privada' }).check()
    await pageA!
      .getByRole('checkbox', { name: 'Vôlei de areia', exact: true })
      .check()
    await pageA!.getByRole('button', { name: 'Criar comunidade' }).click()
    await expect(pageA!.getByRole('heading', { name: /Privada/ })).toBeVisible()
    await pageA!.getByRole('tab', { name: 'Locais' }).click()
    await expect(pageA!.getByText('Utilização dos locais')).toBeVisible()
    const communityUrl = pageA!.url()

    const evaPage = await outsider.newPage()
    await signup(evaPage, eva, 'Eva')
    await evaPage.goto(communityUrl)
    await expect(evaPage.getByText('Comunidade não encontrada.')).toBeVisible()
    await expect(evaPage.getByText('Utilização dos locais')).toHaveCount(0)

    const wide = await desktopContext.newPage()
    await wide.goto('/entrar')
    await wide.getByLabel('E-mail').fill(ana.email)
    await wide.getByLabel('Senha').fill(ana.password)
    await wide.getByRole('button', { name: 'Entrar' }).click()
    await expect(
      wide.getByRole('heading', { name: 'Meu perfil' }),
    ).toBeVisible()
    await expect(
      wide
        .getByRole('region', { name: 'Desempenho por local' })
        .getByText(arena),
    ).toBeVisible()
    await expect(wide.getByText(central)).toBeVisible()
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
    await desktopContext.close()
    await outsider.close()
  }
})

async function playSetMatch(
  organizer: Page,
  sameSide: Page,
  otherSide: Page,
  match: {
    blue: string[]
    green: string[]
    scores: [string, string][]
  },
) {
  await organizer.getByRole('button', { name: 'Nova partida' }).click()
  await expect(organizer.getByText('Partida criada.')).toBeVisible()
  await organizer.getByLabel('Nome da equipe 1').fill('Azul')
  await organizer.getByLabel('Nome da equipe 2').fill('Verde')
  for (const username of match.blue) await assign(organizer, username, 'Azul')
  for (const username of match.green) await assign(organizer, username, 'Verde')
  await organizer.getByRole('button', { name: 'Salvar equipes' }).click()
  await expect(organizer.getByText('Equipes salvas.')).toBeVisible()
  for (const [index, score] of match.scores.entries()) {
    if (index > 0) {
      await organizer.getByRole('button', { name: 'Adicionar set' }).click()
    }
    await organizer
      .getByLabel(`Pontos de Azul no set ${index + 1}`)
      .fill(score[0])
    await organizer
      .getByLabel(`Pontos de Verde no set ${index + 1}`)
      .fill(score[1])
  }
  await organizer.getByRole('button', { name: 'Salvar placar' }).click()
  await expect(organizer.getByText('Placar salvo.')).toBeVisible()
  await organizer
    .getByRole('button', { name: 'Enviar para confirmação' })
    .click()
  await expect(
    organizer.getByText('Placar enviado para confirmação.'),
  ).toBeVisible()
  const path = new URL(organizer.url()).pathname
  await sameSide.goto(path)
  await sameSide.getByRole('button', { name: 'Confirmar placar' }).click()
  await expect(sameSide.getByText('Confirmação registrada.')).toBeVisible()
  await otherSide.goto(path)
  await otherSide.getByRole('button', { name: 'Confirmar placar' }).click()
  await expect(
    otherSide.getByText('Resultado definitivo').first(),
  ).toBeVisible()
  await organizer.goto(path)
  await expect(
    organizer.getByText('Resultado definitivo').first(),
  ).toBeVisible()
}

async function assign(page: Page, username: string, side: string) {
  await page
    .getByRole('group', { name: username })
    .getByRole('radio', { name: side })
    .check()
}

async function createPinnedVenue(page: Page, name: string) {
  await page.goto('/locais')
  await page.getByLabel('Nome do local').fill(name)
  await page.getByLabel('Endereço do local').fill('Rua da Central, 10')
  await page.getByRole('button', { name: 'Marcar no mapa' }).click()
  await page.getByRole('button', { name: 'Usar o centro do mapa' }).click()
  await page.getByRole('button', { name: 'Cadastrar local' }).click()
  await expect(page.getByText('Local cadastrado.')).toBeVisible()
}

async function createPlainVenue(page: Page, name: string) {
  await page.goto('/locais')
  await page.getByLabel('Nome do local').fill(name)
  await page.getByLabel('Endereço do local').fill('Rua da Arena, 20')
  await page.getByRole('button', { name: 'Cadastrar local' }).click()
  await expect(page.getByText('Local cadastrado.')).toBeVisible()
}

async function createBeachMeetup(page: Page, title: string, venue: string) {
  await page.goto('/encontros/novo')
  await page.getByLabel('Modalidade').selectOption({ label: 'Vôlei de areia' })
  await page.getByLabel('Formato').selectOption({ label: 'Vôlei de areia 2x2' })
  await page.getByLabel('Título').fill(title)
  await page.getByRole('radio', { name: 'Cadastrado' }).check()
  await page.getByLabel('Local cadastrado').selectOption({ label: venue })
  await page.getByLabel('Capacidade, incluindo quem organiza').fill('4')
  await page.getByRole('button', { name: 'Criar encontro' }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  return inviteLink(page)
}

async function createManualMeetup(page: Page, title: string) {
  await page.goto('/encontros/novo')
  await page.getByLabel('Modalidade').selectOption({ label: 'Vôlei de areia' })
  await page.getByLabel('Formato').selectOption({ label: 'Vôlei de areia 2x2' })
  await page.getByLabel('Título').fill(title)
  await page.getByLabel('Local').fill('Areia sem cadastro')
  await page.getByLabel('Capacidade, incluindo quem organiza').fill('4')
  await page.getByRole('button', { name: 'Criar encontro' }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  return inviteLink(page)
}

async function inviteLink(page: Page) {
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
