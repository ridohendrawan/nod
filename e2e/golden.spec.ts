// M3: the golden path with Dan and Sarah as two pages in one browser context (D91: they share
// this browser's data, like the demo's two phones). Dan sends; Sarah opens her link, and Dan's
// screen says so; Sarah answers, and Dan's screens follow within a couple of seconds.
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { kitchenCard, scrollsSideways } from './helpers.ts'

const h1 = (page: Page) => page.getByRole('heading', { level: 1 })
const announcer = (page: Page) => page.locator('#announcer')

/** Dan records the golden note, picks when it's paid and sends it. Returns Sarah's link. */
async function danSends(page: Page): Promise<string> {
  await page.goto('/')
  await kitchenCard(page).click()
  await page.getByRole('link', { name: 'Record a change' }).click()
  await page.getByRole('button', { name: 'Try a sample note' }).click()
  await page.getByRole('button', { name: 'One change', exact: true }).click()
  await page.getByRole('button', { name: 'Draft the variation' }).click()
  await expect(h1(page)).toHaveText('Check the draft')
  await page.getByRole('radio', { name: 'With the next progress claim' }).check()
  await page.getByRole('button', { name: 'Send to Sarah' }).click()
  const sheet = page.getByRole('dialog', { name: 'Ready for Sarah' })
  await expect(sheet).toBeVisible()
  const text = await sheet.locator('.sms-bubble').textContent()
  const link = /https?:\/\/\S+\/o\/[\w-]+/.exec(text ?? '')?.[0]
  if (!link) throw new Error(`No link in the text to Sarah: ${text}`)
  return link
}

async function sarahOpens(context: BrowserContext, link: string): Promise<Page> {
  const sarah = await context.newPage()
  await sarah.goto(link)
  await expect(h1(sarah)).toHaveText(
    'Dan from Brightside Renovations needs your OK on a change to your kitchen renovation.',
  )
  return sarah
}

test('golden path: Dan sends, Sarah approves, and Dan sees it within seconds', async ({
  page,
  context,
}) => {
  const link = await danSends(page)
  const sarah = await sarahOpens(context, link)

  // Her page: the business, never Nod; the change in her words; her new total (D78).
  await expect(sarah).toHaveTitle('Change 2 to your kitchen renovation')
  await expect(sarah.getByText('Brightside Renovations', { exact: true })).toBeVisible()
  const card = sarah.getByRole('article', { name: 'Change 2' })
  await expect(card).toContainText('Extra double power point on the island bench')
  await expect(card).toContainText('Adds $220 to the price')
  await expect(card).toContainText('Added to your next progress payment')
  await expect(card).toContainText('$49,170')
  await expect(card).toContainText('Was $48,950')
  await expect(sarah.getByRole('link', { name: '0491 570 156' })).toHaveAttribute(
    'href',
    'tel:0491570156',
  )

  // "Opened" comes from her page being visible for a second (D70), and Dan's sheet says so live.
  await expect(
    page.getByRole('dialog', { name: 'Ready for Sarah' }).getByText(/^Sarah opened it at /),
  ).toBeVisible({ timeout: 6000 })

  // Approve: blocked until her name and the tick (D17), and never optimistic (D71).
  await sarah.getByRole('button', { name: 'Approve', exact: true }).click()
  const approve = sarah.getByRole('dialog', { name: 'Approve this change' })
  await expect(approve).toBeVisible()
  await expect(approve.getByRole('heading', { name: 'Approve this change' })).toBeFocused()
  await expect(approve).toContainText('New contract total')
  const confirm = approve.getByRole('button', { name: 'Approve change' })
  await expect(confirm).toHaveAttribute('aria-disabled', 'true')
  await expect(approve.getByText('To approve, type your name and tick the box.')).toBeVisible()
  await confirm.scrollIntoViewIfNeeded()
  await confirm.click({ force: true })
  await expect(approve.getByRole('textbox', { name: 'Type your full name' })).toBeFocused()
  await expect(approve.getByText('Type your full name to approve.')).toBeVisible()
  await approve.getByRole('textbox', { name: 'Type your full name' }).fill('Sarah Chen')
  const consent = approve.getByRole('checkbox', {
    name: /^I agree to this change to my building contract: extra double power point on the island bench\. It adds \$220 to the price\. It does not add any time\. My new contract total is \$49,170\.$/,
  })
  await expect(consent).not.toBeChecked()
  await consent.check()
  await confirm.click()

  await expect(h1(sarah)).toHaveText('You approved this change')
  await expect(h1(sarah)).toBeFocused()
  await expect(
    sarah.getByText(
      // Non-breaking spaces keep "2 October" and "7:55 am" together, hence \s.
      /^Approved by Sarah Chen on \w+day\s\d+\sOctober\s2026 at .+\(Brisbane time\)\.$/,
    ),
  ).toBeVisible()
  await expect(sarah.getByText(/^Record number [0-9A-F]{4}-[0-9A-F]{4}/)).toBeVisible()
  await expect(
    sarah.getByText('The $220 will be added to your next progress payment.'),
  ).toBeVisible()

  // Dan was looking at that change, so it's said rather than toasted (ux-spec 0.4).
  const sheet = page.getByRole('dialog', { name: 'Ready for Sarah' })
  await expect(sheet).toContainText('Sarah approved it.', { timeout: 3000 })
  await expect(announcer(page)).toHaveText('Sarah approved this variation. OK to start.')
  await sheet.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByText('Approved. OK to start.')).toBeVisible()
  await expect(page.getByText(/^Approved by Sarah Chen, /)).toBeVisible()
  await expect(page.getByRole('region', { name: 'History' })).toContainText('Sarah approved it')

  // Back on the job: the row says Approved and the total includes it.
  await page.getByRole('link', { name: 'Kitchen renovation' }).click()
  const row = page.getByRole('listitem').filter({ hasText: 'Extra double power point' })
  await expect(row).toContainText('Approved')
  await expect(page.getByRole('region', { name: 'Money' })).toContainText('$49,170')
})

