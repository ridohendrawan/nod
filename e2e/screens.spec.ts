// Screenshots of every screen at 390, 360 and 320 px, for the milestone reviews (CLAUDE.md:
// "check at 390, 360 and 320 px with screenshots to Rido"), and the demo stage at / in three
// window sizes. Skipped unless SCREENS_DIR is set:
//   SCREENS_DIR=/some/folder pnpm e2e screens
import { expect, test, type Page } from '@playwright/test'
import { fakeSpeech } from './fakeSpeech.ts'
import { kitchenCard } from './helpers.ts'

const dir = process.env.SCREENS_DIR
const widths = [390, 360, 320] as const

test.skip(!dir, 'Set SCREENS_DIR to take milestone screenshots.')

// Reduced motion: sheets and toasts appear settled, so the shots never catch them mid-slide.
test.use({ contextOptions: { reducedMotion: 'reduce' } })

/** Scroll the page through once, so lazy photos load, and wait until every image has decoded. */
async function loadAllImages(page: Page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 400) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 60))
    }
    window.scrollTo(0, 0)
  })
  await page.waitForFunction(() => [...document.images].every((img) => img.complete))
}

/** `page`: the whole page. `view`: what the phone shows (screens with a sticky bar or a sheet). */
async function shoot(page: Page, name: string, width: number, mode: 'page' | 'view' = 'page') {
  await page.waitForTimeout(400) // let fonts and any fade settle
  await page.screenshot({ path: `${dir}/${name}-${width}.png`, fullPage: mode === 'page' })
}

const h1 = (page: Page) => page.getByRole('heading', { level: 1 })

async function openRecord(page: Page) {
  await page.goto('/')
  await kitchenCard(page).click()
  await page.getByRole('link', { name: 'Record a change' }).click()
  await expect(h1(page)).toHaveText('What’s changing?')
}

async function pickSample(page: Page, label: string) {
  const toggle = page.getByRole('button', { name: 'Try a sample note' })
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
  await page.getByRole('button', { name: label, exact: true }).click()
}

const toEnd = (page: Page) =>
  page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))

/** Scroll so a section starts just under the floating header, as Dan would read it. */
const toSection = (page: Page, name: string) =>
  page
    .getByRole('heading', { level: 2, name, exact: true })
    .evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 150))

