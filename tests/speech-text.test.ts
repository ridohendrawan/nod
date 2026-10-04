// The recogniser's results into words in Dan's note (src/builder/record/speechText.ts), replayed
// against the Chrome 154 sessions we recorded (research/speech.md 2.4, 2.6 and Appendix A; the
// raw traces are in tests/fixtures/speech-traces). Each trace logs every event with its time,
// `resultIndex`, and each result's index, finality and transcript, so the events rebuild exactly.
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { appendDictation, createAssembler, type SREvent } from '../src/builder/record/speechText.ts'

type Logged = {
  t: number
  type: string
  error?: string
  resultIndex?: number
  len?: number
  results?: { i: number; final: boolean; alts: { t: string; c: number }[] }[]
}

const runs = new URL('./fixtures/speech-traces/', import.meta.url)
const TRACES = readdirSync(runs)
  .filter((f) => f.endsWith('.txt'))
  .sort()

const load = (file: string): Logged[] =>
  readFileSync(new URL(file, runs), 'utf8')
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line) as Logged)

/** Chrome's event, rebuilt: `results` is as long as the session's list, filled where logged. */
function eventOf(e: Logged): SREvent {
  const results: Record<number, unknown> & { length: number } = { length: e.len ?? 0 }
  for (const r of e.results ?? []) {
    const alts: Record<number, unknown> & { length: number; isFinal: boolean } = {
      length: r.alts.length,
      isFinal: r.final,
    }
    r.alts.forEach((a, k) => (alts[k] = { transcript: a.t, confidence: a.c }))
    results[r.i] = alts
  }
  return { resultIndex: e.resultIndex ?? 0, results } as unknown as SREvent
}

/** What Dan's note would hold after the session, the way the hook feeds it: a new assembler
 *  per session, commits as they come, and a flush on `end` or `error`. */
function replay(file: string): { note: string; finals: string[]; rescued: string[] } {
  let assembler = createAssembler()
  let note = ''
  const finals: string[] = []
  const rescued: string[] = []
  for (const e of load(file)) {
    if (e.type === 'start') assembler = createAssembler()
    if (e.type === 'result') {
      for (const r of e.results ?? []) {
        if (r.final && r.i >= (e.resultIndex ?? 0)) finals.push(r.alts[0]!.t.trim())
      }
      for (const chunk of assembler.onResult(eventOf(e), e.t).commit) {
        note = appendDictation(note, chunk)
        if (!finals.includes(chunk)) rescued.push(chunk)
      }
    }
    if (e.type === 'end' || e.type === 'error') {
      for (const chunk of assembler.flush()) {
        note = appendDictation(note, chunk)
        rescued.push(chunk)
      }
    }
  }
  return { note, finals, rescued }
}

const capitalised = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

describe('the rescue rule on the recorded Chrome sessions (research/speech.md 2.4)', () => {
  it('found all 19 traces', () => {
    expect(TRACES).toHaveLength(19)
  })

  it.each(['E1-numbers.txt', 'E14-numbers-enUS.txt', 'E15-numbers-repeat.txt'])(
    '%s: the opening "220" and "that\'s three" that Chrome replaced come back, in order',
    (file) => {
      const { note, rescued } = replay(file)
      expect(rescued).toEqual(['220', "that's three"])
      expect(note.startsWith("220 that's three take $400 off it'll be a grand plus GST")).toBe(true)
    },
  )

  it.each(['E31-start1.txt', 'E32-start2.txt', 'E33-start1-b.txt'])(
    '%s: a short opening phrase ("Two-twenty all up." then a pause) isn\'t lost',
    (file) => {
      const { note, rescued } = replay(file)
      expect(rescued).toEqual(['220'])
      expect(note).toMatch(
        /^220 Sarah's asked for an extra double (PowerPoint|power point) on the end of the island bench$/,
      )
    },
  )

  it('E11, a single-shot session that never sends a final, still keeps the whole sentence', () => {
    const { note, finals, rescued } = replay('E11-single.txt')
    expect(finals).toEqual([])
    expect(rescued).toEqual(["Sarah's asked for an extra", '220'])
    expect(note).toBe("Sarah's asked for an extra 220")
  })

  it('E9, an abort: flushing keeps the words Chrome showed (the hook decides whether to)', () => {
    const { note, finals } = replay('E9-abort.txt')
    expect(finals).toEqual([])
    expect(note).toBe(
      'Sarah is asked for an extra double PowerPoint on the end of the island bench',
    )
  })

  it('E8, a stop mid-word: the last final is the note, nothing added', () => {
    const { note, rescued } = replay('E8-stop.txt')
    expect(rescued).toEqual([])
    expect(note).toBe(
      'Sarah is asked for an extra double PowerPoint on the end of the island bench 2',
    )
  })

  it.each([
    'E10-double.txt',
    'E2-note2.txt',
    'E21-pause1-a.txt',
    'E22-pause1-b.txt',
    'E3-trade.txt',
    'E34-longsilence.txt',
    'E41-iframe-same-noallow.txt',
    'E45-iframe-same-self-allow.txt',
  ])('%s: no false rescues; the note is exactly the finals', (file) => {
    const { note, finals, rescued } = replay(file)
    expect(finals.length).toBeGreaterThan(0)
    expect(rescued).toEqual([])
    expect(note).toBe(capitalised(finals.join(' ')))
  })

  it.each(['E42-iframe-same-parentpolicy-none.txt', 'E43-iframe-cross-noallow.txt'])(
    '%s: no microphone, no words',
    (file) => {
      expect(replay(file).note).toBe('')
    },
  )

  it.each(TRACES)('%s: every final lands in the note once, in the order Chrome sent it', (file) => {
    const { note, finals } = replay(file)
    const lower = note.toLowerCase()
    let from = 0
    for (const f of finals) {
      const at = lower.indexOf(f.toLowerCase(), from)
      expect(at, `"${f}" after position ${from}`).toBeGreaterThanOrEqual(from)
      from = at + f.length
      expect(lower.split(f.toLowerCase()).length - 1, `"${f}" appears once`).toBe(1)
    }
  })
})

