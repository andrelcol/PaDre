import { expect, test, type Page } from '@playwright/test'

const mobile = { width: 390, height: 844 }

test('members vote, change, close and moderate community polls', async ({
  browser,
}) => {
  test.setTimeout(240_000)
  const ana = createAccount('ana')
  const bia = createAccount('bia')
  const caio = createAccount('caio')
  const davi = createAccount('davi')
  const publicName = `Enquete ${ana.username.slice(-4)}`
  const privateName = `Reserva ${ana.username.slice(-4)}`
  const sportQuestion = 'Qual esporte vamos jogar sábado?'
  const timeQuestion = 'Qual horário no sábado?'
  const cancelQuestion = 'Vamos cancelar esta escolha?'
  const secretQuestion = 'Segredo da enquete'
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
      pageD!.getByRole('heading', { name: 'Enquetes', exact: true }),
    ).toHaveCount(0)

    await signup(pageB!, bia, 'Bia')
    await pageB!.goto(publicPath)
    await pageB!.getByRole('button', { name: 'Entrar' }).click()
    await expect(pageB!.getByText('Você entrou na comunidade.')).toBeVisible()
    await signup(pageC!, caio, 'Caio')
    await pageC!.goto(publicPath)
    await pageC!.getByRole('button', { name: 'Entrar' }).click()
    await expect(pageC!.getByText('Você entrou na comunidade.')).toBeVisible()
    await pageA!.goto(publicPath)
    await pageA!
      .getByRole('button', { name: `Promover ${bia.username}` })
      .click()
    await expect(pageA!.getByText('Administrador promovido.')).toBeVisible()

    await publishSportPoll(pageA!, sportQuestion)
    const sportA = pollArticle(pageA!, sportQuestion)
    await expect(sportA.getByText('Ninguém votou.')).toBeVisible()

    await reloadPolls(pageB!)
    await vote(pageB!, sportQuestion, 'Vôlei')
    await reloadPolls(pageC!)
    await vote(pageC!, sportQuestion, 'Beach tennis')
    await reloadPolls(pageA!)
    await expect(pollArticle(pageA!, sportQuestion)).toContainText('1 voto')
    await expect(pollArticle(pageA!, sportQuestion)).toContainText(
      '2 pessoas votaram.',
    )

    await changeVote(pageC!, sportQuestion, 'Vôlei')
    await reloadPolls(pageA!)
    await expect(pollArticle(pageA!, sportQuestion)).toContainText(
      'Vôlei: 2 votos',
    )
    await expect(pollArticle(pageA!, sportQuestion)).toContainText(
      'Beach tennis: 0 votos',
    )

    await pollArticle(pageA!, sportQuestion)
      .getByRole('button', { name: 'Encerrar enquete' })
      .click()
    await pollArticle(pageA!, sportQuestion)
      .getByRole('button', { name: 'Confirmar encerramento' })
      .click()
    await expect(pageA!.getByText('Enquete encerrada.')).toBeVisible()
    await reloadPolls(pageB!)
    await showPolls(pageB!, 'Encerradas')
    const closed = pollArticle(pageB!, sportQuestion)
    await expect(closed).toContainText('Encerrada')
    await expect(
      closed.getByRole('button', { name: 'Salvar voto' }),
    ).toHaveCount(0)
    await expect(closed).toContainText('Mais votada: Vôlei.')

    await publishSchedulePoll(pageB!, timeQuestion)
    await showPolls(pageA!, 'Abertas')
    await reloadPolls(pageA!)
    await voteMany(pageA!, timeQuestion, ['Sábado 9h', 'Sábado 11h'])
    await reloadPolls(pageC!)
    await voteMany(pageC!, timeQuestion, ['Sábado 16h'])
    await reloadPolls(pageA!)
    const times = pollArticle(pageA!, timeQuestion)
    await expect(times).toContainText('Sábado 9h: 1 voto (50%)')
    await expect(times).toContainText('Sábado 11h: 1 voto (50%)')
    await expect(times).toContainText('Sábado 16h: 1 voto (50%)')
    await expect(times).toContainText('soma pode passar de 100%')

    await publishGeneralPoll(pageA!, cancelQuestion, ['Sim', 'Não'])
    await showPolls(pageB!, 'Abertas')
    await reloadPolls(pageB!)
    await pollArticle(pageB!, cancelQuestion)
      .getByRole('button', { name: 'Cancelar enquete' })
      .click()
    await pollArticle(pageB!, cancelQuestion)
      .getByRole('button', { name: 'Confirmar cancelamento' })
      .click()
    await expect(pageB!.getByText('Enquete cancelada.')).toBeVisible()
    await showPolls(pageA!, 'Canceladas')
    await expect(pollArticle(pageA!, cancelQuestion)).toContainText(
      'não vale como decisão do grupo',
    )

    await pageD!.goto(publicPath)
    await expect(pageD!.getByText(sportQuestion)).toHaveCount(0)

    await createCommunity(pageA!, privateName, 'Privada')
    const privatePath = new URL(pageA!.url()).pathname
    await publishGeneralPoll(pageA!, secretQuestion, ['Uma', 'Duas'])
    await pageD!.goto(privatePath)
    await expect(pageD!.getByText('Comunidade não encontrada.')).toBeVisible()
    await expect(pageD!.getByText(secretQuestion)).toHaveCount(0)
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
  }
})

