// After a deploy: open the real site in a real browser. At 390, 360 and 320 px it walks Dan's
// Jobs, Record and Review (by hand, with "Pretend the AI is down"), Sarah's page and a bad link;
// then the golden path as the Loom shows it (a sample note drafts, Dan sends, Sarah approves in
// another tab, Dan's sheet says so) and a typed note's demo answer; on a computer, the home page
// (the demo stage) and the stage's whole flow. Every screen must load with no CSP violations (in any frame), console
// errors, failed requests or sideways scroll. Only production applies vercel.json's CSP, so this
// catches what dev and e2e can't (ai-misses.md entry 25). In demo mode (D95) the drafts are
// prepared, so it never calls Claude or costs anything; it uses 3 of the Firewall's 15 AI calls
// per 10 minutes.
//
//   node scripts/browser-check.ts                       https://nod-good.vercel.app
//   node scripts/browser-check.ts <url> --shots=<dir>   also saves a screenshot of each screen
//
// Exit code 1 if anything fails.

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type BrowserContext, type Page } from '@playwright/test'
import { builder } from '../shared/copy.ts'

const args = process.argv.slice(2)
const base = (args.find((a) => !a.startsWith('--')) ?? 'https://nod-good.vercel.app').replace(
  /\/+$/,
  '',
)
const shots = args.find((a) => a.startsWith('--shots='))?.slice('--shots='.length)
if (shots) mkdirSync(shots, { recursive: true })

let failures = 0
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

type Watched = { page: Page; problems: string[] }
type CspWindow = { __csp?: string[] }

/** A page that records console errors, page errors and failed requests. */
async function open(context: BrowserContext, url: string): Promise<Watched> {
  const page = await context.newPage()
  const problems: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error')
      problems.push(`console: ${m.text()}${m.location().url ? ` at ${m.location().url}` : ''}`)
  })
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`))
  page.on('requestfailed', (r) =>
    problems.push(`request failed: ${r.url()} ${r.failure()?.errorText ?? ''}`),
  )
  page.on('response', (r) => {
    if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`)
  })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.locator('h1').first().waitFor({ timeout: 15_000 })
  return { page, problems }
}

/** What went wrong since the last look: CSP violations in any frame, sideways scroll, and the
 *  page's errors. Clears them, so each screen reports only its own. */
async function issues({ page, problems }: Watched): Promise<string[]> {
  const found: string[] = []
  for (const frame of page.frames()) {
    const csp = await frame
      .evaluate(() => {
        const w = window as unknown as CspWindow
        const seen = w.__csp ?? []
        w.__csp = []
        return seen
      })
      .catch(() => [] as string[])
    found.push(...csp.map((c) => `CSP: ${c}`))
  }
  if (
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
  )
    found.push('scrolls sideways')
  found.push(...problems.splice(0))
  return found
}

/** One screen's verdict. `expected` drops problems the flow is meant to produce (the demo answer
 *  is a 503 from /api/notes, which Chrome also logs). */
async function screen(w: Watched, name: string, file: string, expected?: RegExp): Promise<void> {
  const found = (await issues(w)).filter((i) => !expected?.test(i))
  check(name, found.length === 0, found.join('; '))
  if (shots) {
    await settle(w.page)
    await w.page.screenshot({ path: join(shots, file), fullPage: true })
  }
}

/** Let the short animations finish (a sheet sliding in, Sarah's tick drawing itself), so a
 *  screenshot shows what a person sees a moment later, not a frame mid-way. Endless ones (the
 *  mic's pulse) keep running; three seconds at most. */
async function settle(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () =>
        document
          .getAnimations()
          .every(
            (a) => a.playState !== 'running' || a.effect?.getComputedTiming().endTime === Infinity,
          ),
      undefined,
      { timeout: 3_000 },
    )
    .catch(() => {})
}

