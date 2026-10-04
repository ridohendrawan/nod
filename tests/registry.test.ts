import { describe, expect, it } from 'vitest'
import { VIC_REFORM_START, ruleSetFor } from '../shared/rules/registry.ts'

describe('ruleSetFor (D55)', () => {
  it('picks one set each for NSW and QLD', () => {
    expect(ruleSetFor('NSW', '2026-09-07').id).toBe('nsw-1989')
    expect(ruleSetFor('QLD', '2026-07-20').id).toBe('qld-1991')
  })

  it('uses Victoria’s old ss 37-38 for contracts signed before the reform starts', () => {
    expect(ruleSetFor('VIC', '2026-08-24').id).toBe('vic-1995')
    expect(ruleSetFor('VIC', '2027-03-30').id).toBe('vic-1995')
  })

  it('uses the reform rules for contracts signed on or after it starts (31 March 2027 at the latest)', () => {
    expect(VIC_REFORM_START).toBe('2027-03-31')
    expect(ruleSetFor('VIC', '2027-03-31').id).toBe('vic-2025')
    expect(ruleSetFor('VIC', '2027-06-01').id).toBe('vic-2025')
  })
})