test('records a mobile walkthrough of community polls', async ({ browser }) => {
  test.skip(!process.env.PADRE_RECORD, 'Gravação só quando PADRE_RECORD=1')
  test.setTimeout(240_000)
  const ana = createAccount('ana')
  const bia = createAccount('bia')
  const caio = createAccount('caio')
  const name = `Vídeo ${ana.username.slice(-4)}`
  const question = 'Qual esporte vamos jogar sábado?'
  const context = await browser.newContext({
    viewport: mobile,
    recordVideo: { dir: 'demo/polls', size: mobile },
  })
  const page = await context.newPage()
  try {
    await signup(page, ana, 'Ana')
    await createCommunity(page, name, 'Pública')
    const path = new URL(page.url()).pathname
    await publishSportPoll(page, question)
    await page.waitForTimeout(1200)
    await page.getByRole('button', { name: 'Sair', exact: true }).click()

    await signup(page, bia, 'Bia')
    await page.goto(path)
    await page.getByRole('button', { name: 'Entrar' }).click()
    await vote(page, question, 'Vôlei')
    await page.waitForTimeout(1200)
    await page.getByRole('button', { name: 'Sair', exact: true }).click()

    await signup(page, caio, 'Caio')
    await page.goto(path)
    await page.getByRole('button', { name: 'Entrar' }).click()
    await vote(page, question, 'Beach tennis')
    await page.waitForTimeout(800)
    await changeVote(page, question, 'Vôlei')
    await page.waitForTimeout(1200)
    await page.getByRole('button', { name: 'Sair', exact: true }).click()

    await login(page, ana)
    await page.goto(path)
    await openPolls(page)
    await expect(pollArticle(page, question)).toContainText('Vôlei: 2 votos')
    await page.waitForTimeout(1500)
    await pollArticle(page, question)
      .getByRole('button', { name: 'Encerrar enquete' })
      .click()
    await pollArticle(page, question)
      .getByRole('button', { name: 'Confirmar encerramento' })
      .click()
    await showPolls(page, 'Encerradas')
    await expect(pollArticle(page, question)).toContainText(
      'Mais votada: Vôlei.',
    )
    await page.waitForTimeout(1500)
  } finally {
    await context.close()
  }
})

function pollArticle(page: Page, question: string) {
  return page.getByRole('article').filter({ hasText: question })
}

async function openPolls(page: Page) {
  const tab = page.getByRole('tab', { name: 'Enquetes' })
  if ((await tab.getAttribute('aria-selected')) !== 'true') {
    await tab.click()
  }
}

async function reloadPolls(page: Page) {
  await openPolls(page)
  await page.getByRole('button', { name: 'Recarregar enquetes' }).click()
}

async function showPolls(
  page: Page,
  filter: 'Abertas' | 'Encerradas' | 'Canceladas',
) {
  await openPolls(page)
  await page.getByRole('button', { name: filter }).click()
}