const heading = (page: Page, text: string) =>
  page.getByRole('heading', { level: 1, name: text }).waitFor({ timeout: 15_000 })

/** The seeded approved change's link token, read from this browser's IndexedDB. */
const seededToken = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string | null>((resolve, reject) => {
        const req = indexedDB.open('nod')
        req.onerror = () => reject(req.error)
        req.onsuccess = () => {
          const get = req.result.transaction('kv', 'readonly').objectStore('kv').get('state')
          get.onerror = () => reject(get.error)
          get.onsuccess = () => {
            const doc = get.result as { variations?: { owner_token?: string | null }[] } | undefined
            resolve(doc?.variations?.find((v) => v.owner_token)?.owner_token ?? null)
          }
        }
      }),
  )

/** Collect CSP violations in every frame, from the first script on. */
async function listen(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const w = window as unknown as CspWindow
    w.__csp = []
    document.addEventListener('securitypolicyviolation', (e) =>
      w.__csp?.push(
        `${e.violatedDirective} blocked ${e.blockedURI || 'inline'} at ${e.sourceFile}:${e.lineNumber}`,
      ),
    )
  })
}

/** The golden path at 390 px, as the Loom shows it: the "One change" sample note drafts (demo
 *  mode's prepared reply, or Claude's with a key, D95), Dan picks when it's paid and sends,
 *  Sarah approves in another tab of the same browser, and Dan's open sheet says so live. */
async function golden(): Promise<void> {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  })
  await listen(context)
  try {
    const dan = await open(context, `${base}/`)
    const p = dan.page
    await p.getByRole('link', { name: /^Sarah Chen, kitchen renovation/ }).click()
    await p.getByRole('link', { name: 'Record a change' }).click()
    await heading(p, 'What’s changing?')
    const samples = p.getByRole('button', { name: 'Try a sample note' })
    if ((await samples.getAttribute('aria-expanded')) !== 'true') await samples.click()
    await p.getByRole('button', { name: 'One change', exact: true }).click()
    await p.getByRole('button', { name: 'Draft the variation' }).click()
    await heading(p, 'Check the draft')
    const amount = await p.getByRole('textbox', { name: /^Amount in dollars/ }).inputValue()
    check(
      'golden path: the sample note drafts with Dan’s $220 filled in',
      amount === '220',
      `amount ${amount}`,
    )
    const labelled = await p
      .getByText(builder.preparedDraft)
      .waitFor({ timeout: 5_000 })
      .then(
        () => true,
        () => false,
      )
    check(
      'golden path: Review says it’s a demo draft (D95)',
      labelled,
      labelled ? '' : 'no demo label; with an AI key set, this check doesn’t apply',
    )
    await screen(dan, 'golden path: Review of the drafted sample note', 'golden-0-review.png')
    await p.getByRole('radio', { name: 'With the next progress claim' }).check()
    await p.getByRole('button', { name: 'Send to Sarah' }).click()
    const sheet = p.getByRole('dialog', { name: 'Ready for Sarah' })
    await sheet.waitFor({ timeout: 15_000 })
    const text = (await sheet.locator('.sms-bubble').textContent()) ?? ''
    const link = /https?:\/\/\S+\/o\/[\w-]+/.exec(text)?.[0]
    await screen(dan, 'golden path: Dan sends, and the Sent sheet opens', 'golden-1-sent.png')
    check(
      'golden path: the text to Sarah carries her link, in 160 characters',
      Boolean(link) && text.length <= 160,
      text,
    )
    if (!link) return

    const sarah = await open(context, link)
    await heading(
      sarah.page,
      'Dan from Brightside Renovations needs your OK on a change to your kitchen renovation.',
    )
    await screen(sarah, "golden path: Sarah's page", 'golden-2-sarah.png')
    await sarah.page.getByRole('button', { name: 'Approve', exact: true }).click()
    const approve = sarah.page.getByRole('dialog', { name: 'Approve this change' })
    await approve.getByRole('textbox', { name: 'Type your full name' }).fill('Sarah Chen')
    await approve.getByRole('checkbox').check()
    await approve.getByRole('button', { name: 'Approve change' }).click()
    await heading(sarah.page, 'You approved this change')
    await screen(sarah, 'golden path: Sarah approves with her name', 'golden-3-approved.png')

    const flipped = await sheet
      .getByText('Sarah approved it.')
      .waitFor({ timeout: 6_000 })
      .then(
        () => true,
        () => false,
      )
    check('golden path: Dan’s open sheet says "Sarah approved it." within seconds', flipped)
    await screen(dan, 'golden path: Dan’s screen after her answer', 'golden-4-dan.png')
  } catch (e) {
    check(
      'golden path: every step',
      false,
      e instanceof Error ? e.message.split('\n')[0] : String(e),
    )
  } finally {
    await context.close()
  }
}

