// Preview links, one per screen: /screens/<name> sets up that one screen of Nod by itself, in any
// browser, so a design tool that imports a page by its address (html.to.design into Figma) gets
// that screen at phone size, never the two-phone stage. /screens lists them all.
//
// Nod keeps its data in the browser with random ids (D91), so a plain link to a draft or a sent
// change can't exist. Each preview resets this browser's demo data and builds the state it needs
// through the same api the screens use. Drafts answer from replies recorded from the demo's own
// prepared drafts (recorded.ts), so no preview calls the AI function or counts against its limit.
import { sampleNote, type SampleNoteId } from '../../../shared/ai/samples.ts'
import { api } from '../../lib/api.ts'
import { ownerApi } from '../../lib/ownerApi.ts'
import { RECORDED } from './recorded.ts'

type Setup =
  | { kind: 'dan'; path: string; press: readonly string[] }
  | { kind: 'sarah'; token: string; open?: 'approve' | 'ask' | 'no' }

type Screen = { name: string; title: string; side: 'dan' | 'sarah'; build: () => Promise<Setup> }

// Every preview runs on Sarah's kitchen job, the demo's golden path.
const CLIENT = 'Sarah'

const dan = (path: string, press: readonly string[] = []): Setup => ({ kind: 'dan', path, press })
const sarah = (token: string, open?: 'approve' | 'ask' | 'no'): Setup => ({
  kind: 'sarah',
  token,
  open,
})

async function kitchen(): Promise<string> {
  const { jobs } = await api.jobs()
  const job = jobs.find((j) => j.title === 'Kitchen renovation') ?? jobs[0]
  if (!job) throw new Error('Nod preview: the demo has no jobs')
  return job.id
}

const record = (jobId: string) => `/job/${jobId}/new`

/** The One change sample, drafted: what Review shows first. */
async function drafted(jobId: string): Promise<string> {
  const { drafts } = await api.notes(jobId, sampleNote('one_change', CLIENT))
  const first = drafts[0]
  if (!first) throw new Error('Nod preview: the sample drafted nothing')
  return first.id
}

/** ...with when it's paid picked, so Send unlocks. */
async function ready(jobId: string): Promise<string> {
  const id = await drafted(jobId)
  await api.updateVariation(id, { payment_timing: 'next_claim' })
  return id
}

/** ...signed and sent: the change and the token in Sarah's link. */
async function sent(jobId: string): Promise<{ id: string; token: string }> {
  const id = await ready(jobId)
  const { variation } = await api.variation(id)
  const { share } = await api.send(id, variation.version)
  const token = new URL(share.owner_url).pathname.split('/').pop() ?? ''
  return { id, token }
}

/** ...and opened on Sarah's side, so her answer can carry what she saw. */
async function opened(jobId: string) {
  const change = await sent(jobId)
  const view = await ownerApi.view(change.token)
  await ownerApi.seen(change.token, view.version)
  return { ...change, fingerprint: view.fingerprint }
}

async function approved(jobId: string) {
  const change = await opened(jobId)
  await ownerApi.approve(change.token, {
    name: 'Sarah Chen',
    agreed: true,
    fingerprint: change.fingerprint,
  })
  return change
}

async function asked(jobId: string) {
  const change = await opened(jobId)
  await ownerApi.question(change.token, 'Can it go on the left end of the bench instead?')
  return change
}

async function answered(jobId: string) {
  const change = await asked(jobId)
  await api.reply(change.id, 'Yes, the left end works. Same price.')
  return change
}

async function declined(jobId: string) {
  const change = await opened(jobId)
  await ownerApi.decline(change.token, {
    reason: 'We’d rather keep the bench clear.',
    fingerprint: change.fingerprint,
  })
  return change
}

async function withdrawn(jobId: string) {
  const change = await opened(jobId)
  await api.withdraw(change.id)
  return change
}