// Synthetic events for the edges the recordings don't pin.
const interim = (text: string): SREvent =>
  eventOf({
    t: 0,
    type: 'result',
    resultIndex: 0,
    len: 1,
    results: [{ i: 0, final: false, alts: [{ t: text, c: 0.01 }] }],
  })
const final = (i: number, text: string): SREvent =>
  eventOf({
    t: 0,
    type: 'result',
    resultIndex: i,
    len: i + 1,
    results: [{ i, final: true, alts: [{ t: text, c: 0.9 }] }],
  })

describe('the rescue rule at its edges', () => {
  it('needs more than a second between interims, and a different first word', () => {
    const a = createAssembler()
    a.onResult(interim('two-twenty all up'), 0)
    expect(a.onResult(interim('that is three'), 1000).commit).toEqual([]) // exactly 1 s: not yet
    const b = createAssembler()
    b.onResult(interim('two-twenty all up'), 0)
    expect(b.onResult(interim('that is three'), 1001).commit).toEqual(['two-twenty all up'])
    const c = createAssembler()
    c.onResult(interim('two-twenty'), 0)
    expect(c.onResult(interim('two-twenty all up'), 5000).commit).toEqual([]) // Chrome refining
  })

  it('a final clears the pending interim, so nothing is committed twice', () => {
    const a = createAssembler()
    a.onResult(interim('two-twenty all up'), 0)
    expect(a.onResult(final(0, 'two-twenty all up'), 300).commit).toEqual(['two-twenty all up'])
    expect(a.flush()).toEqual([])
  })

  it('commits each final index once, even if Chrome sends it again', () => {
    const a = createAssembler()
    expect(a.onResult(final(0, 'first'), 0).commit).toEqual(['first'])
    expect(a.onResult(final(0, 'first'), 10).commit).toEqual([])
  })

  it('is one per session: indexes restart at 0, so a new session needs a new assembler', () => {
    const shared = createAssembler()
    shared.onResult(final(0, 'first session'), 0)
    expect(shared.onResult(final(0, 'second session'), 100).commit).toEqual([]) // lost if reused
    const fresh = createAssembler()
    expect(fresh.onResult(final(0, 'second session'), 100).commit).toEqual(['second session'])
  })

  it('flush empties the pending words', () => {
    const a = createAssembler()
    a.onResult(interim('two-twenty all up'), 0)
    expect(a.flush()).toEqual(['two-twenty all up'])
    expect(a.flush()).toEqual([])
  })
})

describe('appendDictation (research/speech.md 2.6)', () => {
  it.each([
    ['', 'sarah asked for a power point', 'Sarah asked for a power point'],
    ['   ', 'two-twenty', 'Two-twenty'],
    ['Sarah asked', 'two-twenty all up', 'Sarah asked two-twenty all up'],
    ['Sarah asked.', 'two-twenty all up', 'Sarah asked. Two-twenty all up'],
    ['Is that right?', 'yes it is', 'Is that right? Yes it is'],
    ['Done!', 'next', 'Done! Next'],
    ['Sarah asked ', 'two-twenty', 'Sarah asked two-twenty'],
    ['Sarah asked\n', 'two-twenty', 'Sarah asked\ntwo-twenty'],
    ['Sarah asked', '  two   twenty  ', 'Sarah asked two twenty'],
    ['Sarah asked', '   ', 'Sarah asked'],
  ])('%j + %j gives %j', (current, chunk, expected) => {
    expect(appendDictation(current, chunk)).toBe(expected)
  })
})
