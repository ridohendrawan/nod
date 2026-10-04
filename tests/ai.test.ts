import { describe, expect, it } from 'vitest'
import { fixtureFor } from '../shared/ai/fixtures.ts'
import {
  CHECK_SIGN,
  DAYS_NOT_MATCHED,
  NO_CHANGE_DEFAULT,
  PRICE_NOT_MATCHED,
  applyGuardrails,
  scrub,
} from '../shared/ai/guardrails.ts'
import { renderUserMessage, SYSTEM_PROMPT } from '../shared/ai/prompt.ts'
import { amountMatchesQuote, normaliseForQuote, quoteAppears } from '../shared/ai/quote.ts'
import { sampleNote, SAMPLE_NOTES } from '../shared/ai/samples.ts'
import { RecordChanges, type RecordedChange } from '../shared/ai/schema.ts'

const EM_DASH = String.fromCharCode(0x2014)

describe('the quote check (D12; research/speech.md 2.11)', () => {
  it.each([
    ['220 all up', 'Sarah asked for a power point, 220 all up, won’t hold us up'],
    ['$220', 'that one is 220 all up'],
    ['2:20 all up', 'double power point 2:20 all up'],
    ['3,200', 'call it 3200 for the lot'],
    ['450 plus GST', 'the fan is 450 + GST'],
    ['- 400', 'drop the strip lights, -400'],
    ['220', 'so ,220 for that'],
    ['Sarah’s asked', 'Sarahs asked for a niche'],
    ['Two-twenty all up', 'Sarah’s asked for it. Two-twenty all up, won’t hold us up.'],
  ])('finds "%s" in the note', (quote, transcript) => {
    expect(quoteAppears(quote, transcript)).toBe(true)
  })

  it('never converts words to digits: Claude must copy the note', () => {
    expect(quoteAppears('two-twenty all up', '220 all up')).toBe(false)
  })

  it('matches whole words only', () => {
    expect(quoteAppears('20 all up', '220 all up')).toBe(false)
  })

  it('checks the one number in a quote against the amount', () => {
    expect(amountMatchesQuote(220, '2:20 all up')).toBe(true)
    expect(amountMatchesQuote(2000, '2 grand')).toBe(true)
    expect(amountMatchesQuote(380, '$400')).toBe(false)
    expect(amountMatchesQuote(-400, 'take $400 off')).toBe(true)
    expect(amountMatchesQuote(220, 'Two-twenty all up')).toBeNull()
  })

  it('normalises money the way the recogniser writes it', () => {
    expect(normaliseForQuote('$1,250 + GST')).toBe('1250 plus gst')
    expect(normaliseForQuote('it’s 2:20')).toBe('its 220')
  })
})

/** A minimal change for guardrail tests; override what each test is about. */
const change = (over: Partial<RecordedChange> = {}): RecordedChange => ({
  title: 'Extra double power point',
  owner_title: 'Extra double power point',
  items: [{ text: 'Add a double GPO', owner_text: 'An extra double power point' }],
  reason: null,
  owner_reason: null,
  requested_by: 'owner',
  price_spoken: null,
  delay_spoken: null,
  payment_spoken: null,
  permit_mentioned: null,
  explicit: true,
  detected_because: null,
  uncertain: [],
  evidence_quote: 'power point',
  ...over,
})
const guard = (c: RecordedChange, transcript: string) =>
  applyGuardrails({ changes: [c], site_note: null, no_change_reason: null }, transcript).changes[0]