/** Demo mode (D95) with a note that isn't a sample: the demo message, no Try again, and the
 *  button that opens the samples instead. */
async function demoNote(): Promise<void> {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  })
  await listen(context)
  try {
    const dan = await open(context, `${base}/`)
    const p = dan.page
    await p.getByRole('link', { name: /^Sarah Chen, kitchen renovation/ }).click()
    await p.getByRole('link', { name: 'Record a change' }).click()
    await heading(p, 'What’s changing?')
    await p
      .getByRole('textbox', { name: 'Your note' })
      .fill('Two more downlights in the hall, one-sixty all up')
    await p.getByRole('button', { name: 'Draft the variation' }).click()
    await p.getByText(builder.aiUnavailable.demo).waitFor({ timeout: 15_000 })
    const tryAgain = await p.getByRole('button', { name: 'Try again' }).count()
    const show = p.getByRole('button', { name: 'Show the sample notes' })
    check(
      'demo mode: a note that isn’t a sample says so, with Show the sample notes and no Try again',
      tryAgain === 0 && (await show.count()) === 1,
      `Try again ${tryAgain}, Show the sample notes ${await show.count()}`,
    )
    await screen(dan, 'demo mode: that screen', 'demo-note.png', /\/api\/notes\b/)
  } catch (e) {
    check('demo mode: every step', false, e instanceof Error ? e.message.split('\n')[0] : String(e))
  } finally {
    await context.close()
  }
}

/** The demo stage on a computer (M5; ux-spec 8): Dan's phone texts Sarah, her lock screen shows
 *  the text, and tapping it opens her page in the other phone, which Dan's sheet hears. */
async function stage(): Promise<void> {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    isMobile: false,
    hasTouch: false,
    reducedMotion: 'reduce',
  })
  await listen(context)
  try {
    const w = await open(context, `${base}/demo`)
    const p = w.page
    await p.getByText('No new messages').waitFor({ timeout: 15_000 })
    const dan = p.frameLocator('iframe[title="Dan’s phone: Nod"]')
    await dan.getByRole('link', { name: /^Sarah Chen, kitchen renovation/ }).click()
    await dan.getByRole('link', { name: 'Record a change' }).click()
    const samples = dan.getByRole('button', { name: 'Try a sample note' })
    if ((await samples.getAttribute('aria-expanded')) !== 'true') await samples.click()
    await dan.getByRole('button', { name: 'One change', exact: true }).click()
    await dan.getByRole('button', { name: 'Draft the variation' }).click()
    await dan.getByRole('radio', { name: 'With the next progress claim' }).check()
    await dan.getByRole('button', { name: 'Send to Sarah' }).click()
    await dan.getByRole('button', { name: 'Text it to Sarah' }).click()
    const text = p.getByRole('button', {
      name: /^Messages now Dan \(Brightside Renovations\) Hi Sarah/,
    })
    await text.waitFor({ timeout: 15_000 })
    await text.click()
    const sarah = p.frameLocator('iframe[title="Sarah’s phone: her page"]')
    await sarah
      .getByRole('heading', { level: 1, name: /needs your OK/ })
      .waitFor({ timeout: 15_000 })
    await dan
      .getByRole('dialog', { name: 'Ready for Sarah' })
      .getByText(/^Sarah opened it at /)
      .waitFor({ timeout: 8_000 })
    await screen(
      w,
      'computer: the demo stage (Dan texts Sarah, her lock screen shows it, her page opens)',
      'stage-1440.png',
    )
  } catch (e) {
    check(
      'computer: the demo stage, every step',
      false,
      e instanceof Error ? e.message.split('\n')[0] : String(e),
    )
  } finally {
    await context.close()
  }
}

