// The live-model eval (D14; research/anthropic-api.md 4). Rido runs it with the key in Rido's own
// shell; Claude never handles the key:
//
//   node scripts/eval-notes.ts                  the cases below, about 20 calls (roughly 20 to 30 cents)
//   node scripts/eval-notes.ts --only=samples   just the five sample notes
//   node scripts/eval-notes.ts --forced-tool    one deliberate forced tool_choice call, to record the
//                                               real 400 for ai-misses.md entry 1 (400s aren't billed)
//   node scripts/eval-notes.ts --claude-code    the cases through Claude Code on this machine instead,
//                                               on your own Claude plan, with no key (D96)
//
// It calls Claude exactly as the function does (extract() in api/notes.ts), then checks each
// result against what ux-spec.md 9 and research/speech.md 2.11 expect. Misses go in ai-misses.md.

import Anthropic from '@anthropic-ai/sdk'
import { DEFAULT_MODEL, extract, reasonFor, Unavailable } from '../api/notes.ts'
import { claudeCodeDrafter } from './claude-code.ts'
import { sampleNote } from '../shared/ai/samples.ts'
import type { NotesRequest } from '../shared/ai/schema.ts'
import type { NotesApiResponse } from '../shared/types.ts'

type Expect = {
  changes: number
  /** Per change: cents, null (no price), or 'approximate' / 'plus_gst' (a price hint, D81). */
  prices?: (number | null | 'approximate' | 'plus_gst')[]
  delays?: (number | null)[]
  requestedBy?: (string | null)[]
  explicit?: boolean[]
  siteNote?: boolean
}

type Case = { id: string; group: 'samples' | 'messy' | 'recogniser'; note: string; expect: Expect }

const kitchen: NotesRequest['job'] = {
  title: 'Kitchen renovation',
  client_name: 'Sarah Chen',
  client_first_name: 'Sarah',
  address: '14 Lilly St, Paddington QLD 4064',
  state: 'QLD',
  contract_price_cents: 4_750_000,
  variations: [{ number: 1, title: 'Full-height tiled splashback', status: 'approved' }],
}

const CASES: Case[] = [
  // The five sample notes (ux-spec.md 9)
  {
    id: 'one change',
    group: 'samples',
    note: sampleNote('one_change', 'Sarah'),
    expect: { changes: 1, prices: [22_000], delays: [0], requestedBy: ['owner'] },
  },
  {
    id: 'two in one breath',
    group: 'samples',
    note: sampleNote('two_changes', 'Sarah'),
    expect: { changes: 2, prices: [38_000, -40_000], delays: [1, null] },
  },
  {
    id: 'rambling site note',
    group: 'samples',
    note: sampleNote('rambling', 'Sarah'),
    expect: {
      changes: 1,
      prices: ['approximate'],
      requestedBy: ['site'],
      explicit: [false],
      siteNote: true,
    },
  },
  {
    id: 'no price said',
    group: 'samples',
    note: sampleNote('no_price', 'Sarah'),
    expect: { changes: 1, prices: [null] },
  },
  {
    id: 'nothing to sign',
    group: 'samples',
    note: sampleNote('nothing', 'Sarah'),
    expect: { changes: 0, siteNote: true },
  },

  // Five messy notes (the brief)
  {
    id: 'slang',
    group: 'messy',
    note: 'Sparky reckons we chuck in two more downlights in the hall for one-sixty, Sarah’s keen.',
    expect: { changes: 1, prices: [16_000], requestedBy: ['owner'] },
  },
  {
    id: 'plus GST',
    group: 'messy',
    note: 'Sarah wants the 900 mil rangehood instead, it’s 1250 + GST, won’t hold us up.',
    expect: { changes: 1, prices: ['plus_gst'], delays: [0] },
  },
  {
    id: 'a grand',
    group: 'messy',
    note: 'Sarah’s asked for the shower niche to be double width, call it a grand, adds a day.',
    expect: { changes: 1, prices: [100_000], delays: [1] },
  },
  {
    id: 'misheard number',
    group: 'messy',
    note: 'Sarah is asked for an extra double PowerPoint on the island, it’s 2:20 all up, no extra time.',
    expect: { changes: 1, prices: [22_000], delays: [0] },
  },
  {
    id: 'two items, one price',
    group: 'messy',
    note: 'Sarah wants the vanity and the mirror swapped for the matching set from the showroom, 650 all up, no delay.',
    expect: { changes: 1, prices: [65_000], delays: [0] },
  },

  // The recogniser's formats (research/speech.md 2.11)
  {
    id: '220 all up',
    group: 'recogniser',
    note: 'Sarah wants an extra double power point on the island bench, 220 all up.',
    expect: { changes: 1, prices: [22_000] },
  },
  {
    id: '9:50 all up',
    group: 'recogniser',
    note: 'Sarah wants the soft-close drawers on the island, 9:50 all up.',
    expect: { changes: 1, prices: [95_000] },
  },
  {
    id: '- 400',
    group: 'recogniser',
    note: 'Sarah’s dropping the pantry pull-out, - 400.',
    expect: { changes: 1, prices: [-40_000] },
  },
  {
    id: 'credit of 400',
    group: 'recogniser',
    note: 'No LED strip under the overheads after all, credit of 400.',
    expect: { changes: 1, prices: [-40_000] },
  },
  {
    id: 'take $400 off',
    group: 'recogniser',
    note: 'Sarah doesn’t want the strip lights, take $400 off.',
    expect: { changes: 1, prices: [-40_000] },
  },
  {
    id: 'a grand plus GST',
    group: 'recogniser',
    note: 'Bigger window over the sink, it’ll be a grand plus GST.',
    expect: { changes: 1, prices: ['plus_gst'] },
  },
  {
    id: '2 1/2 k',
    group: 'recogniser',
    note: 'Sarah wants the benchtop upgraded to the thicker one, call it 2 1/2 k.',
    expect: { changes: 1 },
  },
  {
    id: '220 roll up',
    group: 'recogniser',
    note: 'Extra double PowerPoint at the end of the island, 220 roll up, won’t hold us up.',
    expect: { changes: 1, prices: [22_000], delays: [0] },
  },
  {
    id: 'a time, not a price',
    group: 'recogniser',
    note: 'Plumber will be there at 2:20 tomorrow, all on track.',
    expect: { changes: 0 },
  },
]