for (const width of widths) {
  test(`M1 screens at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })

    await page.goto('/')
    await expect(kitchenCard(page)).toBeVisible()
    await loadAllImages(page)
    await shoot(page, '01-jobs', width)

    await page.getByRole('button', { name: 'Menu' }).click()
    await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible()
    await shoot(page, '02-menu', width, 'view')

    await page.getByRole('button', { name: 'Reset demo data' }).click()
    await expect(page.getByRole('dialog', { name: 'Reset the demo?' })).toBeVisible()
    await shoot(page, '03-reset-confirm', width, 'view')
    await page.getByRole('button', { name: 'Keep it' }).click()
    await expect(page.getByRole('dialog', { name: 'Reset the demo?' })).toBeHidden()

    await page.getByRole('button', { name: 'Menu' }).click()
    await page.getByRole('button', { name: 'About Nod' }).click()
    await expect(page.getByRole('dialog', { name: 'About Nod' })).toBeVisible()
    await shoot(page, '04-about', width, 'view')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'About Nod' })).toBeHidden()

    // The Job screen has a sticky Record dock, so it's shot as the phone shows it: the top, then
    // scrolled to the end.
    await kitchenCard(page).click()
    await expect(page.getByRole('region', { name: 'Money' })).toBeVisible()
    await loadAllImages(page)
    await shoot(page, '05-job-top', width, 'view')
    await toEnd(page)
    await shoot(page, '05-job-end', width, 'view')

    await page.goto('/no-such-page')
    await expect(h1(page)).toBeVisible()
    await shoot(page, '07-not-found', width, 'view')
  })

  test(`M2 Record at ${width} px`, async ({ page }) => {
    test.setTimeout(90_000)
    await page.addInitScript(fakeSpeech, {
      text: 'Sarah asked for an extra power point on the island two-twenty all up',
      wordMs: 400,
    })
    await page.setViewportSize({ width, height: 844 })
    await openRecord(page)
    await shoot(page, '10-record-empty', width, 'view')

    // Listening: the mic turns ink, the words arrive under the note.
    await page.getByRole('button', { name: 'Tap to talk' }).click()
    await expect(page.locator('.note-interim')).toBeVisible()
    await shoot(page, '11-record-listening', width, 'view')
    await page.getByRole('button', { name: 'Tap to stop' }).click()
    await expect(page.getByRole('button', { name: 'Keep talking' })).toBeVisible()

    await pickSample(page, 'One change')
    await page.getByRole('button', { name: 'Close notification' }).click()
    await page.evaluate(() => window.scrollTo(0, 0))
    await shoot(page, '12-record-note', width, 'view')
    await toEnd(page)
    await shoot(page, '12-record-samples', width, 'view')

    // Drafting, held for a moment by the dev server, then the 10 s exit.
    await page.route('**/api/notes', (route) =>
      route.continue({ headers: { ...route.request().headers(), 'x-nod-delay': '11500' } }),
    )
    await page.getByRole('button', { name: 'Draft the variation' }).click()
    await expect(page.getByText('Pulling out the line items…')).toBeVisible()
    await shoot(page, '13-drafting', width, 'view')
    await expect(page.getByRole('button', { name: 'Fill it in by hand' })).toBeVisible({
      timeout: 12_000,
    })
    await shoot(page, '13-drafting-slow', width, 'view')
    await expect(h1(page)).toHaveText('Check the draft', { timeout: 15_000 })
    await page.unroute('**/api/notes')

    // Nothing to sign.
    await openRecord(page)
    await pickSample(page, 'Nothing to sign')
    await page.getByRole('button', { name: 'Draft the variation' }).click()
    await expect(h1(page)).toHaveText('Nothing to sign here')
    await shoot(page, '14-nothing', width, 'view')

    // A failure: the AI is down, the note is safe.
    await page.route('**/api/notes', (route) =>
      route.continue({ headers: { ...route.request().headers(), 'x-nod-force': 'down' } }),
    )
    await openRecord(page)
    await pickSample(page, 'No price said')
    await page.getByRole('button', { name: 'Draft the variation' }).click()
    await expect(page.getByText('Nod can’t read notes right now. Your note’s safe.')).toBeVisible()
    await page.evaluate(() => window.scrollTo(0, 0))
    await shoot(page, '15-ai-down', width, 'view')
  })

  test(`M2 Review, Send and Status at ${width} px`, async ({ page }) => {
    test.setTimeout(90_000)
    await page.setViewportSize({ width, height: 844 })
    await openRecord(page)
    await pickSample(page, 'One change')
    await page.getByRole('button', { name: 'Draft the variation' }).click()
    await expect(h1(page)).toHaveText('Check the draft')
    await shoot(page, '20-review-top', width, 'view')
    await toSection(page, 'Who asked, and why')
    await shoot(page, '20-review-who', width, 'view')
    await toSection(page, 'Price')
    await shoot(page, '20-review-price', width, 'view')
    await toSection(page, 'Time')
    await shoot(page, '20-review-time', width, 'view')

    // A blocked Send takes Dan to the gap.
    await page.getByRole('button', { name: 'Send to Sarah' }).click({ force: true })
    await expect(page.getByRole('radio', { name: 'With the next progress claim' })).toBeFocused()
    await shoot(page, '21-review-gap', width, 'view')

    await page.getByRole('radio', { name: 'With the next progress claim' }).check()
    await toEnd(page)
    await shoot(page, '22-review-ready', width, 'view')

    await page.getByRole('button', { name: 'What Sarah sees' }).click()
    const preview = page.getByRole('dialog', { name: 'What Sarah sees' })
    await expect(preview).toBeVisible()
    await shoot(page, '23-what-sarah-sees', width, 'view')
    await preview.getByRole('button', { name: 'Edit Sarah’s wording' }).click()
    await expect(preview.getByRole('textbox', { name: 'Title Sarah reads' })).toBeVisible()
    await shoot(page, '23-sarah-wording', width, 'view')
    await preview.getByRole('button', { name: 'Done' }).click()
    await page.keyboard.press('Escape')
    await expect(preview).toBeHidden()

    await page.getByRole('button', { name: 'Send to Sarah' }).click()
    const sent = page.getByRole('dialog', { name: 'Ready for Sarah' })
    await expect(sent).toBeVisible()
    await shoot(page, '24-sent', width, 'view')
    await sent.getByRole('button', { name: 'Done' }).click()
    await expect(sent).toBeHidden()
    await page.evaluate(() => window.scrollTo(0, 0))
    await shoot(page, '25-status', width, 'view')
    await toEnd(page)
    await shoot(page, '25-status-end', width, 'view')

    // A rambling note: spotted, a site note, a price to confirm.
    await openRecord(page)
    await pickSample(page, 'Rambling site note')
    await page.getByRole('button', { name: 'Draft the variation' }).click()
    await expect(h1(page)).toHaveText('Check the draft')
    await shoot(page, '26-review-rambling', width, 'view')
    await toSection(page, 'Price')
    await shoot(page, '26-review-rambling-price', width, 'view')

    // Two changes: back on the job, split and marked new.
    await openRecord(page)
    await pickSample(page, 'Two in one breath')
    await page.getByRole('button', { name: 'Draft the variation' }).click()
    await expect(
      page.getByText('Nod split your note into 2 changes', { exact: true }),
    ).toBeVisible()
    await loadAllImages(page)
    await page.getByRole('heading', { name: 'Variations' }).scrollIntoViewIfNeeded()
    await shoot(page, '27-job-split', width, 'view')

    // Deleting a draft: gone at once, with Undo.
    await page.getByRole('link').filter({ hasText: 'Remove LED strip' }).click()
    await page.getByRole('button', { name: 'Delete draft' }).click()
    await expect(page.getByRole('region', { name: 'Notifications' })).toContainText(
      'Draft deleted.',
    )
    await shoot(page, '28-deleted-undo', width, 'view')
  })
}

/** Dan sends the golden note; returns Sarah's link (from the text he'd send her). */
async function danSends(page: Page): Promise<string> {
  await openRecord(page)
  await pickSample(page, 'One change')
  await page.getByRole('button', { name: 'Draft the variation' }).click()
  await expect(h1(page)).toHaveText('Check the draft')
  await page.getByRole('radio', { name: 'With the next progress claim' }).check()
  await page.getByRole('button', { name: 'Send to Sarah' }).click()
  const text = await page.locator('.sms-bubble').textContent()
  const link = /https?:\/\/\S+\/o\/[\w-]+/.exec(text ?? '')?.[0]
  if (!link) throw new Error('No link in the text')
  return link
}

for (const width of widths) {
  test(`M3 Sarah's page at ${width} px`, async ({ page, context }) => {
    test.setTimeout(90_000)
    await page.setViewportSize({ width, height: 844 })
    const link = await danSends(page)
    const sarah = await context.newPage()
    await sarah.setViewportSize({ width, height: 844 })
    await sarah.goto(link)
    await expect(h1(sarah)).toContainText('needs your OK')
    await shoot(sarah, '30-sarah-top', width, 'view')
    await shoot(sarah, '30-sarah-page', width, 'page')

    // Approve: the sheet, then blocked until her name and the tick.
    await sarah.getByRole('button', { name: 'Approve', exact: true }).click()
    const approve = sarah.getByRole('dialog', { name: 'Approve this change' })
    await expect(approve).toBeVisible()
    await shoot(sarah, '31-approve-sheet', width, 'view')
    await approve.getByRole('textbox', { name: 'Type your full name' }).fill('Sarah Chen')
    await approve.getByRole('checkbox').check()
    await approve.getByRole('button', { name: 'Approve change' }).scrollIntoViewIfNeeded()
    await shoot(sarah, '31-approve-ready', width, 'view')
    await approve.getByRole('button', { name: 'Approve change' }).click()
    await expect(h1(sarah)).toHaveText('You approved this change')
    await sarah.evaluate(() => window.scrollTo(0, 0))
    await shoot(sarah, '32-approved', width, 'page')

    // Dan: the sheet heard it; then Status.
    await expect(page.getByRole('dialog', { name: 'Ready for Sarah' })).toContainText(
      'Sarah approved it.',
    )
    await shoot(page, '33-dan-sheet-approved', width, 'view')
    await page.getByRole('button', { name: 'Done' }).click()
    await page.evaluate(() => window.scrollTo(0, 0))
    await shoot(page, '33-dan-status-approved', width, 'view')

    // A second change: a question, then saying no.
    const link2 = await danSends(page)
    await sarah.goto(link2)
    await sarah.getByRole('button', { name: 'Ask a question' }).click()
    const ask = sarah.getByRole('dialog', { name: 'Ask Dan a question' })
    await ask
      .getByRole('textbox', { name: 'Your question' })
      .fill('Can it go on the left end instead?')
    await shoot(sarah, '34-ask-sheet', width, 'view')
    await ask.getByRole('button', { name: 'Send question' }).click()
    await expect(ask).toBeHidden()
    await sarah.getByText('Questions', { exact: true }).scrollIntoViewIfNeeded()
    await shoot(sarah, '34-question-thread', width, 'view')
    await sarah.getByRole('button', { name: 'Say no' }).click()
    const no = sarah.getByRole('dialog', { name: 'Say no to this change' })
    await no.getByRole('textbox').fill('We’d rather keep the bench clear.')
    await shoot(sarah, '35-say-no-sheet', width, 'view')
    await no.getByRole('button', { name: 'Say no' }).click()
    await expect(h1(sarah)).toHaveText('You said no to this change')
    await sarah.evaluate(() => window.scrollTo(0, 0))
    await shoot(sarah, '35-said-no', width, 'view')

    await sarah.goto('/o/not-a-real-token')
    await expect(h1(sarah)).toHaveText('This link isn’t working')
    await shoot(sarah, '36-link-not-working', width, 'view')
  })
}

