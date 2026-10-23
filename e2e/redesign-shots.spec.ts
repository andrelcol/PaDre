import { expect, test, type Page } from '@playwright/test'

const mobile = { width: 390, height: 844 }

test('captures the redesigned screens without real personal data', async ({
  browser,
}) => {
  test.setTimeout(180_000)
  const context = await browser.newContext({ viewport: mobile })
  const page = await context.newPage()
  const account = createAccount()

  try {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'PaDre' })).toBeVisible()
    await shot(page, '01-home-visitante')

    await page.goto('/entrar')
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible()
    await shot(page, '02-entrar')

    await page.goto('/cadastrar')
    await expect(
      page.getByRole('heading', { name: 'Criar conta' }),
    ).toBeVisible()
    await shot(page, '03-cadastrar')

    await page.getByLabel('Nome', { exact: true }).fill('Ana')
    await page.getByLabel('Nome de usuário').fill(account.username)
    await page.getByLabel('E-mail').fill(account.email)
    await page.getByLabel('Senha').fill(account.password)
    await page.getByRole('button', { name: 'Criar conta' }).click()
    await expect(
      page.getByRole('heading', { name: 'Meu perfil' }),
    ).toBeVisible()
    await shot(page, '04-perfil')

    await page.goto('/amigos')
    await expect(
      page.getByRole('heading', { name: 'Amigos', exact: true }),
    ).toBeVisible()
    await shot(page, '05-amigos')

    await page.goto('/encontros')
    await expect(
      page.getByRole('heading', { name: 'Encontros', exact: true }),
    ).toBeVisible()
    await expect(page.getByText('Nenhum encontro futuro.')).toBeVisible()
    await shot(page, '06-encontros')

    await page.goto('/encontros/novo')
    await expect(
      page.getByRole('heading', { name: 'Novo encontro' }),
    ).toBeVisible()
    await shot(page, '07-novo-encontro')

    await page.getByLabel('Modalidade').selectOption({ label: 'Vôlei' })
    await page.getByLabel('Formato').selectOption({ label: 'Vôlei 6x6' })
    await page.getByLabel('Título').fill('Treino visual')
    await page.getByLabel('Local').fill('Quadra do clube')
    await page.getByRole('button', { name: 'Criar encontro' }).click()
    await expect(
      page.getByRole('heading', { name: 'Treino visual' }),
    ).toBeVisible()
    await shot(page, '08-encontro')
    await page
      .getByRole('heading', { name: 'Partidas' })
      .scrollIntoViewIfNeeded()
    await shot(page, '09-partidas')

    await page.goto('/comunidades')
    await expect(
      page.getByRole('heading', { name: 'Comunidades', exact: true }),
    ).toBeVisible()
    await shot(page, '10-comunidades')

    await page.goto('/comunidades/nova')
    await page.getByLabel('Nome').fill(`Grupo ${account.username.slice(-4)}`)
    await page.getByLabel('Descrição').fill('Grupo de quadra')
    await page.getByRole('radio', { name: 'Pública', exact: true }).check()
    await page.getByRole('checkbox', { name: 'Vôlei', exact: true }).check()
    await page.getByRole('button', { name: 'Criar comunidade' }).click()
    await expect(page.getByRole('heading', { name: /Grupo/ })).toBeVisible()
    await shot(page, '11-comunidade')

    await page.getByRole('tab', { name: 'Chat' }).click()
    await shot(page, '12-chat')
    await page.getByRole('tab', { name: 'Enquetes' }).click()
    await shot(page, '13-enquetes')
    await page.getByRole('tab', { name: 'Locais' }).click()
    await shot(page, '14-locais-comunidade')

    await page.goto('/locais')
    await expect(
      page.getByRole('heading', { name: 'Locais', exact: true }),
    ).toBeVisible()
    await shot(page, '15-locais')

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'PaDre' })).toBeVisible()
    await shot(page, '16-home-desktop')
  } finally {
    await context.close()
  }
})

async function shot(page: Page, name: string) {
  await page.screenshot({
    path: `demo/redesign/${name}.png`,
  })
}

function createAccount() {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  return {
    email: `ana-${suffix}@padre.test`,
    username: `ana${suffix}`.replace(/[^a-z0-9_]/g, '').slice(0, 30),
    password: 'senha-segura',
  }
}
