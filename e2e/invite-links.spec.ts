import { expect, test, type Page } from '@playwright/test'

test('a guest signs up from a link, joins, and a revoked link stops the next person', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const ana = createAccount('ana')
  const bia = createAccount('bia')
  const caio = createAccount('caio')
  const organizer = await browser.newContext()
  const guest = await browser.newContext({
    viewport: { width: 390, height: 844 },
  })
  const stranger = await browser.newContext()
  const pageA = await organizer.newPage()
  const pageB = await guest.newPage()
  const pageC = await stranger.newPage()

  try {
    await signup(pageA, ana, 'Ana')
    const link = await createSharedMeetup(pageA)

    await pageB.goto(link)
    await expect(
      pageB.getByRole('heading', { name: 'Vôlei na quadra' }),
    ).toBeVisible()
    await expect(pageB.getByText('Vôlei 6x6')).toBeVisible()
    await expect(pageB.getByText('Quadra do clube')).toBeVisible()
    await expect(pageB.getByText('Rua das Flores, 10')).toHaveCount(0)
    await expect(pageB.getByText(ana.username)).toHaveCount(0)
    await pageB
      .getByRole('main')
      .getByRole('link', { name: 'Criar conta' })
      .click()
    await signup(pageB, bia, 'Bia')
    await expect(
      pageB.getByRole('heading', { name: 'Vôlei na quadra' }),
    ).toBeVisible()
    await pageB.getByRole('button', { name: 'Confirmar presença' }).click()
    await expect(pageB.getByText('Presença confirmada.')).toBeVisible()

    await pageA.reload()
    await expect(
      pageA.getByRole('list', { name: 'Participantes confirmados' }),
    ).toContainText(bia.username)

    await pageA.getByRole('button', { name: 'Revogar link' }).click()
    await pageA.getByRole('button', { name: 'Confirmar revogação' }).click()
    await expect(pageA.getByText('Link revogado.')).toBeVisible()
    await expect(
      pageA.getByRole('list', { name: 'Participantes confirmados' }),
    ).toContainText(bia.username)

    await pageC.goto(link)
    await expect(
      pageC.getByText('Este convite não está mais disponível.'),
    ).toBeVisible()
    await expect(
      pageC.getByRole('button', { name: 'Confirmar presença' }),
    ).toHaveCount(0)
    await signup(pageC, caio, 'Caio')
    await pageC.goto(link)
    await expect(
      pageC.getByText('Este convite não está mais disponível.'),
    ).toBeVisible()
    await expect(
      pageC.getByRole('button', { name: 'Confirmar presença' }),
    ).toHaveCount(0)
  } finally {
    await organizer.close()
    await guest.close()
    await stranger.close()
  }
})

test('someone who is already signed in joins from the link', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const ana = createAccount('ana')
  const bia = createAccount('bia')
  const organizer = await browser.newContext()
  const guest = await browser.newContext({
    viewport: { width: 390, height: 844 },
  })
  const pageA = await organizer.newPage()
  const pageB = await guest.newPage()

  try {
    await signup(pageA, ana, 'Ana')
    await signup(pageB, bia, 'Bia')
    const link = await createSharedMeetup(pageA)

    await pageB.goto(link)
    await expect(pageB.getByRole('link', { name: 'Criar conta' })).toHaveCount(
      0,
    )
    await pageB.getByRole('button', { name: 'Confirmar presença' }).click()
    await expect(pageB.getByText('Presença confirmada.')).toBeVisible()
    await pageB.getByRole('link', { name: 'Ver encontro' }).click()
    await expect(
      pageB.getByRole('list', { name: 'Participantes confirmados' }),
    ).toContainText(ana.username)
    await expect(
      pageB.getByRole('list', { name: 'Participantes confirmados' }),
    ).toContainText(bia.username)
  } finally {
    await organizer.close()
    await guest.close()
  }
})

async function createSharedMeetup(page: Page) {
  await page.goto('/encontros/novo')
  await page.getByLabel('Modalidade').selectOption({ label: 'Vôlei' })
  await page.getByLabel('Formato').selectOption({ label: 'Vôlei 6x6' })
  await page.getByLabel('Título').fill('Vôlei na quadra')
  await page.getByLabel('Local').fill('Quadra do clube')
  await page.getByLabel('Endereço').fill('Rua das Flores, 10')
  await page.getByLabel('Capacidade, incluindo quem organiza').fill('8')
  await page.getByRole('button', { name: 'Criar encontro' }).click()
  await expect(
    page.getByRole('heading', { name: 'Vôlei na quadra' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Gerar link' }).click()
  await page.getByRole('button', { name: 'Confirmar novo link' }).click()
  await expect(page.getByText('Link gerado.')).toBeVisible()
  const link = await page.getByLabel('Link do convite').inputValue()
  expect(link).toContain('/convite/')
  await page.reload()
  await expect(page.getByLabel('Link do convite')).toHaveCount(0)
  await expect(
    page.getByText('não fica guardado para copiar de novo'),
  ).toBeVisible()
  return link
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
  if (!page.url().includes('/cadastrar')) await page.goto('/cadastrar')
  await page.getByLabel('Nome', { exact: true }).fill(name)
  await page.getByLabel('Nome de usuário').fill(account.username)
  await page.getByLabel('E-mail').fill(account.email)
  await page.getByLabel('Senha').fill(account.password)
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await expect(
    page.getByRole('heading', { name: /Meu perfil|Vôlei na quadra/ }),
  ).toBeVisible()
}