test('with Dan’s app in the background, one line on return says what Sarah did (D77)', async ({
  page,
  context,
}) => {
  const link = await danSends(page)
  await page.goto('/')
  await expect(h1(page)).toBeVisible()
  // Dan switches to Messages: his app is hidden while Sarah opens and approves.
  const setVisibility = (state: 'hidden' | 'visible') =>
    page.evaluate((s) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s })
      document.dispatchEvent(new Event('visibilitychange'))
    }, state)
  await setVisibility('hidden')

  const sarah = await sarahOpens(context, link)
  await page.waitForTimeout(1500) // her "opened" (D70)
  await sarah.getByRole('button', { name: 'Approve', exact: true }).click()
  const approve = sarah.getByRole('dialog', { name: 'Approve this change' })
  await approve.getByRole('textbox', { name: 'Type your full name' }).fill('Sarah Chen')
  await approve.getByRole('checkbox', { name: /^I agree to this change/ }).check()
  await approve.getByRole('button', { name: 'Approve change' }).click()
  await expect(h1(sarah)).toHaveText('You approved this change')

  // Dan's hidden app has heard (its job card says so), but nothing toasts: it would fade unseen.
  await expect(kitchenCard(page)).toHaveAccessibleName(
    /All changes signed\. Contract total \$49,170\.$/,
  )
  const toasts = page.getByRole('region', { name: 'Notifications' })
  await expect(toasts.getByText(/Sarah/)).toHaveCount(0)

  // Back in the app: "opened" steps aside for the approval, and Open goes to it.
  await setVisibility('visible')
  const line = 'While you were away: Sarah approved Variation 2.'
  await expect(toasts.getByText(line)).toBeVisible()
  await expect(announcer(page)).toHaveText(line)
  await toasts.getByRole('button', { name: 'Open' }).click()
  await expect(page.getByText('Approved. OK to start.')).toBeVisible()
})

test('the golden path reflows at 320 px with text at 200% (WCAG 1.4.4 and 1.4.10)', async ({
  page,
  context,
}) => {
  test.setTimeout(60_000)
  await context.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      document.documentElement.style.fontSize = '200%'
    })
  })
  await page.setViewportSize({ width: 320, height: 740 })
  /** Nothing scrolls sideways: the page, and an open sheet's own content. */
  const reflows = async (p: Page) => {
    expect(await scrollsSideways(p)).toBe(false)
    for (const dialog of await p.getByRole('dialog').all())
      expect(await dialog.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false)
  }

  await page.goto('/')
  await kitchenCard(page).click()
  await page.getByRole('link', { name: 'Record a change' }).click()
  await expect(h1(page)).toHaveText('What’s changing?')
  await reflows(page)
  await page.getByRole('button', { name: 'Try a sample note' }).click()
  await page.getByRole('button', { name: 'One change', exact: true }).click()
  await page.getByRole('button', { name: 'Draft the variation' }).click()
  await expect(h1(page)).toHaveText('Check the draft')
  await reflows(page)
  await page.getByRole('radio', { name: 'With the next progress claim' }).check()
  await page.getByRole('button', { name: 'Send to Sarah' }).click()
  const sheet = page.getByRole('dialog', { name: 'Ready for Sarah' })
  await expect(sheet).toBeVisible()
  await reflows(page)
  const text = await sheet.locator('.sms-bubble').textContent()
  const link = /https?:\/\/\S+\/o\/[\w-]+/.exec(text ?? '')?.[0] ?? ''
  await sheet.getByRole('button', { name: 'Done' }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByText('Sent. Waiting on Sarah.')).toBeVisible()
  await reflows(page)

  const sarah = await context.newPage()
  await sarah.setViewportSize({ width: 320, height: 740 })
  await sarah.goto(link)
  await expect(h1(sarah)).toContainText('needs your OK')
  await reflows(sarah)
  await sarah.getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(sarah.getByRole('dialog', { name: 'Approve this change' })).toBeVisible()
  await reflows(sarah)
})

