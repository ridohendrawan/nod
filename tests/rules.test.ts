import { describe, expect, it } from 'vitest'
import { evaluate, type DraftInput, type RuleContext } from '../shared/rules/index.ts'

const NBSP = '\u00a0'
const plain = (s: string | null) => (s ?? '').replaceAll(NBSP, ' ')

// The golden path: Sarah's power point on the QLD kitchen (handover.md 2).
const powerPoint: DraftInput = {
  title: 'Extra double power point',
  items: [{ text: 'Add a double power point on the end of the island bench' }],
  requested_by: 'owner',
  reason: null,
  price_cents: 22_000,
  price_method: null,
  delay_days: 0,
  payment_timing: null,
  permit_change: null,
  work_effect: null,
  photo_id: null,
  date_requested: '2026-10-01',
}

const kitchen: RuleContext = {
  state: 'QLD',
  contract_date: '2026-07-20',
  contract_price_cents: 4_750_000,
  total_now_cents: 4_895_000,
  today: '2026-10-01',
  sent: false,
  approved: false,
}

const vic = (over: Partial<RuleContext> = {}): RuleContext => ({
  ...kitchen,
  state: 'VIC',
  contract_date: '2026-08-24',
  ...over,
})
const draft = (over: Partial<DraftInput> = {}): DraftInput => ({ ...powerPoint, ...over })
const ids = (e: ReturnType<typeof evaluate>) => e.checks.map((c) => c.id)
const noteIds = (e: ReturnType<typeof evaluate>) => e.notes.map((n) => n.id)

describe('Queensland (D57)', () => {
  it('blocks the golden note on one gap: when it’s paid', () => {
    const e = evaluate(powerPoint, kitchen, 'Sarah')
    expect(e.heading).toBe('Queensland checklist')
    expect(e.gaps.map((g) => g.id)).toEqual(['payment'])
    expect(e.can_send).toBe(false)
    expect(e.summary).toBe('1 thing to do before you can send')
    expect(e.blocked_reason).toBe('Before you can send: choose when it’s paid.')
  })

  it('is ready to send once a payment time is chosen', () => {
    const e = evaluate(draft({ payment_timing: 'next_claim' }), kitchen, 'Sarah')
    expect(e.can_send).toBe(true)
    expect(e.summary).toBe('Ready to send')
    expect(e.blocked_reason).toBeNull()
  })

  it('lists the items in the Act’s order, with the client’s name, never “she”', () => {
    const e = evaluate(powerPoint, kitchen, 'Sarah')
    expect(ids(e)).toEqual([
      'description',
      'date_requested',
      'delay',
      'price',
      'payment',
      'copy',
      'written_ok',
    ])
    const labels = e.checks.map((c) => c.label)
    expect(labels).toContain('Date Sarah asked')
    expect(labels).toContain('Sarah gets a copy')
    expect(labels).toContain('Sarah’s written OK before you start')
    expect(labels.join(' ')).not.toMatch(/\bshe\b|\bher\b/i)
  })

  it('shows the date as automatic today, or the date Dan changed it to', () => {
    const today = evaluate(powerPoint, kitchen, 'Sarah').checks.find(
      (c) => c.id === 'date_requested',
    )
    expect(today?.detail).toBe('Automatic: today')
    const changed = evaluate(draft({ date_requested: '2026-09-28' }), kitchen, 'Sarah').checks.find(
      (c) => c.id === 'date_requested',
    )
    expect(plain(changed?.detail ?? null)).toBe('Changed to Mon 28 Sept')
  })

  it('needs no payment time at $0, and calls it “credited” for a credit', () => {
    expect(ids(evaluate(draft({ price_cents: 0 }), kitchen, 'Sarah'))).not.toContain('payment')
    const credit = evaluate(draft({ price_cents: -40_000 }), kitchen, 'Sarah')
    const payment = credit.checks.find((c) => c.id === 'payment')
    expect(payment?.label).toBe('When it’s credited')
    expect(credit.blocked_reason).toBe('Before you can send: choose when it’s credited.')
  })

  it('accepts “how it’s worked out” instead of an amount, but still needs the payment time', () => {
    const e = evaluate(
      draft({ price_cents: null, price_method: 'Supplier’s price plus 10%' }),
      kitchen,
      'Sarah',
    )
    expect(e.checks.find((c) => c.id === 'price')?.state).toBe('done')
    expect(e.gaps.map((g) => g.id)).toEqual(['payment'])
  })

  it('shows the new total on the price item', () => {
    const price = evaluate(powerPoint, kitchen, 'Sarah').checks.find((c) => c.id === 'price')
    expect(price?.detail).toBe('New total $49,170')
  })

  it('completes the copy when sent and the written OK when approved', () => {
    const sent = evaluate(powerPoint, { ...kitchen, sent: true }, 'Sarah')
    expect(sent.checks.find((c) => c.id === 'copy')?.state).toBe('done')
    expect(sent.checks.find((c) => c.id === 'written_ok')?.state).toBe('pending')
    expect(sent.checks.find((c) => c.id === 'written_ok')?.detail).toBe('When Sarah approves')
    const approved = evaluate(powerPoint, { ...kitchen, sent: true, approved: true }, 'Sarah')
    expect(approved.checks.find((c) => c.id === 'written_ok')?.state).toBe('done')
  })

  it('warns about the home warranty premium from $5,000, never as a gap', () => {
    expect(noteIds(evaluate(draft({ price_cents: 499_999 }), kitchen, 'Sarah'))).toEqual([])
    const big = evaluate(draft({ price_cents: 500_000 }), kitchen, 'Sarah')
    expect(big.notes).toEqual([
      {
        id: 'premium',
        tone: 'wait',
        text: 'This adds $5,000 or more. Pay the extra home warranty premium before starting this work.',
      },
    ])
    expect(noteIds(evaluate(draft({ price_cents: -600_000 }), kitchen, 'Sarah'))).toEqual([])
  })

  it('cites the Act and says it isn’t legal advice', () => {
    expect(evaluate(powerPoint, kitchen, 'Sarah').footer).toEqual([
      'QBCC Act 1991 (Qld), Sch 1B, ss 40–41.',
      'Nod checks the content. It isn’t legal advice.',
    ])
  })
})

