import { describe, expect, it } from 'vitest'
import { builder, owner } from '../shared/copy.ts'
import { MINUS } from '../shared/money.ts'

describe('Dan’s words', () => {
  it('names variations by number, drafts as Draft (D8)', () => {
    expect(builder.variationName(2)).toBe('Variation 2')
    expect(builder.variationName(null)).toBe('Draft')
    expect(builder.variationTag(2)).toBe('V2')
  })

  it('signs prices and says No charge for $0', () => {
    expect(builder.price(22000)).toBe('+$220')
    expect(builder.price(-40000)).toBe(`${MINUS}$400`)
    expect(builder.price(0)).toBe('No charge')
    expect(builder.price(null)).toBeNull()
  })

  it('counts days compactly, with halves', () => {
    expect(builder.days(0)).toBe('No extra time')
    expect(builder.days(0.5)).toBe('+½ day')
    expect(builder.days(1)).toBe('+1 day')
    expect(builder.days(1.5)).toBe('+1½ days')
    expect(builder.days(5)).toBe('+5 days')
  })

  it('labels statuses with the client’s name', () => {
    expect(builder.status('sent', 'Sarah')).toEqual({ text: 'Waiting on Sarah', tone: 'wait' })
    expect(builder.status('declined', 'Sarah')).toEqual({ text: 'Sarah said no', tone: 'stop' })
    expect(builder.status('question', 'Sarah').tone).toBe('ask')
  })

  it('never offers payment upfront (D18)', () => {
    const all = ['next_claim', 'on_completion', 'final_payment'] as const
    for (const t of all) expect(builder.payment(t, false).toLowerCase()).not.toContain('upfront')
    expect(builder.payment('next_claim', true)).toBe('Off the next progress claim')
  })
})

describe('Sarah’s words: no symbols (D78) and working days (D80)', () => {
  it('describes the price in words', () => {
    expect(owner.price(22000)).toBe('Adds $220 to the price')
    expect(owner.price(-40000)).toBe('Takes $400 off the price')
    expect(owner.price(0)).toBe('No change to the price')
    expect(owner.saving(-40000)).toBe('You save $400')
    expect(owner.saving(22000)).toBeNull()
  })

  it('never shows "+", the minus sign or an arrow', () => {
    const lines = [
      owner.price(22000),
      owner.price(-40000),
      owner.days(2),
      owner.payment('next_claim', false),
    ]
    for (const line of lines) expect(line).not.toMatch(/[+−→-]/)
  })

  it('says delays in working days', () => {
    expect(owner.days(0)).toBe('No extra time')
    expect(owner.days(0.5)).toBe('About half a working day')
    expect(owner.days(1)).toBe('About 1 extra working day')
    expect(owner.days(2)).toBe('About 2 extra working days')
    expect(owner.days(1.5)).toBe('About 1 and a half extra working days')
    expect(owner.days(5)).toBe('About 1 extra week (5 working days)')
    expect(owner.days(10)).toBe('About 2 extra weeks (10 working days)')
  })

  it('describes payment timing and credits', () => {
    expect(owner.payment('next_claim', false)).toBe('Added to your next progress payment')
    expect(owner.payment('final_payment', true)).toBe('Taken off your final payment')
  })
})
