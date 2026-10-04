// Opt-in: Nod's real voice code against Chrome's real recogniser (Google's speech service), with
// notes said by macOS's Australian voice through a fake microphone. It needs a Mac, Google Chrome
// and the network, so it runs only when asked:
//   NOD_REAL_VOICE=1 pnpm e2e e2e/voice-real.spec.ts
// Chrome's recogniser can't hear a fake microphone by itself (research/speech.md 2.14), so a shim
// hands it the fake device's track: one track for the whole take, like a real mic. Everything
// else is Nod, unchanged. Chrome's words vary from run to run ("Sarah's" or "Sarah is", "power
// point" or "PowerPoint"), so the checks hold Nod to its part (every final result in the note,
// in order, once each, and the quiet stop) and the report keeps Chrome's words and events.
// Desktop Chrome only. On Android Nod uses single-shot mode, and the desktop engine in that mode
// drops whole sentences (speech.md 2.3, trace E11), so Android stays with the fake recogniser's
// restart tests (voice.spec.ts) and a real phone (docs/device-checklist.md).
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, expect, test } from '@playwright/test'
import { kitchenCard } from './helpers.ts'

const on = process.env.NOD_REAL_VOICE === '1' && process.platform === 'darwin'
test.skip(!on, 'Set NOD_REAL_VOICE=1 on a Mac with Google Chrome to run it.')

/** A note in Karen's voice (en-AU), then 14 s of quiet for the quiet stop: 48 kHz mono, which
 *  Chrome's fake device plays as recorded. Made once per machine, in the temp folder. */
function recording(name: string, words: string): string {
  const wav = join(tmpdir(), `nod-${name}.wav`)
  if (existsSync(wav)) return wav
  const aiff = wav.replace(/\.wav$/, '.aiff')
  execFileSync('say', [
    '-v',
    'Karen',
    '-r',
    '175',
    '-o',
    aiff,
    `[[slnc 1500]] ${words} [[slnc 14000]]`,
  ])
  execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@48000', '-c', '1', aiff, wav])
  return wav
}

/** Every recogniser gets the fake microphone's one track. Counts the starts, keeps the finals,
 *  and logs every event the engine sends, for the report. */
function shim() {
  type Recogniser = EventTarget & {
    continuous: boolean
    start(track?: MediaStreamTrack): void
  }
  type Results = ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>
  const Orig = (window as unknown as { webkitSpeechRecognition?: new () => Recogniser })
    .webkitSpeechRecognition
  if (!Orig) return
  const seen = { starts: 0, finals: [] as string[], log: [] as string[] }
  Object.assign(window, { __real: seen })
  const t0 = performance.now()
  const note = (line: string) =>
    seen.log.push(`${((performance.now() - t0) / 1000).toFixed(2)} s  ${line}`)
  let track: Promise<MediaStreamTrack> | undefined
  let made = 0
  class Shimmed extends Orig {
    constructor() {
      super()
      const id = ++made
      for (const type of ['start', 'speechstart', 'speechend', 'result', 'error', 'end'])
        this.addEventListener(type, (e) => {
          if (type === 'result') {
            const { resultIndex, results } = e as Event & { resultIndex: number; results: Results }
            for (let i = resultIndex; i < results.length; i++)
              if (results[i].isFinal) seen.finals.push(results[i][0].transcript.trim())
            const words = Array.from(
              results,
              (r) => `${r.isFinal ? 'final' : 'interim'} "${r[0].transcript}"`,
            )
            note(`#${id} result: ${words.join(', ')}`)
          } else
            note(
              `#${id} ${type}${type === 'error' ? `: ${(e as Event & { error: string }).error}` : ''}`,
            )
        })
    }
    start() {
      seen.starts += 1
      note(`start (continuous: ${this.continuous})`)
      track ??= navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((s) => s.getAudioTracks()[0])
      void track.then((t) => super.start(t))
    }
  }
  Object.assign(window, { webkitSpeechRecognition: Shimmed, SpeechRecognition: Shimmed })
}

