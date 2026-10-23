import { expect, test, type Page } from '@playwright/test'

const mobile = { width: 390, height: 844 }

test('captures light and dark screens without real personal data', async ({
  browser,
}) => {
  test.setTimeout(180_000)
  const context = await browser.newContext({ viewport: mobile })
  const page = await context.newPage()
  const account = createAccount()

  try {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'PaDre' })).toBeVisible()
    await shot(page, '01-home-clara')
    await choose(page, 'Escuro')
    await shot(page, '02-home-escura')

    await signup(page, account)
    await choose(page, 'Claro')
    await shot(page, '03-perfil-claro')
    await choose(page, 'Escuro')
    await shot(page, '04-perfil-escuro')

    await page.goto('/encontros')
    await expect(
      page.getByRole('heading', { name: 'Encontros', exact: true }),
    ).toBeVisible()
    await choose(page, 'Claro')
    await expect(page.getByText('Nenhum encontro futuro.')).toBeVisible()
    await shot(page, '05-encontros-claros')

    await page.goto('/encontros/novo')
    await page.getByLabel('Modalidade').selectOption({ label: 'Vôlei' })
    await page.getByLabel('Formato').selectOption({ label: 'Vôlei 6x6' })
    await page.getByLabel('Título').fill('Treino noturno')
    await page.getByLabel('Local').fill('Quadra do clube')
    await page.getByRole('button', { name: 'Criar encontro' }).click()
    await expect(
      page.getByRole('heading', { name: 'Treino noturno' }),
    ).toBeVisible()
    await choose(page, 'Claro')
    await shot(page, '07-encontro-claro')
    await choose(page, 'Escuro')
    await shot(page, '08-encontro-escuro')

    await page.goto('/encontros')
    await expect(
      page
        .getByRole('list', { name: 'Meus próximos encontros' })
        .getByRole('link', { name: /Treino noturno/ }),
    ).toBeVisible()
    await shot(page, '06-encontros-escuros')

    await page.goto('/comunidades/nova')
    await page.getByLabel('Nome').fill(`Noite ${account.username.slice(-4)}`)
    await page.getByLabel('Descrição').fill('Grupo de quadra')
    await page.getByRole('radio', { name: 'Pública', exact: true }).check()
    await page.getByRole('checkbox', { name: 'Vôlei', exact: true }).check()
    await page.getByRole('button', { name: 'Criar comunidade' }).click()
    await expect(page.getByRole('heading', { name: /Noite/ })).toBeVisible()
    await choose(page, 'Claro')
    await shot(page, '09-comunidade-clara')
    await choose(page, 'Escuro')
    await shot(page, '10-comunidade-escura')
    await page.getByRole('tab', { name: 'Chat' }).click()
    await shot(page, '11-chat-escuro')
    await page.getByRole('tab', { name: 'Enquetes' }).click()
    await shot(page, '12-enquete-escura')

    await page.goto('/locais')
    await expect(
      page.getByRole('heading', { name: 'Locais', exact: true }),
    ).toBeVisible()
    await shot(page, '13-locais-escuros')

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'PaDre' })).toBeVisible()
    await choose(page, 'Claro')
    await shot(page, '14-home-desktop-clara')
    await choose(page, 'Escuro')
    await shot(page, '15-home-desktop-escura')
    await page.goto('/encontros')
    await page
      .getByRole('list', { name: 'Meus próximos encontros' })
      .getByRole('link', { name: /Treino noturno/ })
      .click()
    await expect(
      page.getByRole('heading', { name: 'Treino noturno' }),
    ).toBeVisible()
    await shot(page, '16-encontro-desktop-escuro')
  } finally {
    await context.close()
  }
})

async function choose(page: Page, name: 'Claro' | 'Escuro') {
  await page.locator('label').filter({ hasText: name }).click()
  if (name === 'Escuro') {
    await expect(page.locator('html')).toHaveClass(/dark/)
  } else {
    await expect(page.locator('html')).not.toHaveClass(/dark/)
  }
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `demo/dark-mode/${name}.png` })
}

function createAccount() {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  return {
    email: `noite-${suffix}@padre.test`,
    username: `noite${suffix}`.replace(/[^a-z0-9_]/g, '').slice(0, 30),
    password: 'senha-segura',
  }
}

async function signup(
  page: Page,
  account: { email: string; username: string; password: string },
) {
  await page.goto('/cadastrar')
  await page.getByLabel('Nome', { exact: true }).fill('Noite')
  await page.getByLabel('Nome de usuário').fill(account.username)
  await page.getByLabel('E-mail').fill(account.email)
  await page.getByLabel('Senha').fill(account.password)
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await expect(page.getByRole('heading', { name: 'Meu perfil' })).toBeVisible()
}
