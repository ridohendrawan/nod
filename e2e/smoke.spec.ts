import { expect, test } from '@playwright/test'

test('Dan’s app loads with a heading', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('h1')).toBeVisible()
})

test('a /o/<token> link serves Sarah’s page, not Dan’s app', async ({ page }) => {
  await page.goto('/o/example-token')
  await expect(page).toHaveTitle(/change to your job/i)
  await expect(page.locator('h1')).toBeVisible()
})
