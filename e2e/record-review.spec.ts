// M2: Record, the AI step (fixture mode in dev), Review, What Sarah sees, Send, the Sent sheet and
// Status (ux-spec 3 to 6). The five sample notes give the results ux-spec 9 expects. Every test
// starts in a fresh context, so on freshly seeded data: the kitchen job (QLD) has Variation 1.
import { expect, test, type Page } from '@playwright/test'
import { fakeSpeech } from './fakeSpeech.ts'
import { kitchenCard, onScreen, scrollsSideways } from './helpers.ts'

const note = (page: Page) => page.getByRole('textbox', { name: 'Your note' })
const draftButton = (page: Page) => page.getByRole('button', { name: 'Draft the variation' })
const announcer = (page: Page) => page.locator('#announcer')
const h1 = (page: Page) => page.getByRole('heading', { level: 1 })
const toasts = (page: Page) => page.getByRole('region', { name: 'Notifications' })
const sendButton = (page: Page) => page.getByRole('button', { name: 'Send to Sarah' })
// Demo mode (D95): a sample note's result was prepared in advance, and every screen says so.
const PREPARED_DRAFT =
  'Demo draft, prepared in advance for this sample note. With an AI key, Nod drafts any note.'
const PREPARED_DRAFTS =
  'Demo drafts, prepared in advance for this sample note. With an AI key, Nod drafts any note.'
const PREPARED_RESULT =
  'Demo result, prepared in advance for this sample note. With an AI key, Nod reads any note.'

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

/** Record the "One change" sample and land on its Review. */
async function draftOneChange(page: Page) {
  await openRecord(page)
  await pickSample(page, 'One change')
  await draftButton(page).click()
  await expect(h1(page)).toHaveText('Check the draft')
}

test('one change: Review shows what Nod drafted, and Send says what it waits for', async ({
  page,
}) => {
  await openRecord(page)
  await pickSample(page, 'One change')
  await expect(note(page)).toHaveValue(/Two-twenty all up/)
  await draftButton(page).click()

  await expect(page).toHaveURL(/\/v\/[0-9a-f-]{36}$/)
  await expect(page).toHaveTitle('Draft: Nod')
  await expect(h1(page)).toHaveText('Check the draft')
  await expect(page.getByText('Nod found 1 change in your note.')).toBeVisible()
  await expect(page.getByText(PREPARED_DRAFT)).toBeVisible()
  await expect(page.getByRole('textbox', { name: /^Title/ })).toHaveValue(
    'Extra double power point on island bench',
  )
  await expect(page.getByRole('textbox', { name: /^Amount in dollars/ })).toHaveValue('220')
  await expect(page.getByRole('button', { name: /^You said .Two-twenty all up/ })).toBeVisible()
  await expect(page.getByText('Sarah will see: Adds $220 to the price')).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Sarah' })).toBeChecked()
  await expect(page.getByRole('radio', { name: 'No extra time' })).toBeChecked()

  // Queensland needs to know when it's paid (D17): Send stays readable and says why.
  await expect(sendButton(page)).toHaveAttribute('aria-disabled', 'true')
  await expect(page.getByText('Before you can send: choose when it’s paid.')).toBeVisible()
  // Playwright won't press an aria-disabled button by itself; a person can (D17).
  await sendButton(page).click({ force: true })
  await expect(page.getByRole('radio', { name: 'With the next progress claim' })).toBeFocused()
  await expect(page.getByText('Choose when it’s paid.', { exact: true })).toBeVisible()

  await page.getByRole('radio', { name: 'With the next progress claim' }).check()
  await expect(sendButton(page)).not.toHaveAttribute('aria-disabled', 'true')
  await expect(page.getByText('Sending signs this for Brightside Renovations.')).toBeVisible()
  await expect(announcer(page)).toHaveText('Ready to send')
  const impact = page.getByRole('region', { name: 'If approved' })
  await expect(impact).toContainText('$48,950')
  await expect(impact).toContainText('$49,170')
})

