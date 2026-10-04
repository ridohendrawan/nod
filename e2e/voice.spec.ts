// Voice on Record (ux-spec 3; D49, D53; research/speech.md 2.5 and 2.13): the controller's quiet
// stop, its 3-minute cap, its quiet restarts, both watchdogs, every engine error's words and the
// wake lock, against the fake recogniser on Playwright's clock, so 10 seconds and 3 minutes pass
// at once. The timing tests freeze the clock first and check both sides of each threshold. The
// real engines on real phones are Rido's checklist (research/speech.md 3).
import { expect, test, type Page } from '@playwright/test'
import { fakeSpeech, type FakeSpeechOptions } from './fakeSpeech.ts'
import { kitchenCard } from './helpers.ts'

const note = (page: Page) => page.getByRole('textbox', { name: 'Your note' })
const announcer = (page: Page) => page.locator('#announcer')
const talk = (page: Page) => page.getByRole('button', { name: 'Tap to talk' })
const stop = (page: Page) => page.getByRole('button', { name: 'Tap to stop' })
const starts = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __fakeSpeech: { starts: number } }).__fakeSpeech.starts,
  )

/** Stop the page's clock: from here on time moves only when the test moves it, so a wait inside
 *  an assertion can never let a timer catch up. The clock runs while we read it, so it pauses a
 *  second ahead (Record sits idle until the test acts), and reads again if that's already past. */
async function freeze(page: Page) {
  for (let attempt = 1; ; attempt++) {
    const now = await page.evaluate(() => Date.now())
    try {
      await page.clock.pauseAt(now + 1_000)
      return
    } catch (e) {
      if (attempt === 5) throw e
    }
  }
}

/** The fake recogniser and a controllable clock, then Record for the kitchen job. */
async function openRecord(page: Page, opts: FakeSpeechOptions) {
  await page.clock.install()
  await page.addInitScript(fakeSpeech, opts)
  await page.goto('/')
  await kitchenCard(page).click()
  await page.getByRole('link', { name: 'Record a change' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('What’s changing?')
}

test('a quiet spell of 10 seconds stops the mic and keeps the words (D49)', async ({ page }) => {
  await openRecord(page, { text: 'Sarah asked for an extra power point' })
  await freeze(page)
  await talk(page).click()
  await page.clock.runFor(1_000) // the last word lands at 0.61 s
  await expect(note(page)).toHaveValue('Sarah asked for an extra power point')
  await page.clock.runFor(9_000) // 9.4 s of quiet
  await expect(stop(page)).toBeVisible()
  await page.clock.runFor(1_000) // 10.4 s
  await expect(page.getByText('Stopped after a quiet spell.', { exact: true })).toBeVisible()
  await expect(
    page.getByText('Check your note, or tap the mic to keep going.', { exact: true }),
  ).toBeVisible()
  await expect(announcer(page)).toHaveText('Recording stopped. Words added to your note.')
  await expect(note(page)).toHaveValue('Sarah asked for an extra power point')
})

test('one take records 3 minutes at most, and keeps everything said', async ({ page }) => {
  await openRecord(page, { chatter: true, wordMs: 2_000 })
  await freeze(page)
  await talk(page).click()
  await page.clock.runFor(1_000)
  await expect(stop(page)).toBeVisible()
  // Talking all the while, so the quiet stop never comes.
  await page.clock.runFor(178_000) // 2:59
  await expect(stop(page)).toBeVisible()
  await page.clock.runFor(2_000) // 3:01
  await expect(page.getByText('Stopped at 3 minutes.', { exact: true })).toBeVisible()
  await expect(
    page.getByText('Check your note. Tap the mic to add more.', { exact: true }),
  ).toBeVisible()
  // Every word kept, the note's first one capitalised as dictation does.
  await expect(note(page)).toHaveValue(/^And( and)+$/)
})

test('when the engine ends by itself mid-take, Nod quietly listens again', async ({ page }) => {
  // Android's recogniser ends after each sentence: a new one carries on, words joined up.
  await openRecord(page, {
    takes: ['Sarah asked for', 'an extra power point'],
    endAfterWords: true,
  })
  await talk(page).click()
  await expect(note(page)).toHaveValue('Sarah asked for an extra power point')
  await expect.poll(() => starts(page)).toBe(3)
  await expect(stop(page)).toBeVisible()
  await expect(page.getByText(/^Stopped|^Voice stopped/)).toHaveCount(0)
  await stop(page).click()
  await expect(announcer(page)).toHaveText('Recording stopped. Words added to your note.')
})

test('no words in 10 seconds says so, and a second time suggests typing', async ({ page }) => {
  // Safari never sends "no-speech", so Nod's own watchdog does.
  await openRecord(page, { text: '' })
  await freeze(page)
  await talk(page).click()
  await page.clock.runFor(1_000) // the mic opens at 0.05 s
  await expect(page.getByText(/^Listening/)).toBeVisible()
  await page.clock.runFor(8_500) // 9.5 s
  await expect(page.getByText('Didn’t catch anything.', { exact: true })).toHaveCount(0)
  await page.clock.runFor(1_000) // 10.5 s
  await expect(page.getByText('Didn’t catch anything.', { exact: true })).toBeVisible()
  await expect(
    page.getByText('Tap the mic to try again, or type it in your note.', { exact: true }),
  ).toBeVisible()
  await expect(announcer(page)).toHaveText(
    'Didn’t catch anything. Tap the mic to try again, or type it in your note.',
  )
  await talk(page).click()
  await page.clock.runFor(1_000)
  await expect(page.getByText(/^Listening/)).toBeVisible()
  await page.clock.runFor(10_000)
  await expect(page.getByText('Noisy? Typing works too.', { exact: true })).toBeVisible()
})

test('if Stop gets no answer, Nod finishes by itself 2.5 seconds later', async ({ page }) => {
  await openRecord(page, { text: 'Sarah asked for a power point', ignoreStop: true })
  await freeze(page)
  await talk(page).click()
  await page.clock.runFor(1_000)
  await expect(note(page)).toHaveValue('Sarah asked for a power point')
  await stop(page).click()
  await expect(page.getByText('Finishing up', { exact: true })).toBeVisible()
  await page.clock.runFor(2_000)
  await expect(page.getByText('Finishing up', { exact: true })).toBeVisible()
  await page.clock.runFor(1_000) // 3 s after Stop
  await expect(announcer(page)).toHaveText('Recording stopped. Words added to your note.')
  await expect(page.getByRole('button', { name: 'Keep talking' })).toBeVisible()
  await expect(note(page)).toHaveValue('Sarah asked for a power point')
})

test('a mic that never opens points to the permission prompt after 8 seconds', async ({ page }) => {
  await openRecord(page, { noAudio: true })
  await freeze(page)
  await talk(page).click()
  await expect(page.getByText('Getting the mic ready', { exact: true })).toBeVisible()
  const waiting = page.getByText('Still waiting. Check for a prompt at the top of the screen.', {
    exact: true,
  })
  await page.clock.runFor(7_500)
  await expect(waiting).toHaveCount(0)
  await page.clock.runFor(1_000) // 8.5 s
  await expect(waiting).toBeVisible()
})

test('leaving Nod mid-take stops the mic and keeps the words', async ({ page }) => {
  await openRecord(page, { text: 'Sarah asked for a power point' })
  await talk(page).click()
  await expect(note(page)).toHaveValue('Sarah asked for a power point')
  const visibility = (state: 'hidden' | 'visible') =>
    page.evaluate((s) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s })
      document.dispatchEvent(new Event('visibilitychange'))
    }, state)
  await visibility('hidden')
  await visibility('visible')
  await expect(page.getByText('Voice stopped.', { exact: true })).toBeVisible()
  await expect(
    page.getByText('Your words are kept. Tap the mic to carry on.', { exact: true }),
  ).toBeVisible()
  await expect(note(page)).toHaveValue('Sarah asked for a power point')
})

