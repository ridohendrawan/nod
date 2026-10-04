// Sarah's card (ux-spec.md 7): built in one place, so Dan's "What Sarah sees" preview and her
// own page can't drift apart ("This is exactly what her page will show"). Words, not symbols,
// on her side (D78); delays in working days (D80).

import { owner, type PaymentTiming, type RequestedBy } from './copy.ts'
import { formatMoney, hasCents, type MoneyOptions } from './money.ts'
import type { StateCode } from './states.ts'

export type OwnerFact = {
  id: 'price' | 'price_method' | 'time' | 'payment' | 'permit' | 'work_effect' | 'asked_by'
  label: string
  value: string
}

export type OwnerCard = {
  business_name: string
  builder_name: string
  builder_mobile: string
  client_first_name: string
  /** As written on the job ("Kitchen renovation"); lower-case it inside sentences. */
  job_title: string
  state: StateCode
  /** The number on her card: "Change 2" (for a draft, the number it will get when sent). */
  number: number
  title: string
  items: string[]
  reason: string | null
  facts: OwnerFact[]
  /** "You save $400" for a credit, shown in go colour (D63). */
  saving: string | null
  /** "Your new contract total" and "Was" (D78). `after_cents` is null until there's a price. */
  totals: { before_cents: number; after_cents: number | null }
  /** Show cents on every amount of this card, or on none ("cents only when an amount has cents"). */
  cents: boolean
  photo_id: string | null
}

/** The content Sarah reads, whatever stage it's at. Dan's words stand in where hers are empty. */
export type OwnerCardContent = {
  title: string
  owner_title: string
  items: readonly { text: string; owner_text: string }[]
  reason: string | null
  owner_reason: string | null
  requested_by: RequestedBy | null
  price_cents: number | null
  price_method: string | null
  delay_days: number | null
  payment_timing: PaymentTiming | null
  permit_change: boolean | null
  work_effect: string | null
  photo_id: string | null
}

const text = (s: string | null | undefined) => (s ?? '').trim()

/** Sarah's title, items and reason, falling back to Dan's where hers are blank. */
export function ownerWording(c: OwnerCardContent): {
  title: string
  items: string[]
  reason: string | null
} {
  const items = c.items.map((i) => text(i.owner_text) || text(i.text)).filter((s) => s.length > 0)
  const reason = text(c.owner_reason) || text(c.reason)
  return { title: text(c.owner_title) || text(c.title), items, reason: reason || null }
}

export function ownerCard(input: {
  content: OwnerCardContent
  number: number
  job: { title: string; client_first_name: string; state: StateCode }
  builder: { name: string; business: string; mobile: string }
  /** The contract total before this change: the original plus approved changes. */
  total_before_cents: number
}): OwnerCard {
  const { content: c, job, builder } = input
  const price = c.price_cents
  const after = price === null ? null : input.total_before_cents + price
  const cents = hasCents([price, input.total_before_cents, after])
  const facts: OwnerFact[] = []

  if (price !== null) {
    facts.push({ id: 'price', label: 'Price', value: owner.price(price, { cents }) })
  } else if (text(c.price_method)) {
    facts.push({
      id: 'price_method',
      label: 'How the price is worked out',
      value: text(c.price_method),
    })
  }
  if (c.delay_days !== null) {
    facts.push({ id: 'time', label: 'Extra time', value: owner.days(c.delay_days) })
  }
  if (c.payment_timing !== null && price !== 0) {
    const credit = price !== null && price < 0
    facts.push({
      id: 'payment',
      label: credit ? 'When it’s credited' : 'When it’s paid',
      value: owner.payment(c.payment_timing, credit),
    })
  }
  if (job.state === 'VIC') {
    if (c.permit_change !== null) {
      facts.push({ id: 'permit', label: 'Permit', value: owner.permit(c.permit_change) })
    }
    if (text(c.work_effect)) {
      facts.push({
        id: 'work_effect',
        label: 'Effect on the rest of the job',
        value: text(c.work_effect),
      })
    }
  }
  if (c.requested_by !== null) {
    facts.push({
      id: 'asked_by',
      label: 'Asked for by',
      value: owner.askedBy(c.requested_by, builder.name),
    })
  }

  const wording = ownerWording(c)
  return {
    business_name: builder.business,
    builder_name: builder.name,
    builder_mobile: builder.mobile,
    client_first_name: job.client_first_name,
    job_title: job.title,
    state: job.state,
    number: input.number,
    title: wording.title,
    items: wording.items,
    reason: wording.reason,
    facts,
    saving: price === null ? null : owner.saving(price, { cents }),
    totals: { before_cents: input.total_before_cents, after_cents: after },
    cents,
    photo_id: c.photo_id,
  }
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

function pricePhrase(c: OwnerCardContent, options: MoneyOptions): string {
  if (c.price_cents === null) return c.price_method ? `“${c.price_method}”` : 'no price'
  if (c.price_cents === 0) return 'no charge'
  return c.price_cents > 0
    ? formatMoney(c.price_cents, options)
    : `a ${formatMoney(c.price_cents, options)} credit`
}

/**
 * What changed between two versions she was sent, in words (D68): "The price changed from $220
 * to $260." Words, not strikethrough, because screen readers don't read strikethrough.
 */
export function describeChanges(prev: OwnerCardContent, next: OwnerCardContent): string[] {
  const out: string[] = []
  const a = ownerWording(prev)
  const b = ownerWording(next)
  if (a.title !== b.title || a.items.join('\n') !== b.items.join('\n')) {
    out.push('The description of the work changed.')
  }
  if ((a.reason ?? '') !== (b.reason ?? '')) out.push('The reason changed.')
  if (
    prev.price_cents !== next.price_cents ||
    (prev.price_method ?? '') !== (next.price_method ?? '')
  ) {
    const options = { cents: hasCents([prev.price_cents, next.price_cents]) }
    out.push(
      `The price changed from ${pricePhrase(prev, options)} to ${pricePhrase(next, options)}.`,
    )
  }
  if (prev.delay_days !== next.delay_days && next.delay_days !== null) {
    const from = prev.delay_days === null ? 'not stated' : lowerFirst(owner.days(prev.delay_days))
    out.push(`The extra time changed from ${from} to ${lowerFirst(owner.days(next.delay_days))}.`)
  }
  if (prev.payment_timing !== next.payment_timing && next.payment_timing !== null) {
    const credit = (next.price_cents ?? 0) < 0
    out.push(`When it’s paid changed: ${lowerFirst(owner.payment(next.payment_timing, credit))}.`)
  }
  if (prev.permit_change !== next.permit_change && next.permit_change !== null) {
    out.push(`The building permit answer changed: ${lowerFirst(owner.permit(next.permit_change))}.`)
  }
  if ((prev.work_effect ?? '') !== (next.work_effect ?? '')) {
    out.push('The effect on the rest of the job changed.')
  }
  if (prev.requested_by !== next.requested_by && next.requested_by !== null) {
    out.push('Who asked for it changed.')
  }
  if (prev.photo_id !== next.photo_id) out.push('The photo changed.')
  return out
}