describe('the guardrails', () => {
  it('keeps a price only when its quote is in the note', () => {
    const kept = guard(
      change({ price_spoken: { dollars: 220, quote: '220 all up' } }),
      'power point 220 all up',
    )
    expect(kept.price_cents).toBe(22_000)
    expect(kept.ai.quotes.price).toBe('220 all up')
    expect(kept.ai.from_note).toContain('price')

    const invented = guard(
      change({ price_spoken: { dollars: 220, quote: 'two hundred and twenty' } }),
      'power point, no price yet',
    )
    expect(invented.price_cents).toBeNull()
    expect(invented.ai.worth_checking).toEqual([{ field: 'price', text: PRICE_NOT_MATCHED }])
  })

  it('drops a price whose number disagrees with the quote', () => {
    const wrong = guard(
      change({ price_spoken: { dollars: 380, quote: '$400' } }),
      'the lot is $400',
    )
    expect(wrong.price_cents).toBeNull()
  })

  it('leaves “about” prices empty, with a Use button built from his words (D81)', () => {
    const c = guard(
      change({ price_spoken: { dollars: 150, quote: 'about 150 extra in fittings' } }),
      'moved the tap, about 150 extra in fittings',
    )
    expect(c.price_cents).toBeNull()
    expect(c.ai.price_hint).toEqual({
      kind: 'approximate',
      quote: 'about 150 extra in fittings',
      cents: 15_000,
    })
  })

  it('sees “about” just before a quote that left it out', () => {
    const c = guard(
      change({ price_spoken: { dollars: 300, quote: '300' } }),
      'reckon about 300 for that',
    )
    expect(c.ai.price_hint?.kind).toBe('approximate')
  })

  it('leaves “plus GST” prices empty, offering both readings (D81)', () => {
    const c = guard(
      change({ price_spoken: { dollars: 1250, quote: '1250 + GST' } }),
      'the fan is 1250 + GST',
    )
    expect(c.price_cents).toBeNull()
    expect(c.ai.price_hint).toEqual({
      kind: 'plus_gst',
      quote: '1250 + GST',
      cents: 125_000,
      with_gst_cents: 137_500,
    })
  })

  it('treats “inc GST” as a plain price', () => {
    const c = guard(
      change({ price_spoken: { dollars: 550, quote: '550 inc GST' } }),
      'it’s 550 inc GST',
    )
    expect(c.price_cents).toBe(55_000)
    expect(c.ai.price_hint).toBeNull()
  })

  it('asks Dan to check the sign when the words and the amount disagree', () => {
    const c = guard(
      change({ price_spoken: { dollars: 400, quote: 'take 400 off' } }),
      'so take 400 off',
    )
    expect(c.price_cents).toBe(40_000)
    expect(c.ai.worth_checking).toContainEqual({ field: 'price', text: CHECK_SIGN })
    const credit = guard(
      change({ price_spoken: { dollars: -400, quote: 'take 400 off' } }),
      'so take 400 off',
    )
    expect(credit.ai.worth_checking).toEqual([])
  })

  it('keeps a delay only when its quote is in the note and the numbers agree', () => {
    expect(
      guard(change({ delay_spoken: { days: 0, quote: 'won’t hold us up' } }), 'won’t hold us up')
        .delay_days,
    ).toBe(0)
    expect(
      guard(change({ delay_spoken: { days: 0.5, quote: 'half a day' } }), 'half a day more')
        .delay_days,
    ).toBe(0.5)
    const bad = guard(change({ delay_spoken: { days: 3, quote: '2 days' } }), 'adds 2 days')
    expect(bad.delay_days).toBeNull()
    expect(bad.ai.worth_checking).toEqual([{ field: 'delay', text: DAYS_NOT_MATCHED }])
  })

  describe('payment words (D18)', () => {
    const paid = (said: string, dollars = 220) =>
      guard(
        change({ price_spoken: { dollars, quote: `${dollars} all up` }, payment_spoken: said }),
        `${dollars} all up, ${said}`,
      )

    it('maps the three chips', () => {
      expect(paid('with the next progress claim').payment_timing).toBe('next_claim')
      expect(paid('when it’s done').payment_timing).toBe('on_completion')
      expect(paid('on the final payment').payment_timing).toBe('final_payment')
    })

    it('never maps “upfront”, and says why', () => {
      const c = paid('upfront')
      expect(c.payment_timing).toBeNull()
      expect(c.ai.payment_said).toEqual({ quote: 'upfront', upfront: true })
    })

    it('shows words it can’t map above the chips', () => {
      expect(paid('cash on the day').ai.payment_said).toEqual({
        quote: 'cash on the day',
        upfront: false,
      })
    })
  })

  it('scrubs the copy (D13)', () => {
    expect(scrub(`Tiles to the ceiling ${EM_DASH} full height!`)).toBe(
      'Tiles to the ceiling, full height.',
    )
    expect(scrub('Add a double PowerPoint')).toBe('Add a double power point')
    expect(scrub('PowerPoints moved. PowerPoint added')).toBe(
      'Power points moved. Power point added',
    )
    expect(scrub('Adds 1,200 mm of skirting')).toBe('Adds 1,200 mm of skirting')
  })

  it('survives a word the schema only hints at: an odd “requested_by” is unknown, an odd note field is dropped', () => {
    // The SDK sends enums to the model as a description, not a constraint, so a reply can
    // carry other words. One odd word mustn't turn a good draft into "Nod can't read notes".
    const raw = {
      changes: [
        {
          ...change(),
          requested_by: 'the client',
          uncertain: [
            { field: 'colour', note: 'Which white?' },
            { field: 'delay', note: 'Check the sparky can do it Thursday.' },
          ],
        },
      ],
      site_note: null,
      no_change_reason: null,
    }
    const parsed = RecordChanges.parse(raw)
    expect(parsed.changes[0]?.requested_by).toBe('unknown')
    const c = applyGuardrails(parsed, 'power point').changes[0]!
    expect(c.requested_by).toBeNull()
    expect(c.ai.worth_checking).toEqual([
      { field: 'delay', text: 'Check the sparky can do it Thursday.' },
    ])
  })

  it('treats “unknown” as no answer, and fills empty items from the title', () => {
    const c = guard(
      change({ requested_by: 'unknown', items: [{ text: ' ', owner_text: '' }] }),
      'power point',
    )
    expect(c.requested_by).toBeNull()
    expect(c.items).toEqual([
      { text: 'Extra double power point', owner_text: 'Extra double power point' },
    ])
  })

  it('writes “spotted” reasons to follow “Nod spotted this in your note:”', () => {
    const c = guard(
      change({ explicit: false, detected_because: 'You mentioned moving the tap.' }),
      'power point',
    )
    expect(c.ai.detected_because).toBe('you mentioned moving the tap')
  })

  it('gives a friendly reason when nothing changed', () => {
    const r = applyGuardrails(
      { changes: [], site_note: null, no_change_reason: null },
      'all on track',
    )
    expect(r.no_change_reason).toBe(NO_CHANGE_DEFAULT)
  })
})