/** On a computer, the home page is the demo stage: Dan's phone and Sarah's lock screen side by
 *  side, as at /demo, with nothing to click first. */
async function home(): Promise<void> {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    isMobile: false,
    hasTouch: false,
    reducedMotion: 'reduce',
  })
  await listen(context)
  try {
    const w = await open(context, `${base}/`)
    const p = w.page
    await p
      .frameLocator('iframe[title="Dan’s phone: Nod"]')
      .getByRole('link', { name: /^Sarah Chen, kitchen renovation/ })
      .waitFor({ timeout: 15_000 })
    await p.getByText('No new messages').waitFor({ timeout: 15_000 })
    await p.getByRole('button', { name: 'Reset demo data' }).waitFor({ timeout: 5_000 })
    await screen(w, 'computer: the home page is the demo stage, both phones', 'desktop-1440.png')
  } catch (e) {
    check(
      'computer: the home page is the demo stage',
      false,
      e instanceof Error ? e.message.split('\n')[0] : String(e),
    )
  } finally {
    await context.close()
  }
}

const browser = await chromium.launch()
try {
  for (const width of [390, 360, 320]) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      deviceScaleFactor: 2,
    })
    await listen(context)

    const dan = await open(context, `${base}/`)
    const kitchen = dan.page.getByRole('link', { name: /^Sarah Chen, kitchen renovation/ })
    await kitchen.waitFor({ timeout: 15_000 })
    await screen(dan, `${width} px: Jobs`, `${width}-1-jobs.png`)
    const token = await seededToken(dan.page)

    // Record and Review without the AI: the menu's "Pretend the AI is down", then by hand.
    await dan.page.getByRole('button', { name: 'Menu' }).click()
    await dan.page.getByRole('switch', { name: 'Pretend the AI is down' }).click()
    await dan.page.keyboard.press('Escape')
    await kitchen.click()
    await dan.page.getByRole('link', { name: 'Record a change' }).click()
    await heading(dan.page, 'What’s changing?')
    const samples = dan.page.getByRole('button', { name: 'Try a sample note' })
    if ((await samples.getAttribute('aria-expanded')) !== 'true') await samples.click()
    await dan.page.getByRole('button', { name: 'One change', exact: true }).click()
    await screen(dan, `${width} px: Record`, `${width}-2-record.png`)
    await dan.page.getByRole('button', { name: 'Draft the variation' }).click()
    await dan.page.getByRole('button', { name: 'Fill it in by hand' }).click()
    await heading(dan.page, 'Check the draft')
    await screen(dan, `${width} px: Review, by hand`, `${width}-3-review.png`)

    if (token) {
      const sarah = await open(context, `${base}/o/${token}`)
      await screen(sarah, `${width} px: Sarah's page`, `${width}-4-sarah.png`)
    } else {
      check(`${width} px: found the seeded link for Sarah`, false)
    }

    const bad = await open(context, `${base}/o/not-a-real-token`)
    await screen(bad, `${width} px: a link that doesn't exist`, `${width}-5-bad-link.png`)

    await context.close()
  }

  await golden()
  await demoNote()
  await stage()

  await home()
} finally {
  await browser.close()
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
