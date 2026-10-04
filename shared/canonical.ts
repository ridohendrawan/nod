// The canonical content of a sent version and its fingerprint (architecture.md 3; D5, D7).
// Sarah approves exactly this. The contract total is left out on purpose (D5): the totals she
// was shown are stored with her decision instead.

import { sha256Hex } from './encoding.ts'
import type { PaymentTiming, RequestedBy } from './copy.ts'
import type { StateCode } from './states.ts'

export type CanonicalItem = { text: string; owner_text: string }

export type CanonicalContent = {
  title: string
  owner_title: string
  items: CanonicalItem[]
  reason: string | null
  owner_reason: string | null
  requested_by: RequestedBy | null
  price_cents: number | null
  price_method: string | null
  delay_days: number | null
  payment_timing: PaymentTiming | null
  permit_change: boolean | null
  work_effect: string | null
  date_requested: string
  /** The photo's id in the browser's photo store (IndexedDB), if any. */
  photo_id: string | null
}

export type Canonical = {
  v: 1
  variation: { id: string; number: number; version: number }
  job: { id: string; title: string; address: string; state: StateCode }
  builder: { name: string; business: string }
  owner: { name: string }
  rules: { id: string; law: string }
  content: CanonicalContent
}

/** JSON with object keys sorted at every level and no whitespace: equal content, equal string. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Non-finite number')
    return JSON.stringify(value) ?? 'null'
  }
  if (Array.isArray(value))
    return `[${value.map((v) => stableStringify(v === undefined ? null : v)).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
}

/** sha256 hex of the canonical object. */
export function fingerprint(canonical: Canonical): Promise<string> {
  return sha256Hex(stableStringify(canonical))
}

/** The record number people see and read aloud: "7F3A-2C91" (first 8 hex characters). */
export function recordNumber(fp: string): string {
  const head = fp.slice(0, 8).toUpperCase()
  return `${head.slice(0, 4)}-${head.slice(4, 8)}`
}
