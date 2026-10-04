import { describe, expect, it } from 'vitest'
import { jobStatusLine, jobsSummaryLine, moneySummary } from '../shared/summary.ts'

describe('moneySummary (the dark money panel)', () => {
  it('adds approved changes to the total and keeps waiting ones separate', () => {
    const m = moneySummary(4750000, [
      { status: 'approved', price_cents: 145000, delay_days: 1 },
      { status: 'sent', price_cents: 22000, delay_days: 0 },
      { status: 'draft', price_cents: 99900, delay_days: 2 },
      { status: 'declined', price_cents: 50000, delay_days: 0 },
    ])
    expect(m).toEqual({
      original_cents: 4750000,
      approved_cents: 145000,
      approved_count: 1,
      approved_days: 1,
      waiting_cents: 22000,
      waiting_count: 1,
      total_cents: 4895000,
      if_approved_cents: 4917000,
    })
  })

  it('counts a credit as a reduction', () => {
    const m = moneySummary(4750000, [{ status: 'approved', price_cents: -40000, delay_days: 0 }])
    expect(m.total_cents).toBe(4710000)
  })
})

describe('jobStatusLine: the first match wins (D27)', () => {
  it('puts questions first, then waiting, then drafts', () => {
    expect(jobStatusLine(['sent', 'question', 'draft'], 'Sarah')).toEqual({
      tone: 'ask',
      text: '1 question from Sarah',
    })
    expect(jobStatusLine(['sent', 'sent', 'draft'], 'Sarah')).toEqual({
      tone: 'wait',
      text: '2 waiting on Sarah',
    })
    expect(jobStatusLine(['draft', 'approved'], 'Sarah').text).toBe('1 draft to send')
  })

  it('says All changes signed or No changes yet', () => {
    expect(jobStatusLine(['approved', 'declined'], 'Sarah')).toEqual({
      tone: 'go',
      text: 'All changes signed',
    })
    expect(jobStatusLine([], 'Tom')).toEqual({ tone: 'neutral', text: 'No changes yet' })
  })
})

describe('jobsSummaryLine', () => {
  it('summarises across jobs', () => {
    expect(jobsSummaryLine(['question']).text).toBe('1 question to answer')
    expect(jobsSummaryLine(['sent', 'sent']).text).toBe('2 changes waiting on clients')
    expect(jobsSummaryLine(['approved']).text).toBe('Everything’s signed')
  })
})