test('Send opens the Sent sheet, and Done shows where it stands', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await draftOneChange(page)
  await page.getByRole('radio', { name: 'With the next progress claim' }).check()
  await sendButton(page).click()

  const sheet = page.getByRole('dialog', { name: 'Ready for Sarah' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('heading', { name: 'Ready for Sarah' })).toBeFocused()
  // The mark's one moment (D75): the house nods once as the sheet settles, then rests. (The
  // class is the only way to reach it: the mark is decorative, so it has no role or name.)
  const house = sheet.locator('.logo-home')
  await expect(house).toHaveCSS('animation-name', 'logo-nod')
  await expect(house).toHaveCSS('animation-iteration-count', '1')
  await expect.poll(() => house.evaluate((g) => g.getAnimations().length)).toBe(0)
  await expect(house).toHaveCSS('transform', 'none')
  await expect(sheet).toContainText('Variation 2')
  await expect(sheet).toContainText('+$220')
  await expect(sheet).toContainText('No extra time')
  await expect(sheet).toContainText('Waiting for Sarah to open it.')
  await expect(sheet).toContainText(
    "Hi Sarah, it's Dan from Brightside Renovations. Here's a change to your kitchen renovation for your OK: http",
  )
  // A phone: the Messages app with her number and the text filled in (D82).
  await expect(sheet.getByRole('link', { name: 'Text it to Sarah' })).toHaveAttribute(
    'href',
    /^sms:[\d+]*\?body=Hi%20Sarah/,
  )
  await expect(sheet.getByRole('link', { name: 'Email it' })).toHaveAttribute(
    'href',
    /^mailto:.*subject=A%20change%20to%20your%20kitchen%20renovation/,
  )
  await sheet.getByRole('button', { name: 'Copy link' }).click()
  await expect(sheet.getByRole('button', { name: 'Copied' })).toBeVisible()
  await expect(announcer(page)).toHaveText('Link copied')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/o\/[\w-]+$/)

  await sheet.getByRole('button', { name: 'Done' }).click()
  await expect(sheet).toBeHidden()
  await expect(page).toHaveTitle('Variation 2: Nod')
  await expect(h1(page)).toHaveText('Extra double power point on island bench')
  await expect(h1(page)).toBeFocused()
  // And on screen: the send turned Review into Status at the same address, scrolled down to
  // where Send was, so Status starts again at its top.
  await expect(h1(page)).toBeInViewport()
  await expect(page.getByText('Sent. Waiting on Sarah.')).toBeVisible()
  const history = page.getByRole('region', { name: 'History' })
  await expect(history).toContainText('Recorded by you')
  await expect(history).toContainText('Sent to Sarah (version 1)')
  await expect(page.getByText(/^Version 1.*Record [0-9A-F]{4}-[0-9A-F]{4}$/)).toBeVisible()

  // Share again reopens the same sheet, and closing it goes back to that button, where Dan was.
  const shareAgain = page.getByRole('button', { name: 'Share again' })
  await shareAgain.click()
  await expect(sheet).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await expect(shareAgain).toBeFocused()
  await expect(shareAgain).toBeInViewport()
  // The job lists it as waiting.
  await page.getByRole('link', { name: 'Kitchen renovation' }).click()
  const row = page.getByRole('listitem').filter({ hasText: 'Extra double power point' })
  await expect(row).toContainText('V2')
  await expect(row).toContainText('Waiting on Sarah')
})

