import { expect, test } from '@playwright/test'

test('home page shows the product and the opening sports', async ({ page }) => {
  await page.goto('/')

  await expect(
    page.getByRole('heading', { level: 1, name: 'PaDre' }),
  ).toBeVisible()
  await expect(
    page.getByRole('list', { name: 'Modalidades iniciais' }),
  ).toBeVisible()
  await expect(page.getByText('Futsal')).toBeVisible()
  await expect(page.getByText('Beach tennis')).toBeVisible()
  await expect(
    page.getByText('Encontros e partidas entram nas próximas etapas.'),
  ).toBeVisible()
})
