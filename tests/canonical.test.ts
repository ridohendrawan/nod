import { describe, expect, it } from 'vitest'
import { type Canonical, fingerprint, recordNumber, stableStringify } from '../shared/canonical.ts'

const base: Canonical = {
  v: 1,
  variation: { id: 'v1', number: 2, version: 1 },
  job: {
    id: 'j1',
    title: 'Kitchen renovation',
    address: '14 Lilly St, Paddington QLD 4064',
    state: 'QLD',
  },
  builder: { name: 'Dan', business: 'Brightside Renovations' },
  owner: { name: 'Sarah Chen' },
  rules: { id: 'qld-1991', law: 'QBCC Act 1991 (Qld), Sch 1B, ss 40–41' },
  content: {
    title: 'Extra double power point on island',
    owner_title: 'Extra double power point on the island bench',
    items: [{ text: 'Supply and install a double GPO', owner_text: 'An extra double power point' }],
    reason: null,
    owner_reason: null,
    requested_by: 'owner',
    price_cents: 22000,
    price_method: null,
    delay_days: 0,
    payment_timing: 'next_claim',
    permit_change: null,
    work_effect: null,
    date_requested: '2026-10-01',
    photo_id: null,
  },
}

describe('stableStringify', () => {
  it('sorts keys at every level and adds no whitespace', () => {
    expect(stableStringify({ b: 1, a: { d: [3, { y: 1, x: 2 }], c: null } })).toBe(
      '{"a":{"c":null,"d":[3,{"x":2,"y":1}]},"b":1}',
    )
  })

  it('drops undefined object fields but keeps null', () => {
    expect(stableStringify({ a: undefined, b: null })).toBe('{"b":null}')
  })
})

describe('fingerprint', () => {
  it('is the same for the same content, whatever the key order', async () => {
    // Rebuild every object with its keys in reverse order.
    const reverseKeys = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(reverseKeys)
      if (value === null || typeof value !== 'object') return value
      return Object.fromEntries(
        Object.entries(value)
          .reverse()
          .map(([k, v]) => [k, reverseKeys(v)]),
      )
    }
    const reversed = reverseKeys(base) as Canonical
    expect(Object.keys(reversed)[0]).toBe('content')
    expect(await fingerprint(reversed)).toBe(await fingerprint(base))
  })

  it('changes when anything Sarah agrees to changes', async () => {
    const fp = await fingerprint(base)
    const priced = { ...base, content: { ...base.content, price_cents: 26000 } }
    const bumped = { ...base, variation: { ...base.variation, version: 2 } }
    expect(await fingerprint(priced)).not.toBe(fp)
    expect(await fingerprint(bumped)).not.toBe(fp)
  })

  it('is 64 hex characters, shown as an 8-character record number', async () => {
    const fp = await fingerprint(base)
    expect(fp).toMatch(/^[0-9a-f]{64}$/)
    expect(recordNumber(fp)).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/)
    expect(recordNumber('7f3a2c91' + '0'.repeat(56))).toBe('7F3A-2C91')
  })
})
