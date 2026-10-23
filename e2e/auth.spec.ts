import { expect, test } from '@playwright/test'

test.describe('account', () => {
  test('signs up, edits the profile, keeps the session and logs out', async ({
    page,
  }) => {
    const account = createAccount('ana')

    await page.goto('/cadastrar')
    await page.getByLabel('Nome', { exact: true }).fill('Ana José')
    await page.getByLabel('Nome de usuário').fill(account.username)
    await page.getByLabel('E-mail').fill(account.email)
    await page.getByLabel('Senha').fill(account.password)
    await page.getByRole('button', { name: 'Criar conta' }).click()

    await expect(
      page.getByRole('heading', { name: 'Meu perfil' }),
    ).toBeVisible()
    await expect(page.getByText('Ana José').first()).toBeVisible()
    await expect(page.getByText('Privado', { exact: true })).toBeVisible()

    await page.reload()
    await expect(
      page.getByRole('heading', { name: 'Meu perfil' }),
    ).toBeVisible()

    await page.getByRole('link', { name: 'Editar perfil' }).click()
    await page.getByLabel('Nome', { exact: true }).fill('Ana Souza')
    await page.getByRole('radio', { name: 'Público' }).check()
    await page.getByLabel('Fuso horário').selectOption('America/Manaus')
    await page.getByRole('button', { name: 'Salvar', exact: true }).click()

    await expect(
      page.getByRole('heading', { name: 'Meu perfil' }),
    ).toBeVisible()
    await expect(page.getByText('Ana Souza').first()).toBeVisible()
    await expect(page.getByText('Público', { exact: true })).toBeVisible()
    await expect(page.getByText('America/Manaus')).toBeVisible()

    await page.getByRole('button', { name: 'Sair' }).click()
    await page.goto('/perfil')
    await expect(page).toHaveURL(/\/entrar$/)
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible()

    await page.getByLabel('E-mail').fill(account.email)
    await page.getByLabel('Senha').fill(account.password)
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(
      page.getByRole('heading', { name: 'Meu perfil' }),
    ).toBeVisible()
  })

  test('recovers the password from the local mailbox', async ({ page }) => {
    test.setTimeout(60_000)
    const account = createAccount('bia')

    await page.goto('/cadastrar')
    await page.getByLabel('Nome', { exact: true }).fill('Bia')
    await page.getByLabel('Nome de usuário').fill(account.username)
    await page.getByLabel('E-mail').fill(account.email)
    await page.getByLabel('Senha').fill(account.password)
    await page.getByRole('button', { name: 'Criar conta' }).click()
    await expect(
      page.getByRole('heading', { name: 'Meu perfil' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Sair' }).click()

    await page.goto('/recuperar-senha')
    await page.getByLabel('E-mail').fill(account.email)
    await page.getByRole('button', { name: 'Enviar link' }).click()
    await expect(page.getByRole('status')).toContainText('enviamos um link')

    const link = await recoveryLink(account.email)
    await page.goto(link)
    await expect(
      page.getByRole('heading', { name: 'Redefinir senha' }),
    ).toBeVisible()
    await page.getByLabel('Nova senha').fill('senha-nova-123')
    await page.getByRole('button', { name: 'Salvar senha' }).click()
    await expect(
      page.getByRole('heading', { name: 'Meu perfil' }),
    ).toBeVisible()

    await page.getByRole('button', { name: 'Sair' }).click()
    await page.goto('/entrar')
    await page.getByLabel('E-mail').fill(account.email)
    await page.getByLabel('Senha').fill('senha-nova-123')
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(
      page.getByRole('heading', { name: 'Meu perfil' }),
    ).toBeVisible()
  })
})

function createAccount(label: string) {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  return {
    email: `${label}-${suffix}@padre.test`,
    username: `${label}${suffix}`.replace(/[^a-z0-9_]/g, '').slice(0, 30),
    password: 'senha-segura',
  }
}

async function recoveryLink(email: string) {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const search = await fetch(
      `http://127.0.0.1:54324/api/v1/search?query=${encodeURIComponent(email)}`,
    )
    const body = (await search.json()) as {
      messages?: { ID?: string }[]
    }
    const id = body.messages?.[0]?.ID
    if (id) {
      const message = await fetch(`http://127.0.0.1:54324/api/v1/message/${id}`)
      const detail = (await message.json()) as { HTML?: string; Text?: string }
      const source = `${detail.HTML ?? ''}\n${detail.Text ?? ''}`.replaceAll(
        '&amp;',
        '&',
      )
      const links = [...source.matchAll(/https?:\/\/[^\s"'<>]+/g)].map(
        (match) => match[0],
      )
      const link = links.find(
        (candidate) =>
          candidate.includes('/verify') || candidate.includes('token='),
      )
      if (link) return link
    }
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
  throw new Error(
    `O e-mail de recuperação para ${email} não chegou ao Mailpit.`,
  )
}