/** Desktop Chrome at phone size, its microphone playing `wav`: say it into Record, wait for the
 *  quiet stop, and return the note with what the engine reported. The engine's events go into
 *  the test's report either way. */
async function sayIntoRecord(wav: string) {
  const info = test.info()
  const baseURL = String(info.project.use.baseURL)
  const browser = await chromium.launch({
    channel: 'chrome',
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${wav}%noloop`,
    ],
  })
  try {
    // Desktop Chrome, said outright: inside the test runner a new context would otherwise take
    // the phone project's Pixel 7 settings, and Nod would rightly switch to Android's mode.
    const context = await browser.newContext({
      baseURL,
      viewport: { width: 390, height: 844 },
      isMobile: false,
      hasTouch: false,
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
      permissions: ['microphone'],
    })
    const page = await context.newPage()
    await page.addInitScript(shim)
    const engine = () =>
      page.evaluate(
        () =>
          (window as unknown as { __real: { starts: number; finals: string[]; log: string[] } })
            .__real,
      )
    try {
      await page.goto('/')
      await kitchenCard(page).click()
      await page.getByRole('link', { name: 'Record a change' }).click()
      await page.getByRole('button', { name: 'Tap to talk' }).click()
      // Ten seconds of quiet after the last word: Nod stops by itself and says so.
      await expect(page.getByText('Stopped after a quiet spell.', { exact: true })).toBeVisible({
        timeout: 40_000,
      })
      await expect(page.locator('#announcer')).toHaveText(
        'Recording stopped. Words added to your note.',
      )
      const note = await page.getByRole('textbox', { name: 'Your note' }).inputValue()
      return { note, ...(await engine()) }
    } finally {
      const log = await engine()
        .then((e) => e.log.join('\n'))
        .catch(() => 'No log: the page had gone.')
      await info.attach('engine events', { body: log, contentType: 'text/plain' })
    }
  } finally {
    await browser.close()
  }
}

/** Nod's part, whatever Chrome heard: every final result, in order, once each. Chrome's own
 *  words vary a little from run to run, so the content checks stay loose. */
function expectEveryFinalOnce(note: string, finals: string[]) {
  const text = note.toLowerCase()
  let from = 0
  for (const final of finals) {
    const at = text.indexOf(final.toLowerCase(), from)
    expect(at, `"${final}" in the note after character ${from}: "${note}"`).toBeGreaterThanOrEqual(
      from,
    )
    expect(text.indexOf(final.toLowerCase(), at + 1), `"${final}" only once`).toBe(-1)
    from = at + final.length
  }
}

test('the golden note, with a pause before the price, lands in the note once', async () => {
  test.setTimeout(60_000)
  const wav = recording(
    'golden-pause',
    "Sarah's asked for an extra double power point on the end of the island bench. [[slnc 2500]] Two-twenty all up, won't hold us up.",
  )
  const { note, finals, starts } = await sayIntoRecord(wav)
  expect(finals.length).toBeGreaterThan(0)
  expectEveryFinalOnce(note, finals)
  expect(note).toMatch(/island bench/i)
  // Chrome writes a spoken price as digits; the prompt and the quote check expect that (D51).
  expect(note).toMatch(/\b220\b/)
  test.info().annotations.push({
    type: 'engine',
    description: `${starts} session${starts === 1 ? '' : 's'}; the note: "${note}"`,
  })
})

test('a price said first is kept, even when Chrome leaves it out of its final words (D50)', async () => {
  test.setTimeout(60_000)
  const wav = recording(
    'price-first',
    "Two-twenty all up. [[slnc 700]] Sarah's asked for an extra double power point on the end of the island bench, won't hold us up.",
  )
  const { note, finals } = await sayIntoRecord(wav)
  expectEveryFinalOnce(note, finals)
  expect(note).toMatch(/^220\b/)
  expect(note).toMatch(/island bench/i)
  const dropped = !finals.join(' ').includes('220')
  test.info().annotations.push({
    type: 'rescue',
    description: dropped
      ? `Chrome's final words left out the price, and Nod kept it: "${note}"`
      : `Chrome kept the price this time: "${note}"`,
  })
})