describe('the five sample notes (ux-spec.md 9) through fixtures and guardrails', () => {
  const run = (id: (typeof SAMPLE_NOTES)[number]['id']) => {
    const note = sampleNote(id, 'Sarah')
    const reply = fixtureFor(note, 'Sarah')
    expect(reply).not.toBeNull()
    expect(RecordChanges.safeParse(reply).success).toBe(true)
    return applyGuardrails(reply!, note)
  }

  it('one change: $220 from his words, no extra time, asked by Sarah', () => {
    const r = run('one_change')
    expect(r.changes).toHaveLength(1)
    expect(r.changes[0]).toMatchObject({
      price_cents: 22_000,
      delay_days: 0,
      requested_by: 'owner',
    })
    expect(r.changes[0].ai.quotes).toEqual({
      price: 'Two-twenty all up',
      delay: 'won’t hold us up',
      payment: null,
    })
    expect(r.log).toEqual([])
  })

  it('two in one breath: +$380 with a day, and a $400 credit', () => {
    const r = run('two_changes')
    expect(r.changes.map((c) => [c.price_cents, c.delay_days])).toEqual([
      [38_000, 1],
      [-40_000, null],
    ])
    expect(r.changes[1].ai.worth_checking).toEqual([])
  })

  it('rambling: spotted in passing, asked by the site, price left for [Use $150], site note kept', () => {
    const r = run('rambling')
    expect(r.changes).toHaveLength(1)
    const c = r.changes[0]
    expect(c.ai.explicit).toBe(false)
    expect(c.requested_by).toBe('site')
    expect(c.price_cents).toBeNull()
    expect(c.ai.price_hint).toMatchObject({ kind: 'approximate', cents: 15_000 })
    expect(c.ai.worth_checking).toEqual([])
    expect(r.site_note).toContain('plasterers are booked for Thursday')
  })

  it('no price said: an empty price and a note under it', () => {
    const c = run('no_price').changes[0]
    expect(c.price_cents).toBeNull()
    expect(c.ai.price_hint).toBeNull()
    expect(c.ai.worth_checking.map((w) => w.field)).toEqual(['price'])
  })

  it('nothing to sign: no changes, the site note and a friendly reason', () => {
    const r = run('nothing')
    expect(r.changes).toEqual([])
    expect(r.no_change_reason).toBe('This sounds like a progress update, not a change to the job.')
  })

  it('serves no fixture for any other note', () => {
    expect(fixtureFor('Add two downlights in the hall for 160', 'Sarah')).toBeNull()
  })
})

describe('the prompt', () => {
  it('has no em dashes and labels the note as data', () => {
    expect(SYSTEM_PROMPT).not.toContain(EM_DASH)
    const message = renderUserMessage(
      {
        title: 'Kitchen renovation',
        client_name: 'Sarah Chen',
        client_first_name: 'Sarah',
        address: '14 Lilly St, Paddington QLD 4064',
        state: 'QLD',
        contract_price_cents: 4_750_000,
        variations: [{ number: 1, title: 'Full-height tiled splashback', status: 'approved' }],
      },
      'Two-twenty all up',
    )
    expect(message).toContain('<note>\nTwo-twenty all up\n</note>')
    expect(message).toContain('- Variation 1: Full-height tiled splashback (approved)')
    expect(message).toContain('Contract price: $47,500')
  })
})