/** A 640 x 480 photo-ish PNG (a warm gradient), made in the page so no fixture file is needed. */
async function samplePhoto(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = 640
    c.height = 480
    const g = c.getContext('2d')!
    const grad = g.createLinearGradient(0, 0, 640, 480)
    grad.addColorStop(0, '#d9c7a7')
    grad.addColorStop(1, '#7d6b55')
    g.fillStyle = grad
    g.fillRect(0, 0, 640, 480)
    g.fillStyle = '#f2efe8'
    g.fillRect(380, 150, 140, 90)
    return c.toDataURL('image/png')
  })
  return Buffer.from(dataUrl.split(',')[1], 'base64')
}

for (const width of widths) {
  test(`M4 after sending at ${width} px`, async ({ page, context }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width, height: 844 })

    // A photo on the draft, then send.
    await openRecord(page)
    await pickSample(page, 'One change')
    await page.getByRole('button', { name: 'Draft the variation' }).click()
    await expect(h1(page)).toHaveText('Check the draft')
    await page.getByRole('radio', { name: 'With the next progress claim' }).check()
    await page
      .locator('input[type=file]:not([capture])')
      .setInputFiles({ name: 'site.png', mimeType: 'image/png', buffer: await samplePhoto(page) })
    await expect(page.getByRole('button', { name: 'Remove photo' })).toBeVisible()
    await toSection(page, 'Photo (optional)')
    await shoot(page, '40-review-photo', width, 'view')
    await page.getByRole('button', { name: 'Send to Sarah' }).click()
    const text = await page.locator('.sms-bubble').textContent()
    const link = /https?:\/\/\S+\/o\/[\w-]+/.exec(text ?? '')![0]
    await page.getByRole('button', { name: 'Done' }).click()
    await page.evaluate(() => window.scrollTo(0, 0))
    await toEnd(page)
    await shoot(page, '41-status-actions', width, 'view')

    // Sarah: the photo on her card, larger.
    const sarah = await context.newPage()
    await sarah.setViewportSize({ width, height: 844 })
    await sarah.goto(link)
    await expect(h1(sarah)).toContainText('needs your OK')
    await sarah.getByRole('button', { name: /Show it larger\.$/ }).scrollIntoViewIfNeeded()
    await shoot(sarah, '42-sarah-photo', width, 'view')
    await sarah.getByRole('button', { name: /Show it larger\.$/ }).click()
    await expect(sarah.getByRole('dialog', { name: 'Photo' })).toBeVisible()
    await shoot(sarah, '42-sarah-photo-large', width, 'view')
    await sarah.keyboard.press('Escape')

    // Edit after sending: the confirm, update mode, Update sent, and Sarah's banner.
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(
      page.getByRole('dialog', { name: 'Edit a change Sarah already has?' }),
    ).toBeVisible()
    await shoot(page, '43-edit-confirm', width, 'view')
    await page.getByRole('button', { name: 'Edit and resend' }).click()
    await expect(h1(page)).toHaveText('Edit Variation 2')
    await shoot(page, '44-update-mode', width, 'view')
    await page.getByRole('textbox', { name: /^Amount in dollars/ }).fill('260')
    await page.getByRole('button', { name: 'Send update to Sarah' }).click()
    await expect(page.getByRole('dialog', { name: 'Update sent' })).toBeVisible()
    await shoot(page, '45-update-sent', width, 'view')
    await page.getByRole('button', { name: 'Done' }).click()
    await sarah.reload()
    await expect(sarah.getByText(/^Dan updated this change at /)).toBeVisible()
    await sarah.evaluate(() => window.scrollTo(0, 0))
    await shoot(sarah, '46-sarah-update-banner', width, 'view')

    // Withdraw: the confirm, and Sarah's page after.
    await page.getByRole('button', { name: 'Withdraw' }).click()
    await expect(page.getByRole('dialog', { name: 'Withdraw Variation 2?' })).toBeVisible()
    await shoot(page, '47-withdraw-confirm', width, 'view')
    await page.getByRole('button', { name: 'Withdraw Variation 2' }).click()
    await expect(page.getByText('You withdrew this change.')).toBeVisible()
    await expect(h1(sarah)).toHaveText('Dan withdrew this change')
    await shoot(sarah, '48-sarah-withdrawn', width, 'view')

    // The job sheet.
    await page.getByRole('link', { name: 'Kitchen renovation' }).click()
    await page.getByRole('button', { name: 'Queensland rules. Change job details' }).click()
    const sheet = page.getByRole('dialog', { name: 'Job details' })
    await sheet.getByRole('radio', { name: 'Victoria' }).check()
    await sheet.getByRole('textbox', { name: 'Contract signed' }).fill('2027-04-02')
    await shoot(page, '49-job-sheet', width, 'view')
  })
}

