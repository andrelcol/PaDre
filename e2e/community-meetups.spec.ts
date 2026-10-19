import { expect, test, type Page } from '@playwright/test'

test('community members publish, join and moderate meetups', async ({
  browser,
}) => {
  test.setTimeout(180_000)
  const ana = createAccount('ana')
  const bia = createAccount('bia')
  const caio = createAccount('caio')
  const publicName = `Vôlei ${ana.username.slice(-4)}`
  const privateName = `Fechado ${ana.username.slice(-4)}`
  const publicTitle = `Areia ${ana.username.slice(-4)}`
  const privateTitle = `Interno ${ana.username.slice(-4)}`
  const moderatedTitle = `Extra ${ana.username.slice(-4)}`
  const mobile = { width: 390, height: 844 }
  const contexts = await Promise.all(
    [0, 1, 2].map(() => browser.newContext({ viewport: mobile })),
  )
  const [pageA, pageB, pageC] = await Promise.all(
    contexts.map((context) => context.newPage()),
  )

  try {
    await signup(pageA!, ana, 'Ana')
    await createCommunity(pageA!, publicName, 'Pública')
    const publicPath = new URL(pageA!.url()).pathname

    await signup(pageB!, bia, 'Bia')
    await pageB!.goto(publicPath)
    await pageB!.getByRole('button', { name: 'Entrar' }).click()
    await expect(pageB!.getByText('Você entrou na comunidade.')).toBeVisible()

    await signup(pageC!, caio, 'Caio')
    await pageC!.goto(publicPath)
    await pageC!.getByRole('button', { name: 'Entrar' }).click()
    await expect(pageC!.getByText('Você entrou na comunidade.')).toBeVisible()

    await propose(pageA!, publicPath, publicTitle)
    const publicMeetup = pageA!.url()

    await pageB!.goto(publicPath)
    await pageB!.getByRole('link', { name: new RegExp(publicTitle) }).click()
    await pageB!.getByRole('button', { name: 'Confirmar presença' }).click()
    await expect(
      pageB!.getByText('Sua presença está confirmada.'),
    ).toBeVisible()

    await pageC!.goto(publicMeetup)
    await pageC!.getByRole('button', { name: 'Confirmar presença' }).click()
    await expect(
      pageC!.getByText('Sua presença está confirmada.'),
    ).toBeVisible()
    const confirmed = pageC!.getByRole('list', {
      name: 'Participantes confirmados',
    })
    await expect(
      confirmed.getByText(ana.username, { exact: true }),
    ).toBeVisible()
    await expect(
      confirmed.getByText(bia.username, { exact: true }),
    ).toBeVisible()
    await expect(
      confirmed.getByText(caio.username, { exact: true }),
    ).toBeVisible()

    await pageA!.goto(publicMeetup)
    const seenByOrganizer = pageA!.getByRole('list', {
      name: 'Participantes confirmados',
    })
    await expect(
      seenByOrganizer.getByText(bia.username, { exact: true }),
    ).toBeVisible()
    await expect(
      seenByOrganizer.getByText(caio.username, { exact: true }),
    ).toBeVisible()
    await pageA!.getByRole('button', { name: 'Cancelar encontro' }).click()
    await pageA!.getByRole('button', { name: 'Confirmar cancelamento' }).click()
    await expect(pageA!.getByText('Este encontro foi cancelado.')).toBeVisible()

    await pageB!.goto(publicMeetup)
    await expect(pageB!.getByText('Este encontro foi cancelado.')).toBeVisible()
    await expect(
      pageB!.getByRole('button', { name: 'Confirmar presença' }),
    ).toHaveCount(0)

    await createCommunity(pageA!, privateName, 'Privada')
    const privatePath = new URL(pageA!.url()).pathname
    await pageA!.getByLabel('Nome de usuário').fill(bia.username)
    await pageA!.getByRole('button', { name: 'Convidar' }).click()
    await expect(pageA!.getByText('Convite enviado.')).toBeVisible()

    await pageB!.goto('/comunidades')
    await pageB!.getByRole('button', { name: 'Aceitar' }).click()
    await expect(pageB!.getByText('Convite aceito.')).toBeVisible()
    await pageB!.getByRole('link', { name: privateName }).click()

    await propose(pageA!, privatePath, privateTitle)
    const privateMeetup = pageA!.url()
    await pageB!.goto(privatePath)
    await pageB!.getByRole('link', { name: new RegExp(privateTitle) }).click()
    await pageB!.getByRole('button', { name: 'Confirmar presença' }).click()
    await expect(
      pageB!.getByText('Sua presença está confirmada.'),
    ).toBeVisible()

    await pageC!.goto(privateMeetup)
    await expect(
      pageC!.getByText('Você não pode ver este encontro.'),
    ).toBeVisible()

    await pageA!.goto(publicPath)
    await pageA!
      .getByRole('button', { name: `Promover ${bia.username}` })
      .click()
    await expect(pageA!.getByText('Administrador promovido.')).toBeVisible()

    await propose(pageC!, publicPath, moderatedTitle)
    const moderatedMeetup = pageC!.url()
    await pageB!.goto(moderatedMeetup)
    await expect(
      pageB!.getByRole('button', { name: 'Editar encontro' }),
    ).toHaveCount(0)
    await pageB!.getByRole('button', { name: 'Cancelar encontro' }).click()
    await pageB!.getByRole('button', { name: 'Confirmar cancelamento' }).click()
    await expect(pageB!.getByText('Este encontro foi cancelado.')).toBeVisible()

    await pageC!.goto(moderatedMeetup)
    await expect(pageC!.getByText('Este encontro foi cancelado.')).toBeVisible()
    await expect(
      pageC!.getByRole('button', { name: 'Confirmar presença' }),
    ).toHaveCount(0)
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
  }
})

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
