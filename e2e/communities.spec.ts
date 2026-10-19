import { expect, test, type Page } from '@playwright/test'

test('public and private communities keep roles, invites and privacy', async ({
  browser,
}) => {
  test.setTimeout(180_000)
  const ana = createAccount('ana')
  const bia = createAccount('bia')
  const caio = createAccount('caio')
  const davi = createAccount('davi')
  const publicName = `Vôlei ${ana.username.slice(-4)}`
  const privateName = `Fechado ${ana.username.slice(-4)}`
  const mobile = { width: 390, height: 844 }
  const contexts = await Promise.all(
    [0, 1, 2, 3].map(() => browser.newContext({ viewport: mobile })),
  )
  const [pageA, pageB, pageC, pageD] = await Promise.all(
    contexts.map((context) => context.newPage()),
  )

  try {
    await signup(pageA!, ana, 'Ana')
    await createCommunity(pageA!, publicName, 'Pública')
    const publicPath = new URL(pageA!.url()).pathname

    await signup(pageB!, bia, 'Bia')
    await pageB!.goto('/comunidades')
    await pageB!.getByRole('link', { name: publicName }).click()
    await pageB!.getByRole('button', { name: 'Entrar' }).click()
    await expect(pageB!.getByText('Você entrou na comunidade.')).toBeVisible()

    await pageA!.goto(publicPath)
    await expect(pageA!.getByText(bia.username, { exact: true })).toBeVisible()
    await pageA!
      .getByRole('button', { name: `Promover ${bia.username}` })
      .click()
    await expect(pageA!.getByText('Administrador promovido.')).toBeVisible()

    await pageB!.goto(publicPath)
    await expect(
      pageB!.getByRole('heading', { name: 'Convidar' }),
    ).toBeVisible()

    await signup(pageC!, caio, 'Caio')
    await pageC!.goto(publicPath)
    await pageC!.getByRole('button', { name: 'Entrar' }).click()
    await expect(pageC!.getByText('Você entrou na comunidade.')).toBeVisible()
    await expect(pageC!.getByRole('heading', { name: 'Convidar' })).toHaveCount(
      0,
    )
    await expect(pageC!.getByRole('button', { name: /Promover/ })).toHaveCount(
      0,
    )
    await pageC!.getByRole('button', { name: 'Sair da comunidade' }).click()
    await pageC!.getByRole('button', { name: 'Confirmar saída' }).click()
    await expect(pageC!.getByText('Você saiu da comunidade.')).toBeVisible()

    await pageA!.goto(publicPath)
    await expect(pageA!.getByText(caio.username)).toHaveCount(0)

    await createCommunity(pageA!, privateName, 'Privada')
    const privatePath = new URL(pageA!.url()).pathname
    await pageA!.getByLabel('Nome de usuário').fill(caio.username)
    await pageA!.getByRole('button', { name: 'Convidar' }).click()
    await expect(pageA!.getByText('Convite enviado.')).toBeVisible()

    await pageC!.goto('/comunidades')
    await expect(
      pageC!.getByRole('heading', { name: privateName }),
    ).toBeVisible()
    await pageC!.getByRole('button', { name: 'Aceitar' }).click()
    await expect(pageC!.getByText('Convite aceito.')).toBeVisible()
    await pageC!.getByRole('link', { name: privateName }).click()
    await expect(
      pageC!.getByRole('heading', { name: privateName }),
    ).toBeVisible()

    await signup(pageD!, davi, 'Davi')
    await pageD!.goto('/comunidades')
    await expect(pageD!.getByRole('link', { name: privateName })).toHaveCount(0)
    await pageD!.goto(privatePath)
    await expect(pageD!.getByText('Comunidade não encontrada.')).toBeVisible()
    await expect(
      pageD!.getByRole('heading', { name: privateName }),
    ).toHaveCount(0)
    await expect(pageD!.getByText(caio.username)).toHaveCount(0)
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
  }
})

async function createCommunity(
  page: Page,
  name: string,
  visibility: 'Pública' | 'Privada',
) {
  await page.goto('/comunidades/nova')
  await page.getByLabel('Nome').fill(name)
  await page.getByLabel('Descrição').fill('Grupo de quadra')
  await page.getByRole('radio', { name: visibility, exact: true }).check()
  await page.getByRole('checkbox', { name: 'Vôlei', exact: true }).check()
  await page.getByRole('button', { name: 'Criar comunidade' }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
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
