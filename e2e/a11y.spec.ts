// M5: an axe scan of every screen and state, at WCAG 2.2 A and AA plus axe's best practices: Dan's
// app, Sarah's page in every state, the sheets and the demo stage. Any finding fails the test and
// names the rule, its impact and the elements. Axe can't judge everything (where focus lands,
// focus order, wording, what's announced): the focus walk at the end of this file, the other
// specs and the manual pass cover those.
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type BrowserContext, type Frame, type Page } from '@playwright/test'
import { kitchenCard } from './helpers.ts'

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa', 'best-practice']

// Every screen sits on a decorative amber glow drawn by a pseudo-element, and axe won't judge text
// over one: by default it leaves every contrast check "incomplete" and passes nothing. So the
// glow is set aside and each text is measured against the solid card or paper under it (axe's
// own AA settings, only ignorePseudo changed). design-system 2 checks the glow's strongest tint.
const CONTRAST = {
  ignoreUnicode: true,
  ignoreLength: false,
  ignorePseudo: true,
  boldValue: 700,
  boldTextPt: 14,
  largeTextPt: 18,
  contrastRatio: { normal: { expected: 4.5 }, large: { expected: 3 } },
  pseudoSizeThreshold: 0.25,
  shadowOutlineEmMax: 0.2,
  textStrokeEmMin: 0.03,
}
// axe-core reads per-check options at run time (its getCheckOption), though its RunOptions type
// doesn't list them.
type RunOptions = Parameters<AxeBuilder['options']>[0]
const RUN: RunOptions & { checks: Record<string, { options: typeof CONTRAST }> } = {
  checks: { 'color-contrast': { options: CONTRAST } },
}

// Calmer motion, and every scan waits for the page to settle (below), so axe measures what Dan and
// Sarah read, never a sheet's colours halfway through its fade.
test.use({ contextOptions: { reducedMotion: 'reduce' } })

const h1 = (page: Page) => page.getByRole('heading', { level: 1 })

/** Nothing axe can find on what the page shows now (iframes included). Some text axe still can't
 *  judge: on the money card's, the "If approved" card's and the lock screen's gradients, inside a
 *  chip (its radio lies over it) and under the bottom bar's fade. Those pairings are measured by
 *  hand in design-system 2 and 6. */
async function clean(page: Page, where: string) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'))
  // options() replaces the run options, so it comes before withTags().
  const { violations } = await new AxeBuilder({ page }).options(RUN).withTags(TAGS).analyze()
  const found = violations.map(
    (v) =>
      `${v.id} (${v.impact ?? 'unknown'}): ${v.help}. At: ${v.nodes
        .map((n) => n.target.join(' '))
        .join(' | ')}`,
  )
  expect(found, `axe on ${where}`).toEqual([])
}

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

/** Dan drafts the golden note, picks when it's paid and sends it. The Sent sheet stays open;
 *  returns Sarah's link from the text he'd send her. */
async function danSends(page: Page): Promise<string> {
  await openRecord(page)
  await pickSample(page, 'One change')
  await page.getByRole('button', { name: 'Draft the variation' }).click()
  await expect(h1(page)).toHaveText('Check the draft')
  await page.getByRole('radio', { name: 'With the next progress claim' }).check()
  await page.getByRole('button', { name: 'Send to Sarah' }).click()
  const text = await page.locator('.sms-bubble').textContent()
  const link = /https?:\/\/\S+\/o\/[\w-]+/.exec(text ?? '')?.[0]
  if (!link) throw new Error('No link in the text to Sarah')
  return link
}

async function sarahOpens(context: BrowserContext, link: string): Promise<Page> {
  const sarah = await context.newPage()
  await sarah.goto(link)
  await expect(h1(sarah)).toContainText('needs your OK')
  return sarah
}

/** A 640 x 480 PNG, made in the page so the test needs no fixture file. */
async function samplePhoto(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = 640
    c.height = 480
    const g = c.getContext('2d')
    if (g) {
      g.fillStyle = '#8a7660'
      g.fillRect(0, 0, 640, 480)
    }
    return c.toDataURL('image/png')
  })
  return Buffer.from(dataUrl.split(',')[1], 'base64')
}