describe('New South Wales (D22, D56)', () => {
  const nsw: RuleContext = { ...kitchen, state: 'NSW', contract_date: '2026-09-07' }

  it('has the guidance items, the optional ones and the statutory signature item', () => {
    const e = evaluate(powerPoint, nsw, 'Priya')
    expect(ids(e)).toEqual([
      'description',
      'price',
      'new_total',
      'delay',
      'plans',
      'price_method',
      'signed',
    ])
    expect(e.can_send).toBe(true)
    const kinds = Object.fromEntries(e.checks.map((c) => [c.id, c.kind]))
    expect(kinds).toMatchObject({
      plans: 'optional',
      price_method: 'optional',
      new_total: 'auto',
      signed: 'auto',
    })
  })

  it('keeps “Signed by you both” pending until the client signs', () => {
    const signed = evaluate(powerPoint, nsw, 'Priya').checks.find((c) => c.id === 'signed')
    expect(signed).toMatchObject({ state: 'pending', detail: 'When Priya signs' })
    const after = evaluate(powerPoint, { ...nsw, sent: true, approved: true }, 'Priya')
    expect(after.checks.find((c) => c.id === 'signed')?.state).toBe('done')
  })

  it('says the other items are guidance in the footer', () => {
    expect(evaluate(powerPoint, nsw, 'Priya').footer).toEqual([
      'Home Building Act 1989 (NSW), Sch 2, cl 1(2).',
      'Other items: NSW Government guidance.',
      'Nod checks the content. It isn’t legal advice.',
    ])
  })

  it('works out the new contract total once there’s a price', () => {
    const total = (d: DraftInput) =>
      evaluate(d, nsw, 'Priya').checks.find((c) => c.id === 'new_total')
    expect(total(powerPoint)).toMatchObject({ state: 'done', detail: '$49,170' })
    expect(total(draft({ price_cents: null }))).toMatchObject({ state: 'pending' })
  })
})

