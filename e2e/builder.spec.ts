// M1: Dan's Jobs and Job screens, the menu, live resets across tabs, and reflow at 360 and 320.
// Nod is browser-only (D91): every test starts in a fresh context, so with freshly seeded data.
import { expect, test, type Page } from '@playwright/test'
import { kitchenCard, scrollsSideways } from './helpers.ts'

test('Jobs lists the three demo jobs with a greeting and a summary', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('Jobs: Nod')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    /^(Morning|Afternoon|Evening), Dan$/,
  )
  const jobs = page.getByRole('list', { name: 'Your jobs' }).getByRole('link')
  await expect(jobs).toHaveCount(3)
  await expect(kitchenCard(page)).toHaveAccessibleName(
    'Sarah Chen, kitchen renovation, Paddington, Queensland. All changes signed. Contract total $48,950.',
  )
  await expect(page.getByText('Everything’s signed')).toBeVisible()
  // The hero: everything under contract, and the jobs by what they need, in words.
  await expect(page.getByText('under contract on 3 jobs')).toBeVisible()
  await expect(page.getByRole('list', { name: 'Your jobs by status' })).toHaveText(
    /1 signed.*2 with no changes yet/,
  )
})

test('a browser new to Nod is told its demo jobs were set up', async ({ page }) => {
  await page.goto('/')
  await expect(
    page.getByText('This phone is new to Nod, so your demo jobs are set up fresh.'),
  ).toBeVisible()
})

test('a job shows its money, its variations and the Record bar', async ({ page }) => {
  await page.goto('/')
  await kitchenCard(page).click()
  await expect(page).toHaveURL(/\/job\/[0-9a-f-]{36}$/)
  await expect(page).toHaveTitle('Kitchen renovation: Nod')

  const h1 = page.getByRole('heading', { level: 1 })
  await expect(h1).toHaveText('Kitchen renovation')
  await expect(h1).toBeFocused() // route focus (D79)

  const money = page.getByRole('region', { name: 'Money' })
  await expect(money).toContainText('Contract total now')
  await expect(money).toContainText('$48,950')
  await expect(money).toContainText('Approved changes (1)')
  await expect(money).toContainText('+$1,450')
  await expect(money).toContainText('+1 day')
  await expect(money).toContainText('1 of 1signed')

  const row = page.getByRole('listitem').filter({ hasText: 'Full-height tiled splashback' })
  await expect(row).toContainText('V1')
  await expect(row).toContainText('Approved')
  await expect(page.getByRole('link', { name: 'Record a change' })).toBeVisible()
})

