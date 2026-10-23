import { expect, test, type Page } from '@playwright/test'

test('saved theme is applied before paint and survives reload', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('padre.theme', 'dark')
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.getByRole('radio', { name: 'Escuro' })).toBeChecked()
})

test('theme choice follows the system only while Sistema is selected', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await expect(page.getByRole('radio', { name: 'Sistema' })).toBeChecked()
  await expect(page.locator('html')).toHaveClass(/dark/)

  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).not.toHaveClass(/dark/)

  await chooseTheme(page, 'Claro')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).not.toHaveClass(/dark/)

  await chooseTheme(page, 'Escuro')
  await page.reload()
  await expect(page.getByRole('radio', { name: 'Escuro' })).toBeChecked()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveClass(/dark/)
})

test('the selector works on a phone and a desktop, including after logout', async ({
  page,
}) => {
  const account = createAccount()
  await page.setViewportSize({ width: 390, height: 844 })
  await signup(page, account)
  await chooseTheme(page, 'Escuro')
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.getByRole('button', { name: 'Sair', exact: true }).click()
  await expect(page.getByRole('radio', { name: 'Escuro' })).toBeChecked()
  await expect(page.locator('html')).toHaveClass(/dark/)

  await page.setViewportSize({ width: 1440, height: 900 })
  await chooseTheme(page, 'Claro')
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await login(page, account)
  await expect(page.getByRole('radio', { name: 'Claro' })).toBeChecked()
  await expect(page.locator('html')).not.toHaveClass(/dark/)
})

async function chooseTheme(page: Page, name: 'Claro' | 'Escuro' | 'Sistema') {
  await page.locator('label').filter({ hasText: name }).click()
}

function createAccount() {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  return {
    email: `tema-${suffix}@padre.test`,
    username: `tema${suffix}`.replace(/[^a-z0-9_]/g, '').slice(0, 30),
    password: 'senha-segura',
  }
}

async function signup(
  page: Page,
  account: { email: string; username: string; password: string },
) {
  await page.goto('/cadastrar')
  await page.getByLabel('Nome', { exact: true }).fill('Tema')
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