for (const [width, height] of [
  [1440, 900],
  [1280, 760],
  [1024, 768],
] as const) {
  test(`demo stage at / at ${width} x ${height}`, async ({ browser }, info) => {
    const context = await browser.newContext({
      baseURL: String(info.project.use.baseURL ?? 'http://localhost:5173'),
      viewport: { width, height },
      isMobile: false,
      hasTouch: false,
      deviceScaleFactor: 2,
      reducedMotion: 'reduce',
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    })
    const page = await context.newPage()
    await page.goto('/')
    const dan = page.frameLocator('iframe[title="Dan’s phone: Nod"]')
    await expect(dan.getByRole('link', { name: /^Sarah Chen, kitchen renovation/ })).toBeVisible()
    await page.waitForTimeout(1200) // photos inside the phone
    await page.screenshot({ path: `${dir}/90-stage-${width}x${height}.png` })
    await context.close()
  })
}

for (const width of widths) {
  test(`M5 at ${width} px`, async ({ page, context }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width, height: 844 })

    // Demo mode (D95): a note that isn't a sample, and the way to the samples.
    await openRecord(page)
    await page.getByRole('textbox', { name: 'Your note' }).fill('Paint the skirting boards white.')
    await page.getByRole('button', { name: 'Draft the variation' }).click()
    await expect(page.getByText(/^This demo drafts the five sample notes only/)).toBeVisible()
    await page.evaluate(() => window.scrollTo(0, 0))
    await shoot(page, '50-record-demo-message', width, 'view')
    await page.getByRole('button', { name: 'Show the sample notes' }).click()
    await shoot(page, '51-record-samples-shown', width, 'view')

    // Sent, then the money card's waiting box and the photo buttons.
    const link = await danSends(page)
    await page.getByRole('button', { name: 'Done' }).click()
    await page.getByRole('link', { name: 'Kitchen renovation' }).click()
    await expect(page.getByText(/^Waiting on Sarah \(1\)/)).toBeVisible()
    // Drafting's "Sample note added." toast would cover the card.
    for (const close of await page.getByRole('button', { name: 'Close notification' }).all())
      await close.click()
    await loadAllImages(page)
    await page
      .getByRole('region', { name: 'Money' })
      .evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 120))
    await shoot(page, '52-money-waiting', width, 'view')
    await openRecord(page)
    await pickSample(page, 'No price said')
    await page.getByRole('button', { name: 'Draft the variation' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Check the draft')
    await toSection(page, 'Photo (optional)')
    await shoot(page, '53-photo-buttons', width, 'view')

    // Missed while away (D77): Dan's app hidden while Sarah opens and approves.
    await page.goto('/')
    await expect(kitchenCard(page)).toBeVisible()
    const visibility = (state: 'hidden' | 'visible') =>
      page.evaluate((s) => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s })
        document.dispatchEvent(new Event('visibilitychange'))
      }, state)
    await visibility('hidden')
    const sarah = await context.newPage()
    await sarah.goto(link)
    await sarah.waitForTimeout(1500)
    await sarah.getByRole('button', { name: 'Approve', exact: true }).click()
    const approve = sarah.getByRole('dialog', { name: 'Approve this change' })
    await approve.getByRole('textbox', { name: 'Type your full name' }).fill('Sarah Chen')
    await approve.getByRole('checkbox').check()
    await approve.getByRole('button', { name: 'Approve change' }).click()
    await expect(sarah.getByRole('heading', { level: 1 })).toHaveText('You approved this change')
    await expect(kitchenCard(page)).toHaveAccessibleName(/Contract total \$49,170\.$/)
    await visibility('visible')
    await expect(
      page
        .getByRole('region', { name: 'Notifications' })
        .getByText('While you were away: Sarah approved Variation 2.'),
    ).toBeVisible()
    await page.evaluate(() => window.scrollTo(0, 0))
    await shoot(page, '54-away-toast', width, 'view')

    // Big text: Record at 200%, its Draft button wrapping inside itself.
    await openRecord(page)
    await pickSample(page, 'One change')
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%'
    })
    await toEnd(page)
    await shoot(page, '55-record-text-200', width, 'view')
  })
}
