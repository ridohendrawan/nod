// M5: the demo stage (ux-spec 8; D24). Dan's phone and Sarah's phone side by side on a laptop;
// "Text it to Sarah" lands on her lock screen, and tapping the text opens her page. Both phones
// keep Brisbane time, and Dan's greeting follows the clock on his.
import { expect, test } from '@playwright/test'

const dir = process.env.SCREENS_DIR

test('the demo stage: Dan texts Sarah, and her phone shows it', async ({ browser }, info) => {
  test.setTimeout(60_000)
  const context = await browser.newContext({
    baseURL: String(info.project.use.baseURL ?? 'http://localhost:5173'),
    viewport: { width: 1440, height: 900 },
    isMobile: false,
    hasTouch: false,
    deviceScaleFactor: dir ? 2 : 1,
    reducedMotion: 'reduce',
  })
  const page = await context.newPage()
  await page.goto('/demo')
  await expect(page).toHaveTitle('Nod demo stage')
  await expect(page.getByText('No new messages')).toBeVisible()

  const dan = page.frameLocator('iframe[title="Dan’s phone: Nod"]')
  await dan.getByRole('link', { name: /^Sarah Chen, kitchen renovation/ }).click()
  await dan.getByRole('link', { name: 'Record a change' }).click()
  await dan.getByRole('button', { name: 'Try a sample note' }).click()
  await dan.getByRole('button', { name: 'One change', exact: true }).click()
  await dan.getByRole('button', { name: 'Draft the variation' }).click()
  await dan.getByRole('radio', { name: 'With the next progress claim' }).check()
  await dan.getByRole('button', { name: 'Send to Sarah' }).click()
  await dan.getByRole('button', { name: 'Text it to Sarah' }).click()
  await expect(dan.getByRole('button', { name: 'Sent to Sarah’s phone (demo)' })).toBeVisible()

  const note = page.getByRole('button', {
    name: /^Messages now Dan \(Brightside Renovations\) Hi Sarah/,
  })
  await expect(note).toBeVisible()
  if (dir) await page.screenshot({ path: `${dir}/60-stage-texted.png` })
  await note.click()

  const sarah = page.frameLocator('iframe[title="Sarah’s phone: her page"]')
  await expect(sarah.getByRole('heading', { level: 1 })).toContainText('needs your OK')
  // Dan's sheet hears her open it.
  await expect(
    dan.getByRole('dialog', { name: 'Ready for Sarah' }).getByText(/^Sarah opened it at /),
  ).toBeVisible({ timeout: 6000 })
  if (dir) {
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${dir}/61-stage-sarah-open.png` })
  }

  await page.getByRole('button', { name: 'Reset Sarah’s phone' }).click()
  await expect(page.getByText('No new messages')).toBeVisible()
  await context.close()
})

test('on the stage, Dan’s greeting follows the Brisbane clock his phone shows', async ({
  browser,
}, info) => {
  // A presenter outside Queensland: 9:30 am in Jakarta is 12:30 pm in Brisbane.
  const context = await browser.newContext({
    baseURL: String(info.project.use.baseURL ?? 'http://localhost:5173'),
    viewport: { width: 1440, height: 900 },
    isMobile: false,
    hasTouch: false,
    timezoneId: 'Asia/Jakarta',
  })
  const page = await context.newPage()
  await page.clock.setFixedTime(new Date('2026-10-02T02:30:00Z'))
  await page.goto('/demo')
  const dan = page.frameLocator('iframe[title="Dan’s phone: Nod"]')
  await expect(dan.getByRole('heading', { level: 1 })).toHaveText('Afternoon, Dan')
  await expect(dan.getByText('Friday 2 October', { exact: true })).toBeVisible()
  await expect(page.locator('.phone-clock').first()).toHaveText('12:30')

  await context.close()

  // A real phone keeps its own clock: 9:30 in Jakarta is morning there.
  const phone = await browser.newContext({
    baseURL: String(info.project.use.baseURL ?? 'http://localhost:5173'),
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    timezoneId: 'Asia/Jakarta',
  })
  const own = await phone.newPage()
  await own.clock.setFixedTime(new Date('2026-10-02T02:30:00Z'))
  await own.goto('/')
  await expect(own.getByRole('heading', { level: 1 })).toHaveText('Morning, Dan')
  await phone.close()
})

test('the phones’ clocks turn over with the minute, and catch up when the tab is seen again', async ({
  browser,
}, info) => {
  const context = await browser.newContext({
    baseURL: String(info.project.use.baseURL ?? 'http://localhost:5173'),
    viewport: { width: 1440, height: 900 },
    isMobile: false,
    hasTouch: false,
  })
  const page = await context.newPage()
  await page.clock.install({ time: new Date('2026-10-02T13:36:30Z') }) // 11:36:30 pm in Brisbane
  await page.goto('/demo')
  const clocks = page.locator('.phone-clock')
  const lock = page.locator('.lock-time')
  await expect(clocks).toHaveCount(2)
  await page.clock.pauseAt(new Date('2026-10-02T13:36:59.500Z'))
  await expect(clocks).toHaveText(['11:36', '11:36'])
  await expect(lock).toHaveText('11:36')
  // Half a second into the new minute, every clock has turned over (Dan's sheet can say 11:37).
  await page.clock.runFor(1_000)
  await expect(clocks).toHaveText(['11:37', '11:37'])
  await expect(lock).toHaveText('11:37')

  // A tab in the background: its timers sleep while the time moves on. Seen again, it catches up.
  await page.clock.setSystemTime(new Date('2026-10-02T13:45:30Z'))
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect(clocks).toHaveText(['11:45', '11:45'])
  await expect(lock).toHaveText('11:45')
  await context.close()
})
