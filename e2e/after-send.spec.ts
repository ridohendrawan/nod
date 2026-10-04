// M4: after sending (ux-spec 6) and the job sheet (ux-spec 2): replies, edits that send a new
// version on the same link (D68), the collision when Sarah answers mid-edit (D77), withdrawing,
// a new version after a no (D26), Victoria's rules (D55), and photos (D83). Dan and Sarah are
// two pages in one browser context, sharing its data (D91).
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { kitchenCard, onScreen } from './helpers.ts'

const h1 = (page: Page) => page.getByRole('heading', { level: 1 })
const sentSheet = (page: Page) =>
  page.getByRole('dialog', { name: /^(Ready for Sarah|Update sent)$/ })

/** A 64 x 48 PNG (solid amber), made in the page so the test needs no fixture file. */
async function pngBytes(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = 64
    c.height = 48
    const g = c.getContext('2d')!
    g.fillStyle = '#ffb800'
    g.fillRect(0, 0, 64, 48)
    return c.toDataURL('image/png')
  })
  return Buffer.from(dataUrl.split(',')[1], 'base64')
}

async function recordGolden(page: Page) {
  await page.goto('/')
  await kitchenCard(page).click()
  await page.getByRole('link', { name: 'Record a change' }).click()
  await page.getByRole('button', { name: 'Try a sample note' }).click()
  await page.getByRole('button', { name: 'One change', exact: true }).click()
  await page.getByRole('button', { name: 'Draft the variation' }).click()
  await expect(h1(page)).toHaveText('Check the draft')
  await page.getByRole('radio', { name: 'With the next progress claim' }).check()
}

/** Dan sends the golden change and lands on its Status; returns Sarah's link. */
async function danSends(page: Page): Promise<string> {
  await recordGolden(page)
  await page.getByRole('button', { name: 'Send to Sarah' }).click()
  const text = await sentSheet(page).locator('.sms-bubble').textContent()
  const link = /https?:\/\/\S+\/o\/[\w-]+/.exec(text ?? '')?.[0]
  if (!link) throw new Error('No link in the text to Sarah')
  await sentSheet(page).getByRole('button', { name: 'Done' }).click()
  await expect(page.getByText(/^Sent\. Waiting on Sarah\.|^Sarah opened it at/)).toBeVisible()
  return link
}

async function sarahOpens(context: BrowserContext, link: string): Promise<Page> {
  const sarah = await context.newPage()
  await sarah.goto(link)
  await expect(h1(sarah)).toContainText('needs your OK')
  return sarah
}

