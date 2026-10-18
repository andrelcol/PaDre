import { expect, test } from '@playwright/test'

test('home page shows the product and the opening sports', async ({ page }) => {
  await page.goto('/')

  await expect(
    page.getByRole('heading', { level: 1, name: 'PaDre' }),
  ).toBeVisible()
  await expect(page.getByRole('list', { name: 'Modalidades' })).toBeVisible()
  await page.getByRole('button', { name: 'Futsal', exact: true }).click()
  await page.getByRole('button', { name: 'Futsal 5x5' }).click()
  await expect(page.getByText('O placar é de gols.')).toBeVisible()
  await page.getByRole('button', { name: 'Beach tennis', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Beach tennis individual' }),
  ).toBeVisible()
  await expect(
    page.getByText('Partidas entram nas próximas etapas.'),
  ).toBeVisible()
})