test('two changes in one breath go back to the job, split and marked new', async ({ page }) => {
  await openRecord(page)
  await pickSample(page, 'Two in one breath')
  await draftButton(page).click()
  await expect(h1(page)).toHaveText('Kitchen renovation')
  await expect(page.getByText('Nod split your note into 2 changes', { exact: true })).toBeVisible()
  // Exact: 120 ms on, the announcer says the same line too, after the split.
  await expect(page.getByText(PREPARED_DRAFTS, { exact: true })).toBeVisible()
  await expect(announcer(page)).toHaveText(
    `Nod split your note into 2 changes, so Sarah can say yes to one and not the other. ${PREPARED_DRAFTS}`,
  )
  const fresh = page.getByRole('link').filter({ hasText: 'New' })
  await expect(fresh).toHaveCount(2)
  await expect(fresh.filter({ hasText: 'Move pendant lights 300 mm left' })).toContainText('+$380')
  await expect(fresh.filter({ hasText: 'Remove LED strip under cabinets' })).toContainText('−$400')

  // Each opens its own Review; Back comes home to the same row.
  await fresh.filter({ hasText: 'Remove LED strip' }).click()
  await expect(page.getByText('Nod found 2 changes in your note.')).toBeVisible()
  await expect(page.getByText(PREPARED_DRAFT)).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Credit' })).toBeChecked()
  await expect(page.getByText('Sarah will see: Takes $400 off the price')).toBeVisible()
  await page.getByRole('link', { name: 'Kitchen renovation' }).click()
  await expect(page.getByRole('link').filter({ hasText: 'Remove LED strip' })).toBeFocused()
})

test('a rambling note: spotted, a site note, and a price Dan confirms', async ({ page }) => {
  await openRecord(page)
  await pickSample(page, 'Rambling site note')
  await draftButton(page).click()
  await expect(page.getByText('Nod found 1 change and a site note in your note.')).toBeVisible()
  await expect(
    page.getByText(/^Nod spotted this in your note: you mentioned moving the sink tap/),
  ).toBeVisible()
  await expect(page.getByText(/^Also in your note, not a change: Sparky finished/)).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Site conditions' })).toBeChecked()

  // "About one-fifty": Nod heard it but won't use it until Dan says so (D81).
  const amount = page.getByRole('textbox', { name: /^Amount in dollars/ })
  await expect(amount).toHaveValue('')

  // The source line opens the note with those words marked (D64).
  await page.getByRole('button', { name: /^You said .about one-fifty extra in fittings/ }).click()
  await expect(page.locator('.note-text mark')).toHaveText('about one-fifty extra in fittings')

  await page.getByRole('button', { name: 'Use $150' }).click()
  await expect(amount).toHaveValue('150')
  await expect(page.getByText('Sarah will see: Adds $150 to the price')).toBeVisible()
  // Now it's Dan's own number: the suggestion and its source line step aside.
  await expect(page.getByRole('button', { name: 'Use $150' })).toBeHidden()
})

test('no price said: the field waits, and Send names it first', async ({ page }) => {
  await openRecord(page)
  await pickSample(page, 'No price said')
  await draftButton(page).click()
  await expect(page.getByText('You didn’t say a price. Nod never guesses one.')).toBeVisible()
  await expect(page.getByText(/^Before you can send: add the price/)).toBeVisible()
  await sendButton(page).click({ force: true })
  await expect(page.getByRole('textbox', { name: /^Amount in dollars/ })).toBeFocused()
})

test('nothing to sign: a calm stop, the site note, and a way to fill it in', async ({ page }) => {
  await openRecord(page)
  await pickSample(page, 'Nothing to sign')
  await draftButton(page).click()
  await expect(h1(page)).toHaveText('Nothing to sign here')
  await expect(h1(page)).toBeFocused()
  await expect(
    page.getByText('This sounds like a progress update, not a change to the job.'),
  ).toBeVisible()
  await expect(page.getByText(PREPARED_RESULT)).toBeVisible()
  await expect(page.getByText(/the skip bin was swapped today/)).toBeVisible()
  await page.getByRole('button', { name: 'It is a change: fill it in by hand' }).click()
  await expect(page.getByText('You’re filling this one in by hand.')).toBeVisible()
  await page.getByRole('button', { name: 'Your note' }).click()
  await expect(page.getByText(/skip bin got swapped today/)).toBeVisible()
})