test('Dan: Jobs, the menu and its sheets, a job, the job sheet and a missing page', async ({
  page,
}) => {
  await page.goto('/')
  await expect(kitchenCard(page)).toBeVisible()
  await clean(page, 'Jobs')

  await page.getByRole('button', { name: 'Menu' }).click()
  await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible()
  await clean(page, 'the menu')
  await page.getByRole('button', { name: 'Reset demo data' }).click()
  await expect(page.getByRole('dialog', { name: 'Reset the demo?' })).toBeVisible()
  await clean(page, 'the reset confirm')
  await page.getByRole('button', { name: 'Keep it' }).click()
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('button', { name: 'About Nod' }).click()
  await expect(page.getByRole('dialog', { name: 'About Nod' })).toBeVisible()
  await clean(page, 'About Nod')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'About Nod' })).toBeHidden()

  // "AI off" in the header, while the AI is pretended down.
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('switch', { name: 'Pretend the AI is down' }).click()
  await page.keyboard.press('Escape')
  await clean(page, 'Jobs with the AI off')
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('switch', { name: 'Pretend the AI is down' }).click()
  await page.keyboard.press('Escape')

  await kitchenCard(page).click()
  await expect(page.getByRole('region', { name: 'Money' })).toBeVisible()
  await clean(page, 'the job')
  await page.getByRole('button', { name: 'Queensland rules. Change job details' }).click()
  await expect(page.getByRole('dialog', { name: 'Job details' })).toBeVisible()
  await clean(page, 'the job sheet')
  await page.getByRole('radio', { name: 'Victoria' }).check()
  await clean(page, 'the job sheet, Victoria')
  await page.keyboard.press('Escape')

  await page.goto('/no-such-page')
  await expect(h1(page)).toBeVisible()
  await clean(page, 'a missing page')
})

test('Dan: Record, its results and failures, and Review', async ({ page }) => {
  test.setTimeout(90_000)
  await openRecord(page)
  await clean(page, 'Record, empty')

  // The demo's answer to a note that isn't a sample (D95).
  await page.getByRole('textbox', { name: 'Your note' }).fill('Paint the skirting boards white.')
  await page.getByRole('button', { name: 'Draft the variation' }).click()
  await expect(page.getByText(/^This demo drafts the five sample notes only/)).toBeVisible()
  await clean(page, 'Record, the demo message')
  await page.getByRole('button', { name: 'Show the sample notes' }).click()
  await clean(page, 'Record, the samples open')

  // Drafting, held for a moment by the dev server.
  await page.route('**/api/notes', (route) =>
    route.continue({ headers: { ...route.request().headers(), 'x-nod-delay': '2500' } }),
  )
  await pickSample(page, 'Nothing to sign')
  await page.getByRole('button', { name: 'Draft the variation' }).click()
  await expect(page.locator('.drafting-card')).toBeVisible()
  await clean(page, 'Drafting')
  await expect(h1(page)).toHaveText('Nothing to sign here')
  await page.unroute('**/api/notes')
  await clean(page, 'Nothing to sign')

  // The AI down: the note is safe.
  await page.route('**/api/notes', (route) =>
    route.continue({ headers: { ...route.request().headers(), 'x-nod-force': 'down' } }),
  )
  await openRecord(page)
  await pickSample(page, 'No price said')
  await page.getByRole('button', { name: 'Draft the variation' }).click()
  await expect(page.getByText('Nod can’t read notes right now. Your note’s safe.')).toBeVisible()
  await clean(page, 'Record, the AI down')
  await page.unroute('**/api/notes')

  // Two changes: the job's split callout.
  await openRecord(page)
  await pickSample(page, 'Two in one breath')
  await page.getByRole('button', { name: 'Draft the variation' }).click()
  await expect(page.getByText('Nod split your note into 2 changes', { exact: true })).toBeVisible()
  await clean(page, 'the job after a split')

  // Review, its menu, What Sarah sees and her wording, a blocked Send.
  await page.getByRole('link').filter({ hasText: 'Move pendant lights' }).click()
  await expect(h1(page)).toHaveText('Check the draft')
  await clean(page, 'Review')
  await page.getByRole('button', { name: 'Send to Sarah' }).click({ force: true })
  await clean(page, 'Review, a blocked Send')
  await page.getByRole('button', { name: 'Draft menu' }).click()
  await expect(page.getByRole('dialog', { name: 'Draft' })).toBeVisible()
  await clean(page, 'the draft menu')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Draft' })).toBeHidden()
  await page.getByRole('button', { name: 'What Sarah sees' }).click()
  const preview = page.getByRole('dialog', { name: 'What Sarah sees' })
  await expect(preview).toBeVisible()
  await clean(page, 'What Sarah sees')
  await preview.getByRole('button', { name: 'Edit Sarah’s wording' }).click()
  await clean(page, 'Sarah’s wording')
  await preview.getByRole('button', { name: 'Done' }).click()
  await page.keyboard.press('Escape')
  await expect(preview).toBeHidden()

  // A rambling note: spotted, a site note, a price to confirm.
  await openRecord(page)
  await pickSample(page, 'Rambling site note')
  await page.getByRole('button', { name: 'Draft the variation' }).click()
  await expect(h1(page)).toHaveText('Check the draft')
  await clean(page, 'Review, a rambling note')
  await page.getByRole('button', { name: 'Delete draft' }).first().click()
  await expect(page.getByRole('region', { name: 'Notifications' })).toContainText('Draft deleted.')
  await clean(page, 'the job, a draft deleted with Undo')
})

