import { expect, test, type Page } from '@playwright/test'

test('community members chat, share a meetup and moderate', async ({
  browser,
}) => {
  test.setTimeout(180_000)
  const ana = createAccount('ana')
  const bia = createAccount('bia')
  const caio = createAccount('caio')
  const davi = createAccount('davi')
  const publicName = `Chat ${ana.username.slice(-4)}`
  const privateName = `Fechado ${ana.username.slice(-4)}`
  const meetupTitle = `Areia ${ana.username.slice(-4)}`
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

    await signup(pageD!, davi, 'Davi')
    await pageD!.goto(publicPath)
    await expect(
      pageD!.getByRole('heading', { name: publicName }),
    ).toBeVisible()
    await expect(
      pageD!.getByRole('heading', { name: 'Chat', exact: true }),
    ).toHaveCount(0)

    await signup(pageB!, bia, 'Bia')
    await pageB!.goto(publicPath)
    await pageB!.getByRole('button', { name: 'Entrar' }).click()
    await expect(pageB!.getByText('Você entrou na comunidade.')).toBeVisible()

    await sendChat(pageA!, 'Oi, Bia')
    await pageB!.getByRole('button', { name: 'Atualizar' }).click()
    await expect(pageB!.getByText('Oi, Bia')).toBeVisible()
    await sendChat(pageB!, 'Oi, Ana')
    await pageA!.getByRole('button', { name: 'Atualizar' }).click()
    await expect(pageA!.getByText('Oi, Ana')).toBeVisible()

    await propose(pageA!, publicPath, meetupTitle)
    await pageA!.goto(publicPath)
    await pageA!
      .getByLabel('Encontro', { exact: true })
      .selectOption({ label: meetupTitle })
    await sendChat(pageA!, 'Vamos?')
    await pageB!.getByRole('button', { name: 'Atualizar' }).click()
    const shared = pageB!.getByRole('link', {
      name: `Encontro compartilhado ${meetupTitle}`,
    })
    await expect(shared).toBeVisible()
    await expect(shared.getByText('9 vagas')).toBeVisible()
    await shared.click()
    await pageB!.getByRole('button', { name: 'Confirmar presença' }).click()
    await expect(
      pageB!.getByText('Sua presença está confirmada.'),
    ).toBeVisible()
    await pageB!.goto(publicPath)
    await pageB!.getByRole('button', { name: 'Atualizar' }).click()
    await expect(
      pageB!.getByRole('link', {
        name: `Encontro compartilhado ${meetupTitle}`,
      }),
    ).toContainText('8 vagas')

    await pageA!
      .getByRole('button', { name: `Promover ${bia.username}` })
      .click()
    await expect(pageA!.getByText('Administrador promovido.')).toBeVisible()

    await signup(pageC!, caio, 'Caio')
    await pageC!.goto(publicPath)
    await pageC!.getByRole('button', { name: 'Entrar' }).click()
    await expect(pageC!.getByText('Você entrou na comunidade.')).toBeVisible()
    await sendChat(pageC!, 'Mensagem do Caio')
    await pageB!.getByRole('button', { name: 'Atualizar' }).click()
    await pageB!
      .getByRole('article')
      .filter({ hasText: 'Mensagem do Caio' })
      .getByRole('button', { name: /Remover mensagem/ })
      .click()
    await pageC!.getByRole('button', { name: 'Atualizar' }).click()
    await expect(pageC!.getByText('Mensagem removida')).toBeVisible()
    await expect(pageC!.getByText('Mensagem do Caio')).toHaveCount(0)

    await pageC!.getByRole('button', { name: 'Sair da comunidade' }).click()
    await pageC!.getByRole('button', { name: 'Confirmar saída' }).click()
    await expect(pageC!.getByText('Você saiu da comunidade.')).toBeVisible()
    await expect(
      pageC!.getByRole('heading', { name: 'Chat', exact: true }),
    ).toHaveCount(0)

    await createCommunity(pageA!, privateName, 'Privada')
    const privatePath = new URL(pageA!.url()).pathname
    await sendChat(pageA!, 'Segredo do grupo')
    await pageD!.goto(privatePath)
    await expect(pageD!.getByText('Comunidade não encontrada.')).toBeVisible()
    await expect(pageD!.getByText('Segredo do grupo')).toHaveCount(0)
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
  }
})

async function sendChat(page: Page, text: string) {
  await page.getByRole('textbox', { name: 'Mensagem', exact: true }).fill(text)
  await page.getByRole('button', { name: 'Enviar' }).click()
  await expect(page.getByText(text)).toBeVisible()
}

async function propose(page: Page, communityPath: string, title: string) {
  await page.goto(communityPath)
  await page.getByRole('link', { name: 'Propor encontro' }).click()
  await expect(page.getByText(/Comunidade:/)).toBeVisible()
  await page.getByLabel('Título').fill(title)
  await page.getByLabel('Local').fill('Quadra')
  await page.getByRole('button', { name: 'Publicar encontro' }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
}

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