test('in the demo, a note that isn’t a sample says so, and the samples are one tap away', async ({
  page,
}) => {
  await openRecord(page)
  await note(page).fill('Sarah wants the skirting boards painted white, not oak. Add one-twenty.')
  await draftButton(page).click()
  await expect(
    page.getByText(
      'This demo drafts the five sample notes only. Your note’s safe. Fill it in by hand, or try a sample note.',
    ),
  ).toBeVisible()
  await expect(note(page)).toHaveValue(/skirting boards/)
  // Trying again can't help (D95): the samples can.
  await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Fill it in by hand' })).toBeVisible()
  await page.getByRole('button', { name: 'Show the sample notes' }).click()
  const first = page.getByRole('button', { name: 'One change', exact: true })
  await expect(first).toBeFocused()
  await first.click()
  // The message has done its job; Dan's own words are one Undo away.
  await expect(page.getByText(/^This demo drafts the five sample notes only/)).toHaveCount(0)
  await expect(toasts(page).getByText('Sample note added.')).toBeVisible()
  await draftButton(page).click()
  await expect(h1(page)).toHaveText('Check the draft')
  await expect(page.getByText(PREPARED_DRAFT)).toBeVisible()
})

test('the samples open in full view above the dock, however Dan opens them', async ({ page }) => {
  // A phone's browser: the list opens just above the dock, so it would open out of sight.
  await page.setViewportSize({ width: 390, height: 664 })
  await openRecord(page)
  const dock = page.getByRole('region', { name: 'Actions' })
  const last = page.getByRole('button', { name: 'Nothing to sign', exact: true })
  const lastClearOfDock = async () => {
    const [d, l] = await Promise.all([dock.boundingBox(), last.boundingBox()])
    return d !== null && l !== null && l.y + l.height <= d.y
  }
  const toggle = page.getByRole('button', { name: 'Try a sample note' })
  await toggle.click()
  await expect.poll(lastClearOfDock).toBe(true)
  await toggle.click()
  await expect(last).toBeHidden()

  // The demo's way to them (D95) does the same, with focus on the first.
  await note(page).fill('Sarah wants the skirting boards painted white, not oak. Add one-twenty.')
  await draftButton(page).click()
  await page.getByRole('button', { name: 'Show the sample notes' }).click()
  await expect(page.getByRole('button', { name: 'One change', exact: true })).toBeFocused()
  await expect.poll(lastClearOfDock).toBe(true)
})

test('with the AI down, the note is safe and Fill it in by hand works', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('switch', { name: 'Pretend the AI is down' }).click()
  await page.keyboard.press('Escape')
  await kitchenCard(page).click()
  await page.getByRole('link', { name: 'Record a change' }).click()
  await pickSample(page, 'One change')
  await draftButton(page).click()

  await expect(page.getByText('Nod can’t read notes right now. Your note’s safe.')).toBeVisible()
  await expect(note(page)).toHaveValue(/Two-twenty all up/)
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  await page.getByRole('button', { name: 'Fill it in by hand' }).click()
  await expect(page.getByText('You’re filling this one in by hand.')).toBeVisible()
  await expect(page.getByRole('textbox', { name: /^Title/ })).toHaveValue('')
})