export const SCREENS: readonly Screen[] = [
  { name: 'jobs', title: 'Jobs, Dan’s home', side: 'dan', build: async () => dan('/') },
  { name: 'menu', title: 'The menu', side: 'dan', build: async () => dan('/', ['Menu']) },
  {
    name: 'about',
    title: 'About Nod',
    side: 'dan',
    build: async () => dan('/', ['Menu', 'About Nod']),
  },
  {
    name: 'job',
    title: 'A job and its money',
    side: 'dan',
    build: async () => dan(`/job/${await kitchen()}`),
  },
  {
    name: 'job-details',
    title: 'Job details: state, price and date',
    side: 'dan',
    build: async () => dan(`/job/${await kitchen()}`, ['Queensland rules. Change job details']),
  },
  {
    name: 'record',
    title: 'Record a change',
    side: 'dan',
    build: async () => dan(record(await kitchen())),
  },
  {
    name: 'record-note',
    title: 'Record, with the note',
    side: 'dan',
    build: async () => dan(record(await kitchen()), ['Try a sample note', 'One change']),
  },
  {
    name: 'review',
    title: 'Check the draft',
    side: 'dan',
    build: async () => dan(`/v/${await drafted(await kitchen())}`),
  },
  {
    name: 'review-ready',
    title: 'Check the draft, ready to send',
    side: 'dan',
    build: async () => dan(`/v/${await ready(await kitchen())}`),
  },
  {
    name: 'what-sarah-sees',
    title: 'What Sarah sees',
    side: 'dan',
    build: async () => dan(`/v/${await ready(await kitchen())}`, ['What Sarah sees']),
  },
  {
    name: 'sent',
    title: 'Ready for Sarah: the text to send',
    side: 'dan',
    build: async () => dan(`/v/${(await sent(await kitchen())).id}`, ['Share again']),
  },
  {
    name: 'status',
    title: 'Sent, waiting on Sarah',
    side: 'dan',
    build: async () => dan(`/v/${(await sent(await kitchen())).id}`),
  },
  {
    name: 'status-question',
    title: 'Sarah asked a question',
    side: 'dan',
    build: async () => dan(`/v/${(await asked(await kitchen())).id}`),
  },
  {
    name: 'status-approved',
    title: 'Sarah approved',
    side: 'dan',
    build: async () => dan(`/v/${(await approved(await kitchen())).id}`),
  },
  {
    name: 'job-approved',
    title: 'The job after her yes',
    side: 'dan',
    build: async () => {
      const jobId = await kitchen()
      await approved(jobId)
      return dan(`/job/${jobId}`)
    },
  },
  {
    name: 'two-changes',
    title: 'Two changes in one breath',
    side: 'dan',
    build: async () =>
      dan(record(await kitchen()), [
        'Try a sample note',
        'Two in one breath',
        'Draft the variation',
      ]),
  },
  {
    name: 'nothing-to-sign',
    title: 'Nothing to sign',
    side: 'dan',
    build: async () =>
      dan(record(await kitchen()), ['Try a sample note', 'Nothing to sign', 'Draft the variation']),
  },
  {
    name: 'ai-down',
    title: 'The AI is down: the note is kept',
    side: 'dan',
    build: async () => {
      await api.setAiDown(true)
      return dan(record(await kitchen()), [
        'Try a sample note',
        'One change',
        'Draft the variation',
      ])
    },
  },
  {
    name: 'not-found',
    title: 'A page that doesn’t exist',
    side: 'dan',
    build: async () => dan('/no-such-page'),
  },
  {
    name: 'sarah',
    title: 'Sarah’s page: needs your OK',
    side: 'sarah',
    build: async () => sarah((await sent(await kitchen())).token),
  },
  {
    name: 'sarah-approve',
    title: 'Approve this change',
    side: 'sarah',
    build: async () => sarah((await sent(await kitchen())).token, 'approve'),
  },
  {
    name: 'sarah-approved',
    title: 'You approved this change',
    side: 'sarah',
    build: async () => sarah((await approved(await kitchen())).token),
  },
  {
    name: 'sarah-ask',
    title: 'Ask a question',
    side: 'sarah',
    build: async () => sarah((await sent(await kitchen())).token, 'ask'),
  },
  {
    name: 'sarah-question',
    title: 'Her question and Dan’s reply',
    side: 'sarah',
    build: async () => sarah((await answered(await kitchen())).token),
  },
  {
    name: 'sarah-say-no',
    title: 'Say no',
    side: 'sarah',
    build: async () => sarah((await sent(await kitchen())).token, 'no'),
  },
  {
    name: 'sarah-said-no',
    title: 'You said no',
    side: 'sarah',
    build: async () => sarah((await declined(await kitchen())).token),
  },
  {
    name: 'sarah-withdrawn',
    title: 'Dan withdrew the change',
    side: 'sarah',
    build: async () => sarah((await withdrawn(await kitchen())).token),
  },
  {
    name: 'sarah-bad-link',
    title: 'A link that isn’t working',
    side: 'sarah',
    build: async () => sarah('not-a-real-link'),
  },
]