test('Back returns to the job card it came from', async ({ page }) => {
  await page.goto('/')
  await kitchenCard(page).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Kitchen renovation')
  await page.getByRole('link', { name: 'Jobs' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(kitchenCard(page)).toBeFocused()
})

test('Record a change opens Record, and Close goes back to the job', async ({ page }) => {
  await page.goto('/')
  await kitchenCard(page).click()
  await page.getByRole('link', { name: 'Record a change' }).click()
  await expect(page).toHaveTitle('Record a change: Nod')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('What’s changing?')
  await expect(page.getByText('Sarah’s kitchen renovation')).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Kitchen renovation')
})

test('the AI switch shows "AI off" in the header, and turns back off', async ({ page }) => {
  await page.goto('/')
  await expect(kitchenCard(page)).toBeVisible()
  await page.getByRole('button', { name: 'Menu' }).click()
  const toggle = page.getByRole('switch', { name: 'Pretend the AI is down' })
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByText('AI off', { exact: true })).toBeVisible()
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await expect(page.getByText('AI off', { exact: true })).toBeHidden()
})

test('About Nod explains the split and says it isn’t legal advice', async ({ page }) => {
  await page.goto('/')
  await expect(kitchenCard(page)).toBeVisible()
  const menuButton = page.getByRole('button', { name: 'Menu' })
  await menuButton.click()
  await page.getByRole('button', { name: 'About Nod' }).click()
  const about = page.getByRole('dialog', { name: 'About Nod' })
  await expect(about).toContainText('Nod checks the content. It isn’t legal advice.')
  await page.keyboard.press('Escape')
  await expect(about).toBeHidden()
  await expect(menuButton).toBeFocused()
})

test('a reset in one tab updates another open tab', async ({ context }) => {
  const other = await context.newPage()
  await other.goto('/')
  await kitchenCard(other).click()
  await expect(other.getByRole('heading', { level: 1 })).toHaveText('Kitchen renovation')

  const page = await context.newPage()
  await page.goto('/')
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('button', { name: 'Reset demo data' }).click()
  const confirm = page.getByRole('dialog', { name: 'Reset the demo?' })
  await expect(confirm).toContainText('links you’ve sent stop working')
  await confirm.getByRole('button', { name: 'Reset demo data' }).click()
  await expect(confirm).toBeHidden()
  await expect(page.getByRole('region', { name: 'Notifications' })).toContainText(
    'Demo data reset.',
  )

  // The other tab hears the poke (or polls within 8 s), says so once, and leaves the old job.
  const toasts = other.getByRole('region', { name: 'Notifications' })
  await expect(toasts).toContainText('Demo data reset.', { timeout: 20_000 })
  await expect(other).toHaveURL(/\/$/)
  await expect(toasts.getByText('Demo data reset.')).toHaveCount(1)
})

test('an unknown address says the page doesn’t exist', async ({ page }) => {
  await page.goto('/no-such-page')
  await expect(page).toHaveTitle('Page not found: Nod')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('This page doesn’t exist')
  await page.getByRole('link', { name: 'Back to your jobs' }).click()
  await expect(kitchenCard(page)).toBeVisible()
})

test('an unknown job says it isn’t here', async ({ page }) => {
  await page.goto('/job/00000000-0000-4000-8000-000000000000')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('This job isn’t here')
})

for (const width of [360, 320]) {
  test(`no sideways scrolling at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 })
    await page.goto('/')
    await expect(kitchenCard(page)).toBeVisible()
    expect(await scrollsSideways(page)).toBe(false)

    await kitchenCard(page).click()
    await expect(page.getByRole('region', { name: 'Money' })).toBeVisible()
    expect(await scrollsSideways(page)).toBe(false)
    // The cover photo fills its box, with no placeholder tiling under it (ai-misses 27).
    const [box, photo] = await page
      .locator('.job-cover')
      .evaluate((el) => [
        el.getBoundingClientRect().height,
        el.querySelector('img')?.getBoundingClientRect().height ?? 0,
      ])
    expect(photo).toBe(box)

    await page.getByRole('link', { name: 'Record a change' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('What’s changing?')
    expect(await scrollsSideways(page)).toBe(false)

    await page.goto('/no-such-page')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(await scrollsSideways(page)).toBe(false)
  })
}

/** Jobs and a job at 320 px with text at 200%: nothing scrolls sideways. */
async function reflowsAt200(page: Page) {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      document.documentElement.style.fontSize = '200%'
    })
  })
  await page.goto('/')
  await expect(kitchenCard(page)).toBeVisible()
  expect(await scrollsSideways(page)).toBe(false)

  await kitchenCard(page).click()
  await expect(page.getByRole('region', { name: 'Money' })).toBeVisible()
  expect(await scrollsSideways(page)).toBe(false)
}

test('no sideways scrolling at 320 px with text at 200%', async ({ page }) => {
  await reflowsAt200(page)
})

test('no sideways scrolling at 320 px with text at 200%, in the font shown before Inter loads', async ({
  page,
}) => {
  // Inter swaps in when it arrives (font-display: swap); until then the system font shows, and
  // it's wider. Make sure it really is the system font that's measured.
  await page.route(/\.woff2(\?.*)?$/, (route) => route.abort())
  await reflowsAt200(page)
  expect(
    await page.evaluate(() => [...document.fonts].map((f) => `${f.family} ${f.status}`)),
  ).toEqual(['Inter error'])
})