async function vote(page: Page, question: string, choice: string) {
  await openPolls(page)
  const article = pollArticle(page, question)
  await article.getByRole('radio', { name: choice, exact: true }).check()
  await article.getByRole('button', { name: 'Salvar voto' }).click()
  await expect(page.getByText('Voto registrado.')).toBeVisible()
}

async function changeVote(page: Page, question: string, choice: string) {
  await openPolls(page)
  const article = pollArticle(page, question)
  await article.getByRole('radio', { name: choice, exact: true }).check()
  await article.getByRole('button', { name: 'Salvar voto' }).click()
  await expect(page.getByText('Voto registrado.')).toBeVisible()
}

async function voteMany(page: Page, question: string, choices: string[]) {
  await openPolls(page)
  const article = pollArticle(page, question)
  for (const choice of choices) {
    await article.getByRole('checkbox', { name: choice, exact: true }).check()
  }
  await article.getByRole('button', { name: 'Salvar voto' }).click()
  await expect(page.getByText('Voto registrado.')).toBeVisible()
}

async function publishSportPoll(page: Page, question: string) {
  await openPolls(page)
  await page.getByRole('button', { name: 'Nova enquete' }).click()
  await page.getByLabel('Pergunta').fill(question)
  await page.getByLabel('Categoria').selectOption({ label: 'Modalidade' })
  const sports = page.getByRole('group', { name: 'Modalidades da enquete' })
  await sports.getByRole('checkbox', { name: 'Vôlei', exact: true }).check()
  await sports
    .getByRole('checkbox', { name: 'Beach tennis', exact: true })
    .check()
  await sports.getByRole('checkbox', { name: 'Futevôlei', exact: true }).check()
  await page.getByRole('button', { name: 'Publicar enquete' }).click()
  await expect(page.getByText('Enquete publicada.')).toBeVisible()
  await expect(pollArticle(page, question)).toBeVisible()
}

async function publishSchedulePoll(page: Page, question: string) {
  await openPolls(page)
  await page.getByRole('button', { name: 'Nova enquete' }).click()
  await page.getByLabel('Pergunta').fill(question)
  await page.getByLabel('Categoria').selectOption({ label: 'Horário' })
  await page.getByLabel('Votação').selectOption({ label: 'Múltipla escolha' })
  await page.getByLabel('Máximo de escolhas').fill('2')
  await page.getByRole('button', { name: 'Adicionar opção' }).click()
  await page
    .getByRole('textbox', { name: 'Opção 1', exact: true })
    .fill('Sábado 9h')
  await page
    .getByRole('textbox', { name: 'Opção 2', exact: true })
    .fill('Sábado 11h')
  await page
    .getByRole('textbox', { name: 'Opção 3', exact: true })
    .fill('Sábado 16h')
  await page.getByRole('button', { name: 'Publicar enquete' }).click()
  await expect(page.getByText('Enquete publicada.')).toBeVisible()
}

async function publishGeneralPoll(
  page: Page,
  question: string,
  choices: [string, string],
) {
  await openPolls(page)
  await page.getByRole('button', { name: 'Nova enquete' }).click()
  await page.getByLabel('Pergunta').fill(question)
  await page
    .getByRole('textbox', { name: 'Opção 1', exact: true })
    .fill(choices[0])
  await page
    .getByRole('textbox', { name: 'Opção 2', exact: true })
    .fill(choices[1])
  await page.getByRole('button', { name: 'Publicar enquete' }).click()
  await expect(page.getByText('Enquete publicada.')).toBeVisible()
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
  await page
    .getByRole('checkbox', { name: 'Beach tennis', exact: true })
    .check()
  await page.getByRole('checkbox', { name: 'Futevôlei', exact: true }).check()
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

async function login(page: Page, account: { email: string; password: string }) {
  await page.goto('/entrar')
  await page.getByLabel('E-mail').fill(account.email)
  await page.getByLabel('Senha').fill(account.password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('heading', { name: 'Meu perfil' })).toBeVisible()
}