test('Dan answers Sarah’s question, and she sees the reply live', async ({ page, context }) => {
  const sarah = await sarahOpens(context, await danSends(page))
  await sarah.getByRole('button', { name: 'Ask a question' }).click()
  await sarah.getByRole('textbox', { name: 'Your question' }).fill('Can it go on the left end?')
  await sarah.getByRole('button', { name: 'Send question' }).click()

  await expect(page.getByText('Sarah asked a question', { exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: 'Your reply' }).fill('Yes, same price.')
  await page.getByRole('button', { name: 'Send reply' }).click()
  await expect(page.getByText(/^You replied at .+\. Waiting on Sarah\.$/)).toBeVisible()

  await expect(sarah.getByText('Dan replied', { exact: true })).toBeVisible({ timeout: 3000 })
  await expect(sarah.getByText('Yes, same price.')).toBeVisible()
  await expect(sarah.locator('#announcer')).toHaveText('Dan replied.')
})

test('editing after sending sends version 2 on the same link, and Sarah sees what changed', async ({
  page,
  context,
}) => {
  const link = await danSends(page)
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  const confirm = page.getByRole('dialog', { name: 'Edit a change Sarah already has?' })
  await expect(confirm).toContainText('The link stays the same.')
  await confirm.getByRole('button', { name: 'Edit and resend' }).click()

  await expect(h1(page)).toHaveText('Edit Variation 2')
  await expect(page).toHaveURL(/\?edit$/)
  await expect(
    page.getByText('Editing Variation 2. Sarah still sees version 1 until you send the update.'),
  ).toBeVisible()
  const send = page.getByRole('button', { name: 'Send update to Sarah' })
  await expect(send).toHaveAttribute('aria-disabled', 'true')
  await expect(
    page.getByText('Nothing has changed yet. Edit something, then send the update.'),
  ).toBeVisible()

  await page.getByRole('textbox', { name: /^Amount in dollars/ }).fill('260')
  await expect(send).not.toHaveAttribute('aria-disabled', 'true')
  await send.click()
  await expect(page.getByRole('dialog', { name: 'Update sent' })).toBeVisible()
  await page
    .getByRole('dialog', { name: 'Update sent' })
    .getByRole('button', { name: 'Done' })
    .click()
  await expect(page).not.toHaveURL(/\?edit/)
  await expect(page.getByRole('region', { name: 'History' })).toContainText(
    'Updated and sent again (version 2)',
  )

  const sarah = await sarahOpens(context, link)
  await expect(sarah.getByText(/^Dan updated this change at /)).toBeVisible()
  await expect(sarah.getByText('The price changed from $220 to $260.')).toBeVisible()
  await expect(sarah.getByRole('article', { name: 'Change 2' })).toContainText(
    'Adds $260 to the price',
  )
})

test('an update while Sarah’s approve sheet is open holds her Approve until she looks', async ({
  page,
  context,
}) => {
  const sarah = await sarahOpens(context, await danSends(page))
  await sarah.getByRole('button', { name: 'Approve', exact: true }).click()
  const approve = sarah.getByRole('dialog', { name: 'Approve this change' })
  await approve.getByRole('textbox', { name: 'Type your full name' }).fill('Sarah Chen')
  await approve.getByRole('checkbox').check()

  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByRole('button', { name: 'Edit and resend' }).click()
  await page.getByRole('textbox', { name: /^Amount in dollars/ }).fill('260')
  await page.getByRole('button', { name: 'Send update to Sarah' }).click()
  await expect(page.getByRole('dialog', { name: 'Update sent' })).toBeVisible()

  await expect(approve).toContainText(
    'Dan has just updated this change. Check the new version before you approve.',
    { timeout: 3000 },
  )
  await expect(approve.getByRole('button', { name: 'Approve change' })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
})

test('if Sarah approves while Dan is editing, his edits aren’t sent (D77)', async ({
  page,
  context,
}) => {
  const sarah = await sarahOpens(context, await danSends(page))
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByRole('button', { name: 'Edit and resend' }).click()
  await page.getByRole('textbox', { name: /^Amount in dollars/ }).fill('260')

  await sarah.getByRole('button', { name: 'Approve', exact: true }).click()
  await sarah.getByRole('textbox', { name: 'Type your full name' }).fill('Sarah Chen')
  await sarah.getByRole('checkbox').check()
  await sarah.getByRole('button', { name: 'Approve change' }).click()
  await expect(h1(sarah)).toHaveText('You approved this change')

  await expect(page.getByText('Your edits weren’t sent.')).toBeVisible({ timeout: 3000 })
  await expect(
    page.getByText(
      'Sarah approved version 1 while you were editing. Record a new change for anything else.',
    ),
  ).toBeVisible()
  await expect(page.getByText('Approved. OK to start.')).toBeVisible()
})

test('withdrawing tells Sarah’s page, and she can’t approve it', async ({ page, context }) => {
  const link = await danSends(page)
  const withdraw = page.getByRole('button', { name: 'Withdraw' })
  const confirm = page.getByRole('dialog', { name: 'Withdraw Variation 2?' })
  // Withdraw is at the end of Status. Change your mind, and focus goes back to it.
  await withdraw.click()
  await confirm.getByRole('button', { name: 'Keep it' }).click()
  await expect(confirm).toBeHidden()
  await expect(withdraw).toBeFocused()
  await expect(withdraw).toBeInViewport()

  await withdraw.click()
  await expect(confirm).toContainText('can’t be approved after this')
  await confirm.getByRole('button', { name: 'Withdraw Variation 2' }).click()
  await expect(page.getByText('You withdrew this change.')).toBeVisible()
  // The page has moved on, so focus goes to its heading, brought on screen from above.
  await expect(confirm).toBeHidden()
  await expect(h1(page)).toBeFocused()
  await expect(h1(page)).toBeInViewport()

  const sarah = await context.newPage()
  await sarah.goto(link)
  await expect(h1(sarah)).toHaveText('Dan withdrew this change')
  await expect(sarah.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0)
})

test('Back from an edit puts focus on the change’s heading, on screen', async ({ page }) => {
  await danSends(page)
  // Edit is near the end of Status; ScrollRestoration brings Dan back there.
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByRole('button', { name: 'Edit and resend' }).click()
  await expect(h1(page)).toHaveText('Edit Variation 2')
  await page.goBack()
  await expect(h1(page)).toHaveText('Extra double power point on island bench')
  await expect(h1(page)).toBeFocused()
  await expect(h1(page)).toBeInViewport()
})

test('after a no, a new version replaces it on Sarah’s side (D26)', async ({ page, context }) => {
  const sarah = await sarahOpens(context, await danSends(page))
  await sarah.getByRole('button', { name: 'Say no' }).click()
  await sarah.getByRole('dialog').getByRole('button', { name: 'Say no' }).click()
  await expect(h1(sarah)).toHaveText('You said no to this change')

  await page.getByRole('button', { name: 'Start a new version' }).click()
  await expect(h1(page)).toHaveText('Check the draft')
  await expect(page.getByText(/^A new version of a change Sarah said no to\./)).toBeVisible()
  await page.getByRole('textbox', { name: /^Amount in dollars/ }).fill('180')
  await page.getByRole('button', { name: 'Send to Sarah' }).click()
  const text = await sentSheet(page).locator('.sms-bubble').textContent()
  const link = /https?:\/\/\S+\/o\/[\w-]+/.exec(text ?? '')![0]

  await sarah.goto(link)
  await expect(sarah.getByText('This replaces Change 2, which you said no to.')).toBeVisible()
  await expect(sarah.getByRole('article', { name: 'Change 3' })).toContainText(
    'Adds $180 to the price',
  )
})

test('the job sheet switches the job to Victoria, and drafts follow its rules', async ({
  page,
}) => {
  await page.goto('/')
  await kitchenCard(page).click()
  await page.getByRole('button', { name: 'Queensland rules. Change job details' }).click()
  const sheet = page.getByRole('dialog', { name: 'Job details' })
  await expect(sheet).toContainText(
    'Drafts update to the new rules straight away. Changes you’ve already sent keep the rules they were sent under.',
  )
  await sheet.getByRole('radio', { name: 'Victoria' }).check()
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('region', { name: 'Notifications' })).toContainText(
    'Checklist updated for Victoria.',
  )
  await expect(
    page.getByRole('button', { name: 'Victoria rules. Change job details' }),
  ).toBeVisible()

  await page.getByRole('link', { name: 'Record a change' }).click()
  await page.getByRole('button', { name: 'Try a sample note' }).click()
  await page.getByRole('button', { name: 'One change', exact: true }).click()
  await page.getByRole('button', { name: 'Draft the variation' }).click()
  await expect(page.getByRole('heading', { name: 'Victoria checklist' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Does a permit need changing?' })).toBeVisible()
})

test('a sent record keeps its time zone when the job’s state changes later (D10)', async ({
  page,
  context,
}) => {
  // November: Melbourne is on daylight saving and Brisbane never is, so a wrong zone shows.
  await page.clock.setFixedTime(new Date('2026-11-12T03:00:00Z'))
  const sarah = await sarahOpens(context, await danSends(page))
  await sarah.getByRole('button', { name: 'Approve', exact: true }).click()
  await sarah.getByRole('textbox', { name: 'Type your full name' }).fill('Sarah Chen')
  await sarah.getByRole('checkbox').check()
  await sarah.getByRole('button', { name: 'Approve change' }).click()
  await expect(sarah.getByText(/^Approved by Sarah Chen on .*\(Brisbane time\)\.$/)).toBeVisible()
  const decided = page.getByText(/^Approved by Sarah Chen, .* AEST\. Record /)
  await expect(decided).toBeVisible()

  // The job moves to Victoria. Approved under Queensland's rules, it stays a Brisbane record.
  await page.getByRole('link', { name: 'Kitchen renovation' }).click()
  await page.getByRole('button', { name: 'Queensland rules. Change job details' }).click()
  const sheet = page.getByRole('dialog', { name: 'Job details' })
  await sheet.getByRole('radio', { name: 'Victoria' }).check()
  await sheet.getByRole('button', { name: 'Save' }).click()
  await page.getByRole('link').filter({ hasText: 'Extra double power point' }).click()
  await expect(decided).toBeVisible()
  await expect(page.getByText(/AEDT/)).toHaveCount(0)
  await sarah.reload()
  await expect(sarah.getByText(/^Approved by Sarah Chen on .*\(Brisbane time\)\.$/)).toBeVisible()
  await expect(sarah.getByText(/Melbourne time/)).toHaveCount(0)
})

test('Share again keeps the sent time zone too, after the job moves to Victoria (D10)', async ({
  page,
  context,
}) => {
  await page.clock.setFixedTime(new Date('2026-11-12T03:00:00Z'))
  await sarahOpens(context, await danSends(page))
  // Her page reports the view after a second on screen, and Status says when, in Brisbane time.
  const opened = page.getByText(/^Sarah opened it at [^.]+\.$/)
  await expect(opened).toBeVisible()
  const line = (await opened.textContent()) ?? ''

  await page.getByRole('link', { name: 'Kitchen renovation' }).click()
  await page.getByRole('button', { name: 'Queensland rules. Change job details' }).click()
  const sheet = page.getByRole('dialog', { name: 'Job details' })
  await sheet.getByRole('radio', { name: 'Victoria' }).check()
  await sheet.getByRole('button', { name: 'Save' }).click()
  await page.getByRole('link').filter({ hasText: 'Extra double power point' }).click()
  await expect(opened).toHaveText(line)
  // The Sent sheet says the same time as Status, not an hour later in Melbourne.
  await page.getByRole('button', { name: 'Share again' }).click()
  await expect(sentSheet(page).getByText(line, { exact: true })).toBeVisible()
})

test('a photo is prepared on the phone, shows on Review, and on Sarah’s card', async ({
  page,
  context,
}) => {
  await recordGolden(page)
  const choose = page.locator('input[type=file]:not([capture])')
  await choose.setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hi'),
  })
  // The announcer says the same words, so look on screen, then check it said them.
  const notAPhoto = 'That file isn’t a photo. Choose a JPEG, PNG or HEIC photo.'
  await expect(onScreen(page).getByText(notAPhoto)).toBeVisible()
  await expect(page.locator('#announcer')).toHaveText(notAPhoto)

  await choose.setInputFiles({
    name: 'bench.png',
    mimeType: 'image/png',
    buffer: await pngBytes(page),
  })
  const thumb = page.getByRole('img', { name: 'Extra double power point on island bench' })
  await expect(thumb).toBeVisible()
  await expect(thumb).toHaveAttribute('src', /^blob:/)
  await expect(page.getByRole('button', { name: 'Remove photo' })).toBeVisible()

  await page.getByRole('button', { name: 'Send to Sarah' }).click()
  const text = await sentSheet(page).locator('.sms-bubble').textContent()
  const link = /https?:\/\/\S+\/o\/[\w-]+/.exec(text ?? '')![0]
  const sarah = await context.newPage()
  await sarah.goto(link)
  const photo = sarah.getByRole('button', {
    name: 'Extra double power point on the island bench. Show it larger.',
  })
  await expect(photo).toBeVisible()
  await photo.click()
  await expect(sarah.getByRole('dialog', { name: 'Photo' })).toBeVisible()
})