/** The AI step answers a sample note from its recording; anything else goes to the function. */
function answerNotesFromRecordings(): void {
  const replies = new Map<string, unknown>(
    (Object.keys(RECORDED) as (keyof typeof RECORDED & SampleNoteId)[]).map((id) => [
      sampleNote(id, CLIENT),
      RECORDED[id],
    ]),
  )
  const real = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href)
    if (url.pathname === '/api/notes' && typeof init?.body === 'string') {
      const { transcript } = JSON.parse(init.body) as { transcript?: unknown }
      const reply = typeof transcript === 'string' ? replies.get(transcript) : undefined
      if (reply)
        return new Response(JSON.stringify(reply), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    }
    return real(input, init)
  }
}

function renderIndex(): void {
  document.title = 'Nod screens'
  const root = document.getElementById('root')
  if (!root) return
  const main = document.createElement('main')
  main.className = 'preview-index'
  const h1 = document.createElement('h1')
  h1.textContent = 'Nod, screen by screen'
  const lede = document.createElement('p')
  lede.textContent =
    'Each link opens one screen with its demo data set up, at phone size. Opening one resets the demo data in this browser.'
  main.append(h1, lede)
  for (const [side, heading] of [
    ['dan', 'Dan’s app'],
    ['sarah', 'Sarah’s page'],
  ] as const) {
    const h2 = document.createElement('h2')
    h2.textContent = heading
    const list = document.createElement('ul')
    for (const screen of SCREENS.filter((s) => s.side === side)) {
      const item = document.createElement('li')
      const link = document.createElement('a')
      link.href = `/screens/${screen.name}`
      link.textContent = screen.title
      const path = document.createElement('span')
      path.textContent = `/screens/${screen.name}`
      item.append(link, path)
      list.append(item)
    }
    main.append(h2, list)
  }
  root.replaceChildren(main)
}

/**
 * Runs the preview this address names. Returns the controls to press once Dan's app is on
 * screen, or null when there's no app to show here: the list of screens, or Sarah's page, which
 * is its own page (o.html) and opens next.
 */
export async function runPreview(): Promise<{ press: readonly string[] } | null> {
  const name = location.pathname.replace(/^\/screens\/?/, '').replace(/\/+$/, '')
  const screen = SCREENS.find((s) => s.name === name)
  if (!screen) {
    renderIndex()
    return null
  }
  answerNotesFromRecordings()
  await api.resetDemo()
  await api.setAiDown(false)
  const setup = await screen.build()
  if (setup.kind === 'sarah') {
    location.replace(`/o/${setup.token}${setup.open ? `?open=${setup.open}` : ''}`)
    return null
  }
  history.replaceState(null, '', setup.path)
  return { press: setup.press }
}
