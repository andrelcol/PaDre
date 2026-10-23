import { expect, test, type Page } from '@playwright/test'

const mobile = { width: 390, height: 844 }

test('personal venue keeps the meetup snapshot after rename and archive', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const ana = createAccount('ana')
  const context = await browser.newContext({ viewport: mobile })
  const page = await context.newPage()

  try {
    await signup(page, ana, 'Ana')
    await page.goto('/locais')
    await page.getByLabel('Nome do local').fill('Quadra Central')
    await page.getByLabel('Endereço do local').fill('Rua das Flores, 100')
    await page
      .getByLabel('Detalhes do local')
      .fill('Entrada pelo portão lateral.')
    await page.getByRole('button', { name: 'Cadastrar local' }).click()
    await expect(page.getByText('Local cadastrado.')).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Quadra Central' }),
    ).toBeVisible()

    await page.goto('/encontros/novo')
    await page.getByLabel('Modalidade').selectOption({ label: 'Vôlei' })
    await page.getByLabel('Formato').selectOption({ label: 'Vôlei 6x6' })
    await page.getByLabel('Título').fill('Treino na quadra')
    await page.getByRole('radio', { name: 'Cadastrado' }).check()
    await page
      .getByLabel('Local cadastrado')
      .selectOption({ label: 'Quadra Central' })
    await expect(page.getByText('Rua das Flores, 100')).toBeVisible()
    await expect(page.getByText('Entrada pelo portão lateral.')).toBeVisible()
    await page.getByRole('button', { name: 'Criar encontro' }).click()
    await expect(
      page.getByRole('heading', { name: 'Treino na quadra' }),
    ).toBeVisible()
    await expect(
      page.getByText('Quadra Central · Rua das Flores, 100').first(),
    ).toBeVisible()
    const meetupPath = new URL(page.url()).pathname

    await page.goto('/locais')
    const card = page.getByRole('article').filter({ hasText: 'Quadra Central' })
    await card.getByRole('button', { name: 'Editar local' }).click()
    await card.getByLabel('Nome do local').fill('Quadra Central Nova')
    await card.getByRole('button', { name: 'Salvar local' }).click()
    await expect(
      page.getByRole('heading', { name: 'Quadra Central Nova' }),
    ).toBeVisible()

    await page.goto(meetupPath)
    await expect(
      page.getByText('Quadra Central · Rua das Flores, 100').first(),
    ).toBeVisible()
    await expect(page.getByText('Quadra Central Nova')).toHaveCount(0)

    await page.goto('/locais')
    const renamed = page
      .getByRole('article')
      .filter({ hasText: 'Quadra Central Nova' })
    await renamed.getByRole('button', { name: 'Arquivar local' }).click()
    await renamed
      .getByRole('button', { name: 'Confirmar arquivamento' })
      .click()
    await expect(renamed.getByText('Arquivado')).toBeVisible()

    await page.goto(meetupPath)
    await expect(
      page.getByText('Quadra Central · Rua das Flores, 100').first(),
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Partidas' })).toBeVisible()

    await page.goto('/encontros/novo')
    await page.getByRole('radio', { name: 'Cadastrado' }).check()
    await expect(page.getByText('Nenhum local ativo disponível.')).toBeVisible()
  } finally {
    await context.close()
  }
})

test('community members share a venue and outsiders do not see it', async ({
  browser,
}) => {
  test.setTimeout(180_000)
  const ana = createAccount('ana')
  const bia = createAccount('bia')
  const caio = createAccount('caio')
  const communityName = `Grupo ${ana.username.slice(-4)}`
  const contexts = await Promise.all(
    [0, 1, 2].map(() => browser.newContext({ viewport: mobile })),
  )
  const [pageA, pageB, pageC] = await Promise.all(
    contexts.map((context) => context.newPage()),
  )

  try {
    await signup(pageA!, ana, 'Ana')
    await pageA!.goto('/comunidades/nova')
    await pageA!.getByLabel('Nome').fill(communityName)
    await pageA!.getByLabel('Descrição').fill('Grupo de quadra')
    await pageA!.getByRole('radio', { name: 'Pública', exact: true }).check()
    await pageA!.getByRole('checkbox', { name: 'Vôlei', exact: true }).check()
    await pageA!.getByRole('button', { name: 'Criar comunidade' }).click()
    await expect(
      pageA!.getByRole('heading', { name: communityName }),
    ).toBeVisible()
    const communityPath = new URL(pageA!.url()).pathname

    await pageA!.getByLabel('Nome do local').fill('Ginásio do grupo')
    await pageA!.getByLabel('Endereço do local').fill('Avenida do Clube, 20')
    await pageA!.getByLabel('Detalhes do local').fill('Quadra coberta.')
    await pageA!.getByRole('button', { name: 'Cadastrar local' }).click()
    await expect(pageA!.getByText('Local cadastrado.')).toBeVisible()

    await signup(pageB!, bia, 'Bia')
    await pageB!.goto(communityPath)
    await pageB!.getByRole('button', { name: 'Entrar' }).click()
    await expect(pageB!.getByText('Você entrou na comunidade.')).toBeVisible()
    await expect(
      pageB!.getByRole('heading', { name: 'Ginásio do grupo' }),
    ).toBeVisible()
    await expect(pageB!.getByText('Avenida do Clube, 20')).toBeVisible()
    await expect(
      pageB!.getByRole('button', { name: 'Cadastrar local' }),
    ).toHaveCount(0)

    await pageB!.getByRole('link', { name: 'Propor encontro' }).click()
    await pageB!.getByLabel('Título').fill('Jogo do grupo')
    await pageB!.getByRole('radio', { name: 'Cadastrado' }).check()
    await pageB!
      .getByLabel('Local cadastrado')
      .selectOption({ label: 'Ginásio do grupo' })
    await pageB!.getByRole('button', { name: 'Publicar encontro' }).click()
    await expect(
      pageB!.getByRole('heading', { name: 'Jogo do grupo' }),
    ).toBeVisible()
    await expect(
      pageB!.getByText('Ginásio do grupo · Avenida do Clube, 20').first(),
    ).toBeVisible()
    const meetupPath = new URL(pageB!.url()).pathname

    await pageA!.goto(meetupPath)
    await expect(
      pageA!.getByRole('heading', { name: 'Jogo do grupo' }),
    ).toBeVisible()
    await expect(
      pageA!.getByText('Ginásio do grupo · Avenida do Clube, 20').first(),
    ).toBeVisible()

    await signup(pageC!, caio, 'Caio')
    await pageC!.goto(communityPath)
    await expect(
      pageC!.getByRole('heading', { name: communityName }),
    ).toBeVisible()
    await expect(pageC!.getByText('Avenida do Clube, 20')).toHaveCount(0)
    await expect(pageC!.getByRole('heading', { name: 'Locais' })).toHaveCount(0)
    await pageC!.goto(meetupPath)
    await expect(
      pageC!.getByText('Você não pode ver este encontro.'),
    ).toBeVisible()
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
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
