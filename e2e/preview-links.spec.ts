// Preview links (src/app/preview): /screens/<name> sets up one screen by itself, for a design tool
// that imports a page by its address. Each link is opened as such a tool would, and must land on
// the screen it promises without the AI function ever being called.
import { expect, test, type Page } from '@playwright/test'

const h1 = (page: Page) => page.getByRole('heading', { level: 1 })
const dialog = (page: Page, name: string) => page.getByRole('dialog', { name })

type Check = (page: Page) => Promise<void>

const DAN: [string, Check][] = [
  ['jobs', (p) => expect(h1(p)).toHaveText(/^(Morning|Afternoon|Evening), Dan$/)],
  ['menu', (p) => expect(dialog(p, 'Menu')).toBeVisible()],
  ['about', (p) => expect(dialog(p, 'About Nod')).toBeVisible()],
  ['job', (p) => expect(h1(p)).toHaveText('Kitchen renovation')],
  ['job-details', (p) => expect(dialog(p, 'Job details')).toBeVisible()],
  ['record', (p) => expect(h1(p)).toHaveText('What’s changing?')],
  [
    'record-note',
    (p) => expect(p.getByRole('textbox', { name: 'Your note' })).toHaveValue(/Two-twenty all up/),
  ],
  ['review', (p) => expect(h1(p)).toHaveText('Check the draft')],
  [
    'review-ready',
    (p) => expect(p.getByText('Sending signs this for Brightside Renovations.')).toBeVisible(),
  ],
  ['what-sarah-sees', (p) => expect(dialog(p, 'What Sarah sees')).toBeVisible()],
  ['sent', (p) => expect(dialog(p, 'Ready for Sarah')).toBeVisible()],
  ['status', (p) => expect(p.getByText('Sent. Waiting on Sarah.')).toBeVisible()],
  [
    'status-question',
    (p) => expect(p.getByText('Sarah asked a question', { exact: true })).toBeVisible(),
  ],
  ['status-approved', (p) => expect(p.getByText(/^Approved by Sarah Chen, /)).toBeVisible()],
  ['job-approved', (p) => expect(p.getByRole('region', { name: 'Money' })).toContainText('49,170')],
  [
    'two-changes',
    (p) => expect(p.getByText('Nod split your note into 2 changes', { exact: true })).toBeVisible(),
  ],
  ['nothing-to-sign', (p) => expect(h1(p)).toHaveText('Nothing to sign here')],
  ['ai-down', (p) => expect(p.getByText(/^Nod can’t read notes right now/).first()).toBeVisible()],
  ['not-found', (p) => expect(h1(p)).toHaveText('This page doesn’t exist')],
]

const SARAH: [string, Check][] = [
  ['sarah', (p) => expect(h1(p)).toContainText('needs your OK')],
  ['sarah-approve', (p) => expect(dialog(p, 'Approve this change')).toBeVisible()],
  ['sarah-approved', (p) => expect(h1(p)).toHaveText('You approved this change')],
  ['sarah-ask', (p) => expect(dialog(p, 'Ask Dan a question')).toBeVisible()],
  [
    'sarah-question',
    (p) => expect(p.getByText('Yes, the left end works. Same price.')).toBeVisible(),
  ],
  ['sarah-say-no', (p) => expect(dialog(p, 'Say no to this change')).toBeVisible()],
  ['sarah-said-no', (p) => expect(h1(p)).toHaveText('You said no to this change')],
  ['sarah-withdrawn', (p) => expect(h1(p)).toHaveText('Dan withdrew this change')],
  ['sarah-bad-link', (p) => expect(h1(p)).toHaveText('This link isn’t working')],
]

/** Every request to the AI function this page makes, for checking there were none. */
function aiCalls(page: Page): string[] {
  const calls: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/notes') calls.push(request.method())
  })
  return calls
}

test('the list of screens links every preview', async ({ page }) => {
  await page.goto('/screens')
  await expect(page).toHaveTitle('Nod screens')
  await expect(h1(page)).toHaveText('Nod, screen by screen')
  await expect(page.getByRole('link', { name: 'Check the draft', exact: true })).toHaveAttribute(
    'href',
    '/screens/review',
  )
  await expect(page.getByRole('link')).toHaveCount(DAN.length + SARAH.length)
})

for (const [side, cases] of [
  ['Dan’s', DAN],
  ['Sarah’s', SARAH],
] as const) {
  test(`every preview of ${side} screens sets up its screen, with no AI call`, async ({ page }) => {
    test.setTimeout(120_000)
    const calls = aiCalls(page)
    for (const [name, check] of cases) {
      await test.step(name, async () => {
        await page.goto(`/screens/${name}`)
        await check(page)
      })
    }
    expect(calls).toEqual([])
  })
}

test('on a computer, a preview link shows one screen, not the stage', async ({ browser }, info) => {
  const context = await browser.newContext({
    baseURL: String(info.project.use.baseURL ?? 'http://localhost:5173'),
    viewport: { width: 1440, height: 900 },
    isMobile: false,
    hasTouch: false,
  })
  const page = await context.newPage()
  await page.goto('/screens/review')
  await expect(h1(page)).toHaveText('Check the draft')
  await expect(page.locator('iframe')).toHaveCount(0)
  await context.close()
})