function priceOf(
  c: NotesApiResponse['changes'][number],
): number | null | 'approximate' | 'plus_gst' {
  return c.price_cents ?? c.ai.price_hint?.kind ?? null
}

function check(res: NotesApiResponse, e: Expect): string[] {
  const misses: string[] = []
  if (res.changes.length !== e.changes)
    misses.push(`changes ${res.changes.length}, expected ${e.changes}`)
  const each = <T>(
    label: string,
    want: T[] | undefined,
    got: (c: NotesApiResponse['changes'][number]) => T,
  ) => {
    want?.forEach((w, i) => {
      const c = res.changes[i]
      if (c && got(c) !== w) misses.push(`${label}[${i}] ${String(got(c))}, expected ${String(w)}`)
    })
  }
  each('price', e.prices, priceOf)
  each('delay', e.delays, (c) => c.delay_days)
  each('requested_by', e.requestedBy, (c) => c.requested_by)
  each('explicit', e.explicit, (c) => c.ai.explicit)
  if (e.siteNote !== undefined && (res.site_note !== null) !== e.siteNote)
    misses.push(`site_note ${res.site_note === null ? 'missing' : 'present'}`)
  return misses
}

/** Claude Sonnet 5.5: $2 in, $10 out, cache reads $0.20 and 5-minute cache writes $2.50 per million. */
function cents(u: NonNullable<NotesApiResponse['meta']['usage']>): number {
  const dollars =
    (u.input_tokens * 2 +
      u.output_tokens * 10 +
      u.cache_read_input_tokens * 0.2 +
      u.cache_creation_input_tokens * 2.5) /
    1_000_000
  return dollars * 100
}

async function forcedToolCheck(): Promise<void> {
  const client = new Anthropic({ maxRetries: 0 })
  try {
    await client.messages.create({
      model: process.env.NOD_MODEL?.trim() || DEFAULT_MODEL,
      max_tokens: 1024,
      tools: [{ name: 'record_changes', input_schema: { type: 'object', properties: {} } }],
      tool_choice: { type: 'tool', name: 'record_changes' },
      messages: [{ role: 'user', content: 'Two-twenty all up.' }],
    })
    console.log('No error: forced tool use was accepted. Record that in ai-misses.md entry 1.')
  } catch (e) {
    if (e instanceof Anthropic.APIError) console.log(`${e.status} ${e.type ?? ''}: ${e.message}`)
    else throw e
  }
}

async function main(): Promise<void> {
  const viaClaudeCode = process.argv.includes('--claude-code')
  if (!viaClaudeCode && !process.env.ANTHROPIC_API_KEY) {
    console.error(
      'Set ANTHROPIC_API_KEY in your own shell first (Nod never asks for it in chat), or run with --claude-code to use Claude Code on this machine.',
    )
    process.exit(1)
  }
  if (process.argv.includes('--forced-tool')) {
    if (viaClaudeCode) {
      console.error(
        'The forced tool check is an API call: it needs ANTHROPIC_API_KEY, not Claude Code.',
      )
      process.exit(1)
    }
    return forcedToolCheck()
  }
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length)
  const cases = CASES.filter((c) => !only || c.group === only)
  const env = { ...process.env, NOD_AI_MODE: viaClaudeCode ? 'claude-code' : 'live' }
  const drafter = viaClaudeCode ? claudeCodeDrafter() : undefined

  let passed = 0
  let totalCents = 0
  const latencies: number[] = []
  for (const c of cases) {
    try {
      const res = await extract({ transcript: c.note, job: kitchen }, env, undefined, drafter)
      const misses = check(res, c.expect)
      latencies.push(res.meta.latency_ms)
      if (res.meta.usage) totalCents += cents(res.meta.usage)
      const cache = res.meta.usage?.cache_read_input_tokens ? ' cache hit' : ''
      if (misses.length === 0) passed += 1
      console.log(
        `${misses.length === 0 ? 'PASS' : 'MISS'}  ${c.group.padEnd(10)} ${c.id.padEnd(22)} ${String(res.meta.latency_ms).padStart(6)} ms${cache}`,
      )
      for (const m of misses) console.log(`      ${m}`)
      for (const ch of res.changes) {
        console.log(
          `      "${ch.title}" price=${String(priceOf(ch))} quote=${JSON.stringify(ch.ai.quotes.price)} days=${String(ch.delay_days)}`,
        )
      }
    } catch (e) {
      const reason = e instanceof Unavailable ? e.reason : reasonFor(e)
      console.log(`FAIL  ${c.group.padEnd(10)} ${c.id.padEnd(22)} ai_unavailable: ${reason}`)
    }
  }
  latencies.sort((a, b) => a - b)
  const median = latencies[Math.floor(latencies.length / 2)] ?? 0
  const p95 = latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))] ?? 0
  console.log(
    `\n${passed} of ${cases.length} passed. Median ${median} ms, 95th percentile ${p95} ms. ${viaClaudeCode ? 'On your own Claude plan, through Claude Code: no API cost.' : `About ${totalCents.toFixed(1)} cents.`}`,
  )
}

await main()
