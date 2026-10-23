import { expect, test, type Page } from '@playwright/test'

const mobile = { width: 390, height: 844 }
const desktop = { width: 1280, height: 800 }

test('community rates a volleyball card and profile details stay private', async ({
  browser,
}) => {
  test.setTimeout(240_000)
  const andre = createAccount('andre')
  const paulo = createAccount('paulo')
  const lucas = createAccount('lucas')
  const rafael = createAccount('rafael')
  const eva = createAccount('eva')
  const communityName = `Volei ${andre.username.slice(-4)}`
  const contexts = await Promise.all(
    [0, 1, 2, 3, 4].map(() => browser.newContext({ viewport: mobile })),
  )
  const [owner, admin, member, extra, outsider] = await Promise.all(
    contexts.map((context) => context.newPage()),
  )

  try {
    await signup(owner!, andre, 'Andre')
    await owner!.goto('/comunidades/nova')
    await owner!.getByLabel('Nome').fill(communityName)
    await owner!.getByLabel('Descrição').fill('Grupo de vôlei')
    await owner!.getByRole('radio', { name: 'Pública', exact: true }).check()
    await owner!.getByRole('checkbox', { name: 'Vôlei', exact: true }).check()
    await owner!.getByRole('button', { name: 'Criar comunidade' }).click()
    await expect(
      owner!.getByRole('heading', { name: communityName }),
    ).toBeVisible()
    const communityPath = new URL(owner!.url()).pathname

    await owner!.getByRole('tab', { name: 'Cartinhas' }).click()
    const names = ['Saque', 'Passe', 'Ataque', 'Defesa', 'Levantamento']
    await owner!.getByRole('button', { name: 'Adicionar atributo' }).click()
    await owner!.getByRole('button', { name: 'Adicionar atributo' }).click()
    for (const [index, name] of names.entries()) {
      await owner!.getByLabel(`Nome do atributo ${index + 1}`).fill(name)
    }
    await owner!
      .getByRole('heading', { name: 'Configurar atributos' })
      .scrollIntoViewIfNeeded()
    await owner!.screenshot({
      path: 'demo/player-cards/06-configuracao-atributos.png',
    })
    await owner!.getByRole('button', { name: 'Salvar rascunho' }).click()
    await expect(owner!.getByText('Rascunho salvo.')).toBeVisible()
    await owner!.getByRole('button', { name: 'Publicar' }).click()
    await expect(owner!.getByText('Configuração publicada.')).toBeVisible()

    await signup(admin!, paulo, 'Paulo')
    await admin!.goto(communityPath)
    await admin!.getByRole('button', { name: 'Entrar' }).click()
    await expect(admin!.getByText('Você entrou na comunidade.')).toBeVisible()
    await admin!.getByRole('tab', { name: 'Cartinhas' }).click()
    await admin!
      .getByRole('button', { name: 'Ativar minha cartinha', exact: true })
      .click()
    await expect(
      admin!.getByText('Aguardando avaliações suficientes'),
    ).toBeVisible()
    await shootCard(admin!, 'demo/player-cards/08-aguardando-avaliacoes.png')

    await signup(member!, lucas, 'Lucas')
    await member!.goto(communityPath)
    await member!.getByRole('button', { name: 'Entrar' }).click()
    await expect(member!.getByText('Você entrou na comunidade.')).toBeVisible()
    await signup(extra!, rafael, 'Rafael')
    await extra!.goto(communityPath)
    await extra!.getByRole('button', { name: 'Entrar' }).click()
    await expect(extra!.getByText('Você entrou na comunidade.')).toBeVisible()

    await rate(owner!, communityPath, [80, 70, 80, 60, 90])
    await rate(member!, communityPath, [90, 70, 80, 60, 90])
    await expect(
      admin!.getByText('Aguardando avaliações suficientes'),
    ).toBeVisible()
    await rate(extra!, communityPath, [85, 70, 80, 60, 90])

    await admin!.reload()
    await admin!.getByRole('tab', { name: 'Cartinhas' }).click()
    await expect(admin!.getByText('85')).toBeVisible()
    await expect(admin!.getByText('77')).toBeVisible()
    await expect(admin!.getByText('André:')).toHaveCount(0)
    await shootCard(admin!, 'demo/player-cards/03-cartinha-celular.png')

    await owner!.reload()
    await owner!.getByRole('tab', { name: 'Cartinhas' }).click()
    await owner!.locator('label:visible', { hasText: 'Escuro' }).first().click()
    await expect(owner!.getByText('85')).toBeVisible()
    await shootCard(owner!, 'demo/player-cards/02-cartinha-escura.png')
    await owner!.locator('label:visible', { hasText: 'Claro' }).first().click()
    await shootCard(owner!, 'demo/player-cards/01-cartinha-clara.png')

    await owner!
      .getByRole('button', { name: 'Abrir cartinha de Paulo' })
      .click()
    await owner!.screenshot({ path: 'demo/player-cards/05-avaliacao.png' })
    await owner!
      .getByLabel('Atributo', { exact: true })
      .selectOption({ label: 'Saque' })
    await owner!.getByLabel('Nota de 1 a 99').fill('95')
    await owner!.getByRole('button', { name: 'Registrar nota' }).click()
    await expect(owner!.getByText('Avaliação registrada.')).toBeVisible()
    await expect(owner!.getByText('90').first()).toBeVisible()

    await admin!
      .getByRole('button', { name: 'Abrir cartinha de Paulo' })
      .click()
    await admin!.getByLabel('Nota de 1 a 99').fill('40')
    await admin!.getByRole('button', { name: 'Registrar nota' }).click()
    await expect(admin!.getByText('not allowed')).toBeVisible()

    await signup(outsider!, eva, 'Eva')
    await outsider!.goto(communityPath)
    await expect(
      outsider!.getByRole('heading', { name: communityName }),
    ).toBeVisible()
    await expect(outsider!.getByRole('tab', { name: 'Cartinhas' })).toHaveCount(
      0,
    )
    await expect(outsider!.getByText('Overall')).toHaveCount(0)

    await admin!
      .getByRole('button', { name: 'Desativar minha cartinha', exact: true })
      .click()
    await expect(admin!.getByText('Nenhuma cartinha ativa.')).toBeVisible()

    await owner!.goto('/perfil/editar')
    await owner!.getByLabel('Altura em centímetros').fill('175')
    await owner!
      .getByLabel('Sexo', { exact: true })
      .selectOption({ label: 'Masculino' })
    await owner!.getByLabel('Mostrar altura no perfil público').check()
    await owner!
      .getByRole('button', { name: 'Salvar dados esportivos' })
      .click()
    await expect(owner!.getByText('Dados esportivos salvos.')).toBeVisible()
    await owner!.locator('#avatar-file').setInputFiles({
      name: 'foto.png',
      mimeType: 'image/png',
      buffer: Buffer.from('png'),
    })
    await expect(owner!.getByText(/não está disponível/)).toBeVisible()
    await owner!.goto('/perfil')
    await expect(owner!.getByText('175 cm')).toBeVisible()
    await expect(owner!.getByText('Masculino')).toBeVisible()
    await owner!.getByText('175 cm').scrollIntoViewIfNeeded()
    await owner!.screenshot({
      path: 'demo/player-cards/07-perfil-com-foto.png',
    })

    await owner!.setViewportSize(desktop)
    await owner!.goto(communityPath)
    await owner!.getByRole('tab', { name: 'Cartinhas' }).click()
    await expect(owner!.getByText('Nenhuma cartinha ativa.')).toBeVisible()
    await admin!
      .getByRole('button', { name: 'Ativar minha cartinha', exact: true })
      .click()
    await expect(
      admin!.getByText('Aguardando avaliações suficientes'),
    ).toBeVisible()
    await owner!.reload()
    await owner!.getByRole('tab', { name: 'Cartinhas' }).click()
    await expect(
      owner!.getByText('Aguardando avaliações suficientes'),
    ).toBeVisible()
    await shootCard(owner!, 'demo/player-cards/04-cartinha-desktop.png')
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

async function shootCard(page: Page, path: string) {
  await page
    .getByRole('article', { name: 'Cartinha de Paulo' })
    .scrollIntoViewIfNeeded()
  await page.screenshot({ path })
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
  await expect(page.getByRole('heading', { name: 'Meu perfil' })).toBeVisible({
    timeout: 15_000,
  })
}

async function rate(page: Page, communityPath: string, scores: number[]) {
  const names = ['Saque', 'Passe', 'Ataque', 'Defesa', 'Levantamento']
  await page.goto(communityPath)
  await page.getByRole('tab', { name: 'Cartinhas' }).click()
  await page.getByRole('button', { name: 'Abrir cartinha de Paulo' }).click()
  for (const [index, score] of scores.entries()) {
    await page
      .getByLabel('Atributo', { exact: true })
      .selectOption({ label: names[index] })
    await page.getByLabel('Nota de 1 a 99').fill(String(score))
    await page.getByRole('button', { name: 'Registrar nota' }).click()
    await expect(page.getByText('Avaliação registrada.')).toBeVisible()
  }
}
