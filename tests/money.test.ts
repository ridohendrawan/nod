import { describe, expect, it } from 'vitest'
import {
  MINUS,
  dollarsToCents,
  formatMoney,
  formatSignedMoney,
  hasCents,
  parseMoneyInput,
} from '../shared/money.ts'

describe('formatMoney', () => {
  it('shows whole dollars unless the amount has cents', () => {
    expect(formatMoney(4895000)).toBe('$48,950')
    expect(formatMoney(145050)).toBe('$1,450.50')
    expect(formatMoney(0)).toBe('$0')
  })

  it('can show cents for every amount on a screen', () => {
    expect(formatMoney(22000, { cents: true })).toBe('$220.00')
  })

  it('never signs a total', () => {
    expect(formatMoney(-40000)).toBe('$400')
  })
})

describe('formatSignedMoney', () => {
  it('uses "+" and the true minus (U+2212), never a hyphen', () => {
    expect(formatSignedMoney(22000)).toBe('+$220')
    expect(formatSignedMoney(-40000)).toBe(`${MINUS}$400`)
    expect(formatSignedMoney(-40000)).not.toContain('-')
    expect(formatSignedMoney(0)).toBe('$0')
  })
})

describe('hasCents', () => {
  it('is true when any amount has cents', () => {
    expect(hasCents([22000, 145050])).toBe(true)
    expect(hasCents([22000, null, -40000])).toBe(false)
  })
})

describe('dollarsToCents', () => {
  it('rounds to whole cents, symmetrically for credits', () => {
    expect(dollarsToCents(220)).toBe(22000)
    expect(dollarsToCents(1450.5)).toBe(145050)
    expect(dollarsToCents(-400)).toBe(-40000)
    expect(dollarsToCents(0.105)).toBe(11)
  })
})

describe('parseMoneyInput', () => {
  it('reads the ways Dan types an amount', () => {
    expect(parseMoneyInput('220')).toBe(22000)
    expect(parseMoneyInput('$220')).toBe(22000)
    expect(parseMoneyInput('1,450.50')).toBe(145050)
    expect(parseMoneyInput('1450.5')).toBe(145050)
    expect(parseMoneyInput(' 3 200 ')).toBe(320000)
  })

  it('refuses anything that is not a plain amount', () => {
    for (const bad of ['', 'abc', '2:20', '1,45', '12.345', '-400', '1e5', '$']) {
      expect(parseMoneyInput(bad), bad).toBeNull()
    }
  })

  it('refuses amounts too large for the database', () => {
    expect(parseMoneyInput('20,000,000')).toBe(2_000_000_000)
    expect(parseMoneyInput('25,000,000')).toBeNull()
  })
})
