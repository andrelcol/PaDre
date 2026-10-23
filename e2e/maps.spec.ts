import { expect, test, type Page } from '@playwright/test'

const mobile = { width: 390, height: 844 }
const desktop = { width: 1280, height: 800 }

test('personal map pin is visible on the meetup and hidden from another person', async ({
  browser,
}) => {
  test.setTimeout(180_000)
  const ana = createAccount('ana')
  const bia = createAccount('bia')
  const contextA = await browser.newContext({ viewport: mobile })
  const contextB = await browser.newContext({ viewport: mobile })
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()

  try {
    await signup(pageA, ana, 'Ana')
    await chooseTheme(pageA, 'Escuro')
    await pageA.goto('/locais')
    await pageA.getByLabel('Nome do local').fill('Quadra do mapa')
    await pageA.getByLabel('Endereço do local').fill('Rua do Mapa, 10')
    await markCenter(pageA)
    await pageA.getByRole('button', { name: 'Cadastrar local' }).click()
    await expect(pageA.getByText('Local cadastrado.')).toBeVisible()
    const card = pageA
      .getByRole('article')
      .filter({ hasText: 'Quadra do mapa' })
    await expect(card.getByText('Posição registrada.')).toBeVisible()
    await expect(card.getByText('Como chegar')).toBeVisible()

    await pageA.getByRole('tab', { name: 'Mapa' }).click()
    await pageA.getByRole('button', { name: 'Quadra do mapa' }).click()
    await expect(pageA.getByText('Rua do Mapa, 10')).toBeVisible()
    await pageA.screenshot({
      path: 'demo/maps/01-locais-mobile-escuro.png',
    })

    await pageA.goto('/encontros/novo')
    await pageA.getByLabel('Modalidade').selectOption({ label: 'Vôlei' })
    await pageA.getByLabel('Formato').selectOption({ label: 'Vôlei 6x6' })
    await pageA.getByLabel('Título').fill('Treino no mapa')
    await pageA.getByRole('radio', { name: 'Cadastrado' }).check()
    await pageA.getByLabel('Local cadastrado').selectOption({
      label: 'Quadra do mapa',
    })
    await pageA.getByRole('button', { name: 'Criar encontro' }).click()
    await expect(
      pageA.getByRole('heading', { name: 'Treino no mapa' }),
    ).toBeVisible()
    await expect(
      pageA.getByText('Quadra do mapa · Rua do Mapa, 10').first(),
    ).toBeVisible()
    await expect(pageA.getByText('Como chegar')).toBeVisible()
    await pageA.getByLabel('Mapa do encontro').scrollIntoViewIfNeeded()
    await expect(pageA.getByText('Carregando mapa')).toHaveCount(0)
    await pageA.screenshot({ path: 'demo/maps/02-encontro-mobile-escuro.png' })

    await signup(pageB, bia, 'Bia')
    await pageB.goto('/locais')
    await expect(pageB.getByText('Quadra do mapa')).toHaveCount(0)
    await expect(pageB.getByText('Rua do Mapa, 10')).toHaveCount(0)
  } finally {
    await contextA.close()
    await contextB.close()
  }
})

test('community members see the venue marker and outsiders do not', async ({
  browser,
}) => {
  test.setTimeout(180_000)
  const ana = createAccount('ana')
  const bia = createAccount('bia')
  const caio = createAccount('caio')
  const communityName = `Mapa ${ana.username.slice(-4)}`
  const desktopContext = await browser.newContext({ viewport: desktop })
  const contexts = await Promise.all([
    desktopContext,
    browser.newContext({ viewport: mobile }),
    browser.newContext({ viewport: mobile }),
  ])
  const [pageA, pageB, pageC] = await Promise.all(
    contexts.map((context) => context.newPage()),
  )

  try {
    await signup(pageA!, ana, 'Ana')
    await chooseTheme(pageA!, 'Claro')
    await pageA!.goto('/comunidades/nova')
    await pageA!.getByLabel('Nome').fill(communityName)
    await pageA!.getByLabel('Descrição').fill('Grupo com mapa')
    await pageA!.getByRole('radio', { name: 'Pública', exact: true }).check()
    await pageA!.getByRole('checkbox', { name: 'Vôlei', exact: true }).check()
    await pageA!.getByRole('button', { name: 'Criar comunidade' }).click()
    await expect(
      pageA!.getByRole('heading', { name: communityName }),
    ).toBeVisible()
    const communityPath = new URL(pageA!.url()).pathname

    await pageA!.getByLabel('Nome do local').fill('Ginásio mapeado')
    await pageA!.getByLabel('Endereço do local').fill('Avenida do Mapa, 20')
    await markCenter(pageA!)
    await pageA!.getByRole('button', { name: 'Cadastrar local' }).click()
    await expect(pageA!.getByText('Local cadastrado.')).toBeVisible()
    await pageA!.getByRole('tab', { name: 'Mapa' }).click()
    await expect(
      pageA!.getByRole('button', { name: 'Ginásio mapeado' }),
    ).toBeVisible()
    await pageA!.screenshot({
      path: 'demo/maps/03-comunidade-desktop-claro.png',
    })

    await signup(pageB!, bia, 'Bia')
    await pageB!.goto(communityPath)
    await pageB!.getByRole('button', { name: 'Entrar' }).click()
    await expect(pageB!.getByText('Você entrou na comunidade.')).toBeVisible()
    await pageB!.getByRole('tab', { name: 'Mapa' }).click()
    await pageB!.getByRole('button', { name: 'Ginásio mapeado' }).click()
    await expect(pageB!.getByText('Avenida do Mapa, 20')).toBeVisible()
    await expect(
      pageB!.getByRole('button', { name: 'Registrar esta posição' }),
    ).toHaveCount(0)

    await signup(pageC!, caio, 'Caio')
    await pageC!.goto(communityPath)
    await expect(
      pageC!.getByRole('heading', { name: communityName }),
    ).toBeVisible()
    await expect(pageC!.getByText('Avenida do Mapa, 20')).toHaveCount(0)
    await expect(pageC!.getByRole('tab', { name: 'Mapa' })).toHaveCount(0)
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
  }
})

async function markCenter(page: Page) {
  await page.getByRole('button', { name: 'Marcar no mapa' }).click()
  await expect(
    page.getByRole('button', { name: 'Usar o centro do mapa' }),
  ).toBeEnabled({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Usar o centro do mapa' }).click()
  await expect(page.getByText('Posição selecionada:')).toBeVisible()
}

async function chooseTheme(page: Page, name: 'Claro' | 'Escuro') {
  await page.locator('label').filter({ hasText: name }).click()
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