test('Sarah says no with a reason, and Dan is told not to do the work', async ({
  page,
  context,
}) => {
  const link = await danSends(page)
  await page
    .getByRole('dialog', { name: 'Ready for Sarah' })
    .getByRole('button', { name: 'Done' })
    .click()
  // Dan goes back to his jobs: an answer arrives as a toast he can open.
  await page.getByRole('link', { name: 'Kitchen renovation' }).click()
  await page.getByRole('link', { name: 'Jobs' }).click()
  await expect(kitchenCard(page)).toBeVisible()

  const sarah = await sarahOpens(context, link)
  await sarah.getByRole('button', { name: 'Say no' }).click()
  const no = sarah.getByRole('dialog', { name: 'Say no to this change' })
  await expect(no).toContainText('Dan won’t do this work, and your contract stays as it is.')
  await no
    .getByRole('textbox', { name: 'Tell Dan why (optional)' })
    .fill('We’d rather keep the bench clear.')
  await no.getByRole('button', { name: 'Say no' }).click()
  await expect(h1(sarah)).toHaveText('You said no to this change')
  await expect(sarah.getByText('Your reason: We’d rather keep the bench clear.')).toBeVisible()

  const toasts = page.getByRole('region', { name: 'Notifications' })
  await expect(toasts).toContainText('Sarah said no to Variation 2. Don’t do this work.', {
    timeout: 3000,
  })
  // An "opened" toast may still be showing too; open the one about her answer.
  await toasts
    .locator('.toast')
    .filter({ hasText: 'said no' })
    .getByRole('button', { name: 'Open' })
    .click()
  await expect(page.getByText('Sarah said no. Don’t do this work.')).toBeVisible()
  await expect(page.getByText('Sarah’s reason: We’d rather keep the bench clear.')).toBeVisible()
})

test('Sarah asks a question, and can still answer while she waits', async ({ page, context }) => {
  const link = await danSends(page)
  const sarah = await sarahOpens(context, link)
  await sarah.getByRole('button', { name: 'Ask a question' }).click()
  const ask = sarah.getByRole('dialog', { name: 'Ask Dan a question' })
  const box = ask.getByRole('textbox', { name: 'Your question' })
  await expect(box).toBeFocused()
  await box.fill('Can it go on the left end instead?')
  await ask.getByRole('button', { name: 'Send question' }).click()
  await expect(ask).toBeHidden()
  await expect(announcer(sarah)).toHaveText('Question sent.')
  await expect(sarah.getByText('Can it go on the left end instead?')).toBeVisible()
  await expect(
    sarah.getByText(
      'Your question’s with Dan. You can still approve or say no whenever you’re ready.',
    ),
  ).toBeVisible()
  await expect(sarah.getByRole('button', { name: 'Approve', exact: true })).toBeVisible()

  // Dan's sheet hears it; his Status shows her question.
  const sheet = page.getByRole('dialog', { name: 'Ready for Sarah' })
  await expect(sheet).toContainText('Sarah asked a question.', { timeout: 3000 })
  await sheet.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByText('Sarah asked a question', { exact: true })).toBeVisible()
  await expect(page.locator('.callout-quote')).toContainText('Can it go on the left end instead?')
  await expect(page.getByRole('region', { name: 'History' })).toContainText(
    'Sarah asked: “Can it go on the left end instead?”',
  )
})

test('a link that isn’t for this browser says so calmly', async ({ page }) => {
  await page.goto('/o/not-a-real-token')
  await expect(h1(page)).toHaveText('This link isn’t working')
  await expect(page.getByText('Brightside Renovations')).toHaveCount(0)
})