test('Dan sends, Sarah asks and approves: both sides in every state', async ({ page, context }) => {
  test.setTimeout(90_000)
  const link = await danSends(page)
  await expect(page.getByRole('dialog', { name: 'Ready for Sarah' })).toBeVisible()
  // Reduced motion: the house beside the title stays still (D75).
  await expect(
    page.getByRole('dialog', { name: 'Ready for Sarah' }).locator('.logo-home'),
  ).toHaveCSS('animation-name', 'none')
  await clean(page, 'the Sent sheet')

  const sarah = await sarahOpens(context, link)
  await clean(sarah, 'Sarah’s page')
  await sarah.getByRole('button', { name: 'Ask a question' }).click()
  const ask = sarah.getByRole('dialog', { name: 'Ask Dan a question' })
  await ask.getByRole('textbox', { name: 'Your question' }).fill('Can it go on the left end?')
  await clean(sarah, 'Sarah, asking a question')
  await ask.getByRole('button', { name: 'Send question' }).click()
  await expect(ask).toBeHidden()
  await clean(sarah, 'Sarah, her question with Dan')

  // Dan: Status with her question and his reply form.
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByText('Sarah asked a question', { exact: true })).toBeVisible()
  await clean(page, 'Status, a question')
  await page.getByRole('textbox', { name: 'Your reply' }).fill('Yes, the left end works.')
  await page.getByRole('button', { name: 'Send reply' }).click()
  await expect(sarah.getByText('Yes, the left end works.')).toBeVisible()
  await clean(sarah, 'Sarah, Dan’s reply')

  // Approve: blocked until her name and the tick, then done.
  await sarah.getByRole('button', { name: 'Approve', exact: true }).click()
  const approve = sarah.getByRole('dialog', { name: 'Approve this change' })
  await expect(approve).toBeVisible()
  await approve.getByRole('button', { name: 'Approve change' }).click({ force: true })
  await expect(approve.getByText('Type your full name to approve.')).toBeVisible()
  await clean(sarah, 'the approve sheet, blocked')
  await approve.getByRole('textbox', { name: 'Type your full name' }).fill('Sarah Chen')
  await approve.getByRole('checkbox').check()
  await clean(sarah, 'the approve sheet, ready')
  await approve.getByRole('button', { name: 'Approve change' }).click()
  await expect(h1(sarah)).toHaveText('You approved this change')
  await clean(sarah, 'Sarah, approved')
  await expect(page.getByText('Approved. OK to start.')).toBeVisible()
  await clean(page, 'Status, approved')
})