describe('Victoria before the reform (vic-1995: ss 37-38)', () => {
  const owner = draft({ permit_change: false, work_effect: 'Nothing else changes' })

  it('needs who asked, the effect on the job and the permit answer', () => {
    const e = evaluate(draft(), vic(), 'Tom')
    expect(e.rules.id).toBe('vic-1995')
    expect(e.gaps.map((g) => g.id)).toEqual(['permit', 'work_effect'])
    expect(e.blocked_reason).toBe(
      'Before you can send: say if the permit changes, and 1 more thing.',
    )
  })

  it('asks why only for builder or site changes, with the foreseeability note', () => {
    expect(ids(evaluate(owner, vic(), 'Tom'))).not.toContain('reason')
    const site = evaluate({ ...owner, requested_by: 'site' }, vic(), 'Tom')
    expect(site.gaps.map((g) => g.id)).toEqual(['reason'])
    expect(noteIds(site)).toContain('vic_foreseeable')
  })

  it('treats an unknown “who asked” as a gap, first in Review order', () => {
    const e = evaluate({ ...owner, requested_by: null, price_cents: null }, vic(), 'Tom')
    expect(e.first_gap?.id).toBe('requested_by')
    expect(e.gaps.map((g) => g.id)).toEqual(['requested_by', 'price'])
  })

  describe('the 2% note (D4): owner requests only, no permit change, no delay, at most 2%', () => {
    // 2% of the original $47,500 is $950.
    const two = (d: DraftInput, ctx = vic()) =>
      noteIds(evaluate(d, ctx, 'Tom')).includes('vic_two_percent')

    it('shows for the $220 power point, and at exactly 2%', () => {
      expect(two(owner)).toBe(true)
      expect(two({ ...owner, price_cents: 95_000 })).toBe(true)
    })

    it('doesn’t show a cent over 2%', () => {
      expect(two({ ...owner, price_cents: 95_001 })).toBe(false)
    })

    it('doesn’t show for builder or site changes, a delay, a permit change, or no answer yet', () => {
      expect(two({ ...owner, requested_by: 'builder' })).toBe(false)
      expect(two({ ...owner, requested_by: 'site' })).toBe(false)
      expect(two({ ...owner, delay_days: 0.5 })).toBe(false)
      expect(two({ ...owner, permit_change: true })).toBe(false)
      expect(two({ ...owner, permit_change: null })).toBe(false)
      expect(two({ ...owner, price_cents: null })).toBe(false)
    })

    it('tests a credit by its size (the conservative reading)', () => {
      expect(two({ ...owner, price_cents: -95_000 })).toBe(true)
      expect(two({ ...owner, price_cents: -95_001 })).toBe(false)
    })

    it('never shows for contracts signed under the new rules', () => {
      expect(two(owner, vic({ contract_date: '2027-03-31' }))).toBe(false)
    })

    it('uses the client’s name, never “she”', () => {
      const note = evaluate(owner, vic(), 'Tom').notes.find((n) => n.id === 'vic_two_percent')
      expect(note?.text.startsWith('Tom asked for it')).toBe(true)
      expect(note?.text).not.toMatch(/\bshe\b|\bher\b/i)
    })
  })

  it('warns about the s 137X premium from $5,000 on insured contracts ($20,000 and up)', () => {
    expect(noteIds(evaluate({ ...owner, price_cents: 500_000 }, vic(), 'Tom'))).toContain('premium')
    const small = vic({ contract_price_cents: 1_999_999 })
    expect(noteIds(evaluate({ ...owner, price_cents: 500_000 }, small, 'Tom'))).not.toContain(
      'premium',
    )
  })
})

describe('Victoria after the reform (vic-2025: ss 37-38 as replaced)', () => {
  const ctx = vic({ contract_date: '2027-03-31' })

  it('needs a reason for every change, and no effect-on-the-job item', () => {
    const e = evaluate(draft({ permit_change: false }), ctx, 'Tom')
    expect(e.rules.id).toBe('vic-2025')
    expect(ids(e)).toEqual([
      'description',
      'requested_by',
      'reason',
      'permit',
      'delay',
      'price',
      'date_agreed',
      'signed',
    ])
    expect(e.gaps.map((g) => g.id)).toEqual(['reason'])
    expect(e.checks[0].label).toBe('What’s changing (in detail)')
  })

  it('cites the replaced sections', () => {
    expect(evaluate(powerPoint, ctx, 'Tom').footer[0]).toBe(
      'Domestic Building Contracts Act 1995 (Vic), ss 37–38 as replaced in 2025.',
    )
  })
})

describe('the shared invariant: a description is a title and one item with words', () => {
  it('counts blank titles and blank items as missing', () => {
    const missing = (d: DraftInput) =>
      evaluate(d, kitchen, 'Sarah').checks.find((c) => c.id === 'description')?.state
    expect(missing(draft({ title: '  ' }))).toBe('missing')
    expect(missing(draft({ items: [{ text: '' }, { text: ' ' }] }))).toBe('missing')
    expect(missing(draft({ items: [] }))).toBe('missing')
    expect(missing(draft({ items: [{ text: '' }, { text: 'Add a power point' }] }))).toBe('done')
  })
})