// Every engine error says what happened and what to do (ux-spec 3). This phone is Android, so
// "service-not-allowed" means a browser that blocks voice, not iPhone Dictation.
for (const [error, main, helper] of [
  [
    'network',
    'Voice can’t connect right now.',
    'Type the change in your note, or try again in a minute.',
  ],
  [
    'audio-capture',
    'Nod couldn’t hear the microphone.',
    'Check nothing else is using it, then tap to try again.',
  ],
  [
    'service-not-allowed',
    'Voice works best in Safari or Chrome.',
    'Open this page in your browser, or type the change in your note.',
  ],
  ['language-not-supported', 'Voice isn’t working here.', 'Type the change in your note.'],
  ['aborted', 'Voice stopped.', 'Your words are kept. Tap the mic to carry on.'],
] as const) {
  test(`the engine's "${error}" error says what to do`, async ({ page }) => {
    await openRecord(page, { error })
    await talk(page).click()
    await expect(page.getByText(main, { exact: true })).toBeVisible()
    await expect(page.getByText(helper, { exact: true })).toBeVisible()
  })
}

test('"not-allowed" with the mic already allowed means it is busy', async ({ page, context }) => {
  // Android says "not-allowed" when another app holds the recogniser.
  await context.grantPermissions(['microphone'])
  await openRecord(page, { error: 'not-allowed' })
  await talk(page).click()
  await expect(page.getByText('The microphone is busy.', { exact: true })).toBeVisible()
  await expect(
    page.getByText('Close other apps using it, then tap to try again. Or type your note.', {
      exact: true,
    }),
  ).toBeVisible()
})

test('the screen stays awake while Dan talks, and only then (D53)', async ({ page }) => {
  await page.addInitScript(() => {
    const log = { requested: 0, released: 0 }
    Object.assign(window, { __wake: log })
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: () => {
          log.requested += 1
          return Promise.resolve({
            release: () => {
              log.released += 1
              return Promise.resolve()
            },
          })
        },
      },
    })
  })
  const wake = () =>
    page.evaluate(
      () => (window as unknown as { __wake: { requested: number; released: number } }).__wake,
    )
  await openRecord(page, { text: 'Sarah asked for a power point' })
  await expect.poll(wake).toEqual({ requested: 0, released: 0 })
  await talk(page).click()
  await expect(note(page)).toHaveValue('Sarah asked for a power point')
  await expect.poll(wake).toEqual({ requested: 1, released: 0 })
  await stop(page).click()
  await expect.poll(wake).toEqual({ requested: 1, released: 1 })
})
