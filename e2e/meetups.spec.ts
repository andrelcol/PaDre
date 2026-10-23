import { expect, test, type Page } from '@playwright/test'

test('two friends create, accept, leave and cancel a meetup', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const ana = createAccount('ana')
  const bia = createAccount('bia')
  const contextA = await browser.newContext({
    viewport: { width: 390, height: 844 },
  })
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()

  try {
    await signup(pageA, ana, 'Ana')
    await signup(pageB, bia, 'Bia')
    await requestFriendship(pageA, bia.username)
    await acceptFriendship(pageB)

    await pageA.goto('/encontros/novo')
    await expect(
      pageA.getByRole('heading', { name: 'Novo encontro' }),
    ).toBeVisible()
    await pageA.getByLabel('Modalidade').selectOption({ label: 'Vôlei' })
    await pageA.getByLabel('Formato').selectOption({ label: 'Vôlei 6x6' })
    await expect(pageA.getByText('Regra deste formato')).toBeVisible()
    await pageA.getByLabel('Título').fill('Vôlei na quadra')
    await pageA.getByLabel('Local').fill('Quadra do clube')
    await pageA.getByLabel('Capacidade, incluindo quem organiza').fill('2')
    await pageA.getByRole('button', { name: 'Criar encontro' }).click()
    await expect(
      pageA.getByRole('heading', { name: 'Vôlei na quadra' }),
    ).toBeVisible()

    await pageA.getByLabel('Amigo').selectOption(bia.username)
    await pageA.getByRole('button', { name: 'Convidar' }).click()
    await expect(pageA.getByText('Convite enviado.')).toBeVisible()
    await expect(pageA.getByRole('list', { name: 'Convites' })).toContainText(
      bia.username,
    )

    await pageB.goto('/encontros')
    await pageB.getByRole('link', { name: /Vôlei na quadra/ }).click()
    await pageB.getByRole('button', { name: 'Aceitar convite' }).click()
    await expect(pageB.getByText('Presença confirmada.')).toBeVisible()
    await expect(
      pageB.getByRole('list', { name: 'Participantes confirmados' }),
    ).toContainText(ana.username)
    await expect(
      pageB.getByRole('list', { name: 'Participantes confirmados' }),
    ).toContainText(bia.username)

    await pageA.reload()
    await expect(
      pageA.getByRole('list', { name: 'Participantes confirmados' }),
    ).toContainText(bia.username)

    await pageB.getByRole('button', { name: 'Desistir' }).click()
    await pageB.getByRole('button', { name: 'Confirmar desistência' }).click()
    await expect(pageB.getByText('Você saiu do encontro.')).toBeVisible()

    await pageA.reload()
    await expect(pageA.getByText('1 vaga disponível').first()).toBeVisible()
    await pageA.getByRole('button', { name: 'Cancelar encontro' }).click()
    await pageA.getByRole('button', { name: 'Confirmar cancelamento' }).click()
    await expect(pageA.getByText('Cancelado', { exact: true })).toBeVisible()
  } finally {
    await contextA.close()
    await contextB.close()
  }
})

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

async function requestFriendship(page: Page, username: string) {
  await page.goto('/amigos')
  await page.getByLabel('Nome de usuário').fill(username)
  await page.getByRole('button', { name: 'Enviar solicitação' }).click()
  await expect(page.getByText('Solicitação enviada.')).toBeVisible()
}

async function acceptFriendship(page: Page) {
  await page.goto('/amigos')
  await page.getByRole('button', { name: 'Aceitar' }).click()
  await expect(page.getByText('Amizade confirmada.')).toBeVisible()
}
