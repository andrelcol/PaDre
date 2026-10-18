import { expect, test } from '@playwright/test'

test('two accounts become friends', async ({ browser }) => {
  test.setTimeout(90_000)
  const ana = createAccount('ana')
  const bia = createAccount('bia')
  const contextA = await browser.newContext({
    viewport: { width: 390, height: 844 },
  })
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()

  try {
    await signup(pageA, ana, 'Ana')
    await signup(pageB, bia, 'Bia')

    await pageA.goto('/amigos')
    await pageA.getByLabel('Nome de usuário').fill(bia.username)
    await pageA.getByRole('button', { name: 'Enviar solicitação' }).click()
    await expect(pageA.getByRole('status').last()).toContainText(
      'Solicitação enviada.',
    )
    await expect(
      pageA.getByRole('list', { name: 'Solicitações enviadas' }),
    ).toContainText(bia.username)

    await pageB.goto('/amigos')
    await expect(
      pageB.getByRole('list', { name: 'Solicitações recebidas' }),
    ).toContainText(ana.username)
    await pageB.getByRole('button', { name: 'Aceitar' }).click()
    await expect(pageB.getByRole('status').last()).toContainText(
      'Amizade confirmada.',
    )
    await expect(
      pageB.getByRole('list', { name: 'Meus amigos' }),
    ).toContainText(ana.username)

    await pageA.reload()
    await expect(
      pageA.getByRole('list', { name: 'Meus amigos' }),
    ).toContainText(bia.username)
  } finally {
    await contextA.close()
    await contextB.close()
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
  page: import('@playwright/test').Page,
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