for (const [reason, message, retry] of [
  ['limit', 'Nod has read today’s 80 notes. Fill this one in by hand.', false],
  [
    'unreadable',
    'Nod couldn’t read that note. Your note’s safe. Try rewording it, or fill it in by hand.',
    true,
  ],
] as const) {
  test(`an AI failure (${reason}) explains itself and keeps the note`, async ({ page }) => {
    await page.route('**/api/notes', (route) =>
      route.continue({ headers: { ...route.request().headers(), 'x-nod-force': reason } }),
    )
    await openRecord(page)
    await pickSample(page, 'One change')
    await draftButton(page).click()
    await expect(page.getByText(message)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Fill it in by hand' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(retry ? 1 : 0)
    await expect(note(page)).toHaveValue(/Two-twenty all up/)
  })
}

test('a slow draft offers the by-hand exit at 10 seconds, and ignores the late reply', async ({
  page,
}) => {
  test.setTimeout(60_000)
  await page.route('**/api/notes', (route) =>
    route.continue({ headers: { ...route.request().headers(), 'x-nod-delay': '13000' } }),
  )
  await openRecord(page)
  await pickSample(page, 'One change')
  await draftButton(page).click()
  await expect(h1(page)).toHaveText('Drafting your variation')
  await expect(h1(page)).toBeFocused()
  await expect(page.getByText('Reading your note…')).toBeVisible()
  await expect(page.getByText('Checking the Queensland rules…')).toBeVisible({ timeout: 8000 })
  const exit = page.getByRole('button', { name: 'Fill it in by hand' })
  await expect(exit).toBeVisible({ timeout: 12_000 })
  await exit.click()
  await expect(page.getByText('You’re filling this one in by hand.')).toBeVisible()

  // The AI's reply lands later and is dropped: the job has V1 and this one draft.
  await page.getByRole('link', { name: 'Kitchen renovation' }).click()
  await page.waitForTimeout(4000)
  await page.reload()
  await expect(page.getByRole('list').filter({ hasText: 'V1' }).getByRole('listitem')).toHaveCount(
    2,
  )
})

test('deleting a draft is instant, with 5 seconds to undo', async ({ page }) => {
  test.setTimeout(45_000)
  await draftOneChange(page)
  await page.getByRole('button', { name: 'Delete draft' }).click()
  await expect(h1(page)).toHaveText('Kitchen renovation')
  await expect(toasts(page)).toContainText('Draft deleted.')
  await expect(page.getByText('Extra double power point on island bench')).toBeHidden()

  await toasts(page).getByRole('button', { name: 'Undo' }).click()
  await expect(h1(page)).toHaveText('Check the draft')

  await page.getByRole('button', { name: 'Delete draft' }).click()
  await expect(toasts(page)).toContainText('Draft deleted.')
  await expect(toasts(page)).not.toContainText('Draft deleted.', { timeout: 8000 })
  await page.reload()
  await expect(h1(page)).toHaveText('Kitchen renovation')
  await expect(page.getByText('Full-height tiled splashback')).toBeVisible()
  await expect(page.getByText('Extra double power point on island bench')).toBeHidden()
})

test('an unsent note comes back, and clearing it can be undone', async ({ page }) => {
  await openRecord(page)
  await note(page).fill('Sarah wants the bigger sink after all')
  await expect(page.getByText('Saved on this phone')).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('link', { name: 'Record a change' }).click()
  await expect(page.getByText(/^Your unsent note from .+ is back\.$/)).toBeVisible()
  await expect(note(page)).toHaveValue('Sarah wants the bigger sink after all')

  await page.getByRole('button', { name: 'Clear it' }).click()
  await expect(note(page)).toHaveValue('')
  await toasts(page).getByRole('button', { name: 'Undo' }).click()
  await expect(note(page)).toHaveValue('Sarah wants the bigger sink after all')
})

test('Review saves as Dan types, and a reload keeps it', async ({ page }) => {
  await draftOneChange(page)
  const title = page.getByRole('textbox', { name: /^Title/ })
  await title.fill('Double power point at the end of the island')
  await expect(page.getByText('Saving…', { exact: true })).toBeVisible()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('textbox', { name: /^Title/ })).toHaveValue(
    'Double power point at the end of the island',
  )
  // Dan's edit cleared the field's "From your note" tag (D64).
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toBeVisible()
})

test('What Sarah sees is her real card, and her wording can be edited', async ({ page }) => {
  await draftOneChange(page)
  await page.getByRole('button', { name: 'What Sarah sees' }).click()
  const sheet = page.getByRole('dialog', { name: 'What Sarah sees' })
  await expect(sheet).toContainText('This is exactly what Sarah’s page will show.')
  await expect(sheet).toContainText('Change 2')
  await expect(sheet).toContainText('Extra double power point on the island bench')
  await expect(sheet).toContainText('Adds $220 to the price')
  await expect(sheet).toContainText('Your new contract total')
  await expect(sheet).toContainText('$49,170')
  await expect(sheet).toContainText('Was $48,950')
  // Her buttons are drawn, but inert: nothing to press here.
  await expect(sheet.locator('.owner-actions')).toHaveAttribute('inert', '')

  await sheet.getByRole('button', { name: 'Edit Sarah’s wording' }).click()
  await sheet
    .getByRole('textbox', { name: 'Title Sarah reads' })
    .fill('A second power point on the island bench')
  await sheet.getByRole('button', { name: 'Done' }).click()
  await expect(sheet).toContainText('A second power point on the island bench')
})

