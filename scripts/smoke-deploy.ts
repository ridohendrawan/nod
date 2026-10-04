// After a deploy: check the public site's pages, rewrites, headers and the AI function, without
// calling the model (so it costs nothing). In demo mode (no AI key, D95) the golden sample note
// gets its prepared draft, and any other note gets "demo". Run it against the production URL:
//
//   node scripts/smoke-deploy.ts https://nod-good.vercel.app
//   node scripts/smoke-deploy.ts --live    with ANTHROPIC_API_KEY in Vercel (and a deploy after
//                                          it): the golden note through Claude (about a cent)
//
// Exit code 1 if anything fails.

import { sampleNote } from '../shared/ai/samples.ts'
import type { NotesRequest } from '../shared/ai/schema.ts'
import type { NotesApiResponse } from '../shared/types.ts'

const args = process.argv.slice(2)
const base = (args.find((a) => !a.startsWith('--')) ?? 'https://nod-good.vercel.app').replace(
  /\/+$/,
  '',
)
const live = args.includes('--live')
let failures = 0

function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

async function get(path: string, init?: RequestInit): Promise<{ res: Response; text: string }> {
  const res = await fetch(`${base}${path}`, { redirect: 'manual', ...init })
  return { res, text: await res.text() }
}

const header = (res: Response, name: string) => res.headers.get(name) ?? ''

// Dan's app, and the security headers on every page (D39, D91)
const home = await get('/')
check(
  'Dan’s app loads',
  home.res.status === 200 && home.text.includes('<title>Nod</title>'),
  `status ${home.res.status}`,
)
const csp = header(home.res, 'content-security-policy')
/** One directive's sources, exactly: "connect-src 'self'" gives "'self'". */
const directive = (name: string) =>
  csp
    .split(';')
    .map((d) => d.trim())
    .find((d) => d.startsWith(`${name} `))
    ?.slice(name.length + 1) ?? ''
check(
  'CSP allows only this site',
  directive('default-src') === "'self'" && directive('connect-src') === "'self'",
  `connect-src ${directive('connect-src')}`,
)
check('CSP lets the demo stage frame Nod', directive('frame-ancestors') === "'self'")
check(
  'the microphone is allowed for Nod only',
  header(home.res, 'permissions-policy').includes('microphone=(self)'),
)
check('search engines are kept out', header(home.res, 'x-robots-tag').includes('noindex'))
check('nosniff', header(home.res, 'x-content-type-options') === 'nosniff')
check(
  'Dan’s pages send a short referrer',
  header(home.res, 'referrer-policy') === 'strict-origin-when-cross-origin',
)

// Client-side routes fall back to Dan's app
const deep = await get('/job/anything')
check(
  'a deep link serves Dan’s app',
  deep.res.status === 200 && deep.text.includes('<title>Nod</title>'),
)

// Sarah's page is its own HTML with neutral preview text (D86)
const sarah = await get('/o/not-a-real-token')
check(
  'Sarah’s link serves her page',
  sarah.res.status === 200 && sarah.text.includes('<title>A change to your job</title>'),
)
check('her page sends no referrer', header(sarah.res, 'referrer-policy') === 'no-referrer')
check(
  'her page’s preview text has no names or amounts',
  !/\$\d|Sarah|Dan|Brightside/.test(sarah.text),
)