test('After sending: a photo, an edit, saying no, withdrawing, and a bad link', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000)
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
  await clean(page, 'Review with a photo')
  await page.getByRole('button', { name: 'Send to Sarah' }).click()
  const text = await page.locator('.sms-bubble').textContent()
  const link = /https?:\/\/\S+\/o\/[\w-]+/.exec(text ?? '')?.[0] ?? ''
  await page.getByRole('button', { name: 'Done' }).click()
  await clean(page, 'Status, waiting')

  const sarah = await sarahOpens(context, link)
  await sarah.getByRole('button', { name: /Show it larger\.$/ }).click()
  await expect(sarah.getByRole('dialog', { name: 'Photo' })).toBeVisible()
  await clean(sarah, 'Sarah, the photo larger')
  await sarah.keyboard.press('Escape')

  // Edit after sending: the confirm, update mode, Update sent, and Sarah's banner.
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Edit a change Sarah already has?' })).toBeVisible()
  await clean(page, 'the edit confirm')
  await page.getByRole('button', { name: 'Edit and resend' }).click()
  await expect(h1(page)).toHaveText('Edit Variation 2')
  await clean(page, 'update mode')
  await page.getByRole('textbox', { name: /^Amount in dollars/ }).fill('260')
  await page.getByRole('button', { name: 'Send update to Sarah' }).click()
  await expect(page.getByRole('dialog', { name: 'Update sent' })).toBeVisible()
  await clean(page, 'Update sent')
  await page.getByRole('button', { name: 'Done' }).click()
  await sarah.reload()
  await expect(sarah.getByText(/^Dan updated this change at /)).toBeVisible()
  await clean(sarah, 'Sarah, the update banner')

  // Saying no.
  await sarah.getByRole('button', { name: 'Say no' }).click()
  const no = sarah.getByRole('dialog', { name: 'Say no to this change' })
  await no.getByRole('textbox').fill('We’d rather keep the bench clear.')
  await clean(sarah, 'the say-no sheet')
  await no.getByRole('button', { name: 'Say no' }).click()
  await expect(h1(sarah)).toHaveText('You said no to this change')
  await clean(sarah, 'Sarah, said no')
  await expect(page.getByText(/said no/).first()).toBeVisible()
  await clean(page, 'Status, said no')

  // Withdrawing a second change.
  const link2 = await danSends(page)
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'Withdraw' }).click()
  await expect(page.getByRole('dialog', { name: 'Withdraw Variation 3?' })).toBeVisible()
  await clean(page, 'the withdraw confirm')
  await page.getByRole('button', { name: 'Withdraw Variation 3' }).click()
  await expect(page.getByText('You withdrew this change.')).toBeVisible()
  await clean(page, 'Status, withdrawn')
  await sarah.goto(link2)
  await expect(h1(sarah)).toHaveText('Dan withdrew this change')
  await clean(sarah, 'Sarah, withdrawn')

  await sarah.goto('/o/not-a-real-token')
  await expect(h1(sarah)).toHaveText('This link isn’t working')
  await clean(sarah, 'a link that isn’t working')
})

test('On a computer: the demo stage, at / and /demo', async ({ browser }, info) => {
  test.setTimeout(90_000)
  const context = await browser.newContext({
    baseURL: String(info.project.use.baseURL ?? 'http://localhost:5173'),
    viewport: { width: 1440, height: 900 },
    isMobile: false,
    hasTouch: false,
    reducedMotion: 'reduce',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  })
  const page = await context.newPage()
  // A computer opening the public link gets the stage too.
  await page.goto('/')
  const dan = page.frameLocator('iframe[title="Dan’s phone: Nod"]')
  await expect(dan.getByRole('link', { name: /^Sarah Chen, kitchen renovation/ })).toBeVisible()
  await expect(page.getByText('No new messages')).toBeVisible()
  await clean(page, 'the demo stage at /')

  await page.goto('/demo')
  await expect(page.getByText('No new messages')).toBeVisible()
  await expect(dan.getByRole('link', { name: /^Sarah Chen, kitchen renovation/ })).toBeVisible()
  await clean(page, 'the demo stage')
  await dan.getByRole('link', { name: /^Sarah Chen, kitchen renovation/ }).click()
  await dan.getByRole('link', { name: 'Record a change' }).click()
  await dan.getByRole('button', { name: 'Try a sample note' }).click()
  await dan.getByRole('button', { name: 'One change', exact: true }).click()
  await dan.getByRole('button', { name: 'Draft the variation' }).click()
  await dan.getByRole('radio', { name: 'With the next progress claim' }).check()
  await dan.getByRole('button', { name: 'Send to Sarah' }).click()
  await dan.getByRole('button', { name: 'Text it to Sarah' }).click()
  const note = page.getByRole('button', { name: /^Messages now Dan \(Brightside Renovations\)/ })
  await expect(note).toBeVisible()
  await clean(page, 'the demo stage, Sarah’s text')
  await note.click()
  const sarah = page.frameLocator('iframe[title="Sarah’s phone: her page"]')
  await expect(sarah.getByRole('heading', { level: 1 })).toContainText('needs your OK')
  await clean(page, 'the demo stage, Sarah’s page')
  await context.close()
})