test('voice: words go into the note, and stopping says so', async ({ page }) => {
  await page.addInitScript(fakeSpeech, {
    text: 'Sarah asked for an extra power point two-twenty all up',
  })
  await openRecord(page)
  await page.getByRole('button', { name: 'Tap to talk' }).click()
  await expect(page.getByRole('button', { name: 'Tap to stop' })).toBeVisible()
  await expect(note(page)).toHaveValue('Sarah asked for an extra power point two-twenty all up')
  await page.getByRole('button', { name: 'Tap to stop' }).click()
  await expect(announcer(page)).toHaveText('Recording stopped. Words added to your note.')
  await expect(draftButton(page)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Keep talking' })).toBeVisible()
})

test('voice: a blocked microphone still lets Dan type', async ({ page }) => {
  await page.addInitScript(fakeSpeech, { error: 'not-allowed' })
  await openRecord(page)
  await page.getByRole('button', { name: 'Tap to talk' }).click()
  await expect(onScreen(page).getByText('Nod can’t use the microphone.')).toBeVisible()
  await note(page).fill('Sarah wants a second downlight over the sink')
  await expect(draftButton(page)).not.toHaveAttribute('aria-disabled', 'true')
})

test('an empty note keeps Draft blocked, and says why', async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, { SpeechRecognition: undefined, webkitSpeechRecognition: undefined })
  })
  await openRecord(page)
  await expect(page.getByText('Voice isn’t available in this browser.')).toBeVisible()
  await expect(draftButton(page)).toHaveAttribute('aria-disabled', 'true')
  await expect(page.getByText('Say or type what’s changing first.')).toBeVisible()
  await draftButton(page).click({ force: true })
  await expect(note(page)).toBeFocused()
})

for (const width of [360, 320]) {
  test(`Record and Review reflow at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 })
    await openRecord(page)
    expect(await scrollsSideways(page)).toBe(false)
    await pickSample(page, 'Rambling site note')
    // Held for a moment, so the drafting view (and its skeleton) can be measured too.
    await page.route('**/api/notes', (route) =>
      route.continue({ headers: { ...route.request().headers(), 'x-nod-delay': '2500' } }),
    )
    await draftButton(page).click()
    await expect(page.locator('.drafting-card')).toBeVisible()
    expect(await scrollsSideways(page)).toBe(false)
    await expect(h1(page)).toHaveText('Check the draft')
    expect(await scrollsSideways(page)).toBe(false)
  })
}

test('on a computer, the public link opens both phones, and a deep link keeps its screen', async ({
  browser,
}, info) => {
  const base = String(info.project.use.baseURL ?? 'http://localhost:5173')
  // The phone project's touch settings would apply here too, so say plainly: a laptop.
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    isMobile: false,
    hasTouch: false,
    deviceScaleFactor: 1,
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  })
  const page = await context.newPage()
  await page.goto(base)
  await expect(page).toHaveTitle('Nod demo stage')
  await expect(page.getByText('No new messages')).toBeVisible()
  const dan = page.frameLocator('iframe[title="Dan’s phone: Nod"]')
  await expect(dan.getByRole('link', { name: /^Sarah Chen, kitchen renovation/ })).toBeVisible()
  await dan.getByRole('link', { name: /^Sarah Chen, kitchen renovation/ }).click()
  await expect(dan.getByRole('heading', { level: 1 })).toHaveText('Kitchen renovation')

  // The job's own address, opened on a computer: the stage, with Dan's phone on that job.
  const job = page.frames().find((f) => /\/job\/[0-9a-f-]{36}$/.test(new URL(f.url()).pathname))
  expect(job, 'Dan’s phone is on the job').toBeTruthy()
  await page.goto(base + new URL(job?.url() ?? base).pathname)
  await expect(page).toHaveTitle('Nod demo stage')
  await expect(
    page.frameLocator('iframe[title="Dan’s phone: Nod"]').getByRole('heading', { level: 1 }),
  ).toHaveText('Kitchen renovation')
  await context.close()
})