// Hashed assets are cached for good, and no page's scripts carry zod or the Anthropic SDK (D46):
// zod's eval probe would trip the CSP on every page load.
const scripts = [
  ...new Set([...`${home.text}${sarah.text}`.matchAll(/\/assets\/[^"']+\.js/g)].map((m) => m[0])),
]
if (scripts.length > 0) {
  const loaded = await Promise.all(scripts.map((s) => get(s)))
  check(
    'hashed assets are cached',
    loaded.every((a) => header(a.res, 'cache-control').includes('immutable')),
    `${scripts.length} scripts`,
  )
  const heavy = scripts.filter((_, i) =>
    /\bZodError\b|api\.anthropic\.com/.test(loaded[i]?.text ?? ''),
  )
  check('the pages’ scripts carry no zod or Anthropic SDK', heavy.length === 0, heavy.join(', '))
} else {
  check('found the hashed scripts in the pages', false)
}

// The icons are real images: a missing file at the root is rewritten to Dan's app with a 200, so
// a broken icon would otherwise fail silently. Nod's home-screen icon has its own name, not the
// root default /apple-touch-icon.png, which iOS would also use for Sarah's page (D86).
const icons = await Promise.all(
  [
    ['/favicon.svg', 'image/svg+xml'],
    ['/favicon-owner.svg', 'image/svg+xml'],
    ['/nod-icon-180.png', 'image/png'],
    ['/owner-icon-180.png', 'image/png'],
  ].map(async ([path, type]) => {
    const { res } = await get(path!)
    return { path, ok: res.status === 200 && header(res, 'content-type').startsWith(type!) }
  }),
)
check(
  'the icons are served as images',
  icons.every((i) => i.ok),
  icons
    .filter((i) => !i.ok)
    .map((i) => i.path)
    .join(', '),
)

// A missing asset is a plain 404, never Dan's app: a tab left open across a deploy asks for the
// old build's files, and the app's HTML cached for a year under a script's address would stick.
const missingAsset = await get('/assets/not-a-real-file.js')
check(
  'a missing asset is a 404, not the app',
  missingAsset.res.status === 404 && !missingAsset.text.includes('<title>Nod</title>'),
  `status ${missingAsset.res.status}`,
)

// The AI function is reached (not rewritten to the app) and refuses what it should
const wrongMethod = await get('/api/notes')
check(
  'the AI function answers, not the app',
  wrongMethod.res.status === 405 &&
    header(wrongMethod.res, 'content-type').includes('application/json'),
  `status ${wrongMethod.res.status}`,
)
const crossSite = await get('/api/notes', {
  method: 'POST',
  headers: { 'sec-fetch-site': 'cross-site' },
  body: '{}',
})
check(
  'other sites can’t spend on the AI',
  crossSite.res.status === 403,
  `status ${crossSite.res.status}`,
)
const badBody = await get('/api/notes', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ transcript: '' }),
})
check(
  'a bad request is refused before any model call',
  badBody.res.status === 422,
  `status ${badBody.res.status}`,
)
check('the function never caches', header(badBody.res, 'cache-control') === 'no-store')

// The golden note: demo mode's prepared draft, or with --live, Claude's (D95)
const kitchen: NotesRequest['job'] = {
  title: 'Kitchen renovation',
  client_name: 'Sarah Chen',
  client_first_name: 'Sarah',
  address: '14 Lilly St, Paddington QLD 4064',
  state: 'QLD',
  contract_price_cents: 4_750_000,
  variations: [{ number: 1, title: 'Full-height tiled splashback', status: 'approved' }],
}
type Reply = Partial<NotesApiResponse> & { reason?: string }
async function postNote(transcript: string): Promise<{ status: number; reply: Reply }> {
  const note = await get('/api/notes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ transcript, job: kitchen }),
  })
  try {
    return { status: note.res.status, reply: JSON.parse(note.text) as Reply }
  } catch {
    // Not JSON: a gateway page or the Firewall's plain-text 429. The status says which.
    return { status: note.res.status, reply: {} }
  }
}

const golden = await postNote(sampleNote('one_change', 'Sarah'))
const wanted = live ? 'live' : 'fixture'
const answered = golden.status === 200 && golden.reply.meta?.mode === wanted
check(
  live ? 'a real note reaches Claude and comes back' : 'demo mode drafts the golden sample note',
  answered,
  golden.status === 200
    ? `${golden.reply.meta?.mode ?? '?'}: ${golden.reply.meta?.model ?? '?'} in ${golden.reply.meta?.latency_ms ?? '?'} ms`
    : `status ${golden.status}${golden.reply.reason ? `, ${golden.reply.reason}` : ''}`,
)
if (!answered) {
  if (golden.reply.reason === 'not_configured')
    console.log(
      live
        ? '      Add ANTHROPIC_API_KEY in Vercel, then deploy again (functions read it then).'
        : '      Not configured: the deploy predates demo mode, or NOD_AI_MODE=live is set without a key.',
    )
  if (!live && golden.reply.meta?.mode === 'live')
    console.log(
      '      A key is set, so it called Claude. For the demo, remove the key and redeploy.',
    )
  if (golden.status === 429)
    console.log('      The Firewall limit (15 notes per 10 minutes per IP): wait 10 minutes.')
} else {
  const change = golden.reply.changes?.length === 1 ? golden.reply.changes[0] : undefined
  check(
    'it finds the one change',
    change !== undefined,
    `${golden.reply.changes?.length ?? 0} change(s)`,
  )
  check(
    'the price is the one Dan said, with his words',
    change?.price_cents === 22_000 && /two-twenty/i.test(change.ai.quotes.price ?? ''),
    `price_cents ${String(change?.price_cents)}, quote ${JSON.stringify(change?.ai.quotes.price ?? null)}`,
  )
  check('no delay', change?.delay_days === 0, `delay_days ${String(change?.delay_days)}`)
}
if (!live) {
  const other = await postNote('Two more downlights in the hall, one-sixty all up')
  check(
    'demo mode answers any other note with "demo", so Dan fills it in by hand',
    other.status === 503 && other.reply.reason === 'demo',
    `status ${other.status}${other.reply.reason ? `, ${other.reply.reason}` : ''}`,
  )
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