// ---- Focus stays in view (WCAG 2.2, 2.4.11 Focus Not Obscured) ---------------------------------

/** The focused element against what floats over the page: the header while it floats and the
 *  bottom bar while it sticks. Runs in the page, or in a phone's frame. */
function focusSpot() {
  const el = document.activeElement
  if (!(el instanceof HTMLElement) || el === document.body) return null
  const header = document.querySelector('.app-header')
  const bar = document.querySelector('.action-bar')
  const floating = (box: Element | null): box is Element =>
    box !== null && getComputedStyle(box).position === 'sticky'
  const r = el.getBoundingClientRect()
  return {
    name: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40),
    top: Math.round(r.top),
    bottom: Math.round(r.bottom),
    clearTop: floating(header) ? Math.round(header.getBoundingClientRect().bottom) : 0,
    clearBottom: floating(bar) ? Math.round(bar.getBoundingClientRect().top) : innerHeight,
    inBars: Boolean(header?.contains(el) || bar?.contains(el)),
  }
}

/** Tab (or Shift+Tab) from one bar through the page to the other: every stop on the way must
 *  land in full view, clear of both bars, wherever the page's scroll padding puts it. */
async function walkFocus(page: Page, frame: Page | Frame, key: 'Tab' | 'Shift+Tab', where: string) {
  const hidden: string[] = []
  let inPage = false
  for (let step = 0; step < 120; step++) {
    await page.keyboard.press(key)
    const spot = await frame.evaluate(focusSpot)
    if (!spot) continue
    if (spot.inBars) {
      if (inPage) break // through the page and into a bar
      continue
    }
    inPage = true
    if (spot.top < spot.clearTop - 1 || spot.bottom > spot.clearBottom + 1)
      hidden.push(
        `${spot.name} at ${spot.top} to ${spot.bottom}, clear from ${spot.clearTop} to ${spot.clearBottom}`,
      )
  }
  expect(inPage, `focus moved through ${where}`).toBe(true)
  expect(hidden, `focus under a bar on ${where}`).toEqual([])
}

test('keyboard focus always lands in view, clear of the header and the bottom bar', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(90_000)
  // A phone's browser: about 660 px of page between its address bar and its toolbar.
  await page.setViewportSize({ width: 390, height: 664 })

  // Record with the samples open, under the tallest bar there is: the Record dock.
  await openRecord(page)
  await page.getByRole('button', { name: 'Try a sample note' }).focus()
  await page.keyboard.press('Enter')
  await walkFocus(page, page, 'Tab', 'Record')
  await walkFocus(page, page, 'Shift+Tab', 'Record, going back')

  // Review: top to bottom, and back up under the floating header.
  await page.getByRole('button', { name: 'One change', exact: true }).click()
  await page.getByRole('button', { name: 'Draft the variation' }).click()
  await expect(h1(page)).toHaveText('Check the draft')
  await walkFocus(page, page, 'Tab', 'Review')
  await walkFocus(page, page, 'Shift+Tab', 'Review, going back')

  // The same in Dan's phone on the demo stage, where the header sits under a drawn status bar.
  const context = await browser.newContext({
    baseURL: String(info.project.use.baseURL ?? 'http://localhost:5173'),
    viewport: { width: 1440, height: 900 },
    isMobile: false,
    hasTouch: false,
    reducedMotion: 'reduce',
  })
  const stage = await context.newPage()
  await stage.goto('/demo')
  const dan = stage.frameLocator('iframe[title="Dan’s phone: Nod"]')
  await dan.getByRole('link', { name: /^Sarah Chen, kitchen renovation/ }).click()
  await dan.getByRole('link', { name: 'Record a change' }).click()
  await dan.getByRole('button', { name: 'Try a sample note' }).click()
  await dan.getByRole('button', { name: 'One change', exact: true }).click()
  await dan.getByRole('button', { name: 'Draft the variation' }).click()
  await expect(dan.getByRole('heading', { level: 1 })).toHaveText('Check the draft')
  const frame = await (
    await stage.locator('iframe[title="Dan’s phone: Nod"]').elementHandle()
  )?.contentFrame()
  if (!frame) throw new Error('Dan’s phone has no frame')
  await walkFocus(stage, frame, 'Tab', 'Review on the stage')
  await walkFocus(stage, frame, 'Shift+Tab', 'Review on the stage, going back')
  await context.close()
})
