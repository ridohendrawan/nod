// What code does to Claude's reply before anything becomes a draft (architecture.md 6):
// - the quote check, so a price or day count exists only if Dan said it (D12)
// - "about" and "plus GST" prices left empty, with one-tap buttons built from his words (D81)
// - payment words mapped to the chips, and "upfront" never mapped (D18)
// - the copy scrub on every string (D13)
// Pure and unit-tested: the AI function runs it on live replies and on the fixtures alike.

import type { PaymentTiming, RequestedBy } from '../copy.ts'
import { MAX_CENTS, dollarsToCents } from '../money.ts'
import type { FieldId } from '../rules/types.ts'
import type { DraftChange, Item, PriceHint } from '../types.ts'
import {
  amountMatchesQuote,
  daysMatchQuote,
  normaliseForQuote,
  quoteAppears,
  quoteContext,
} from './quote.ts'
import type { RecordChanges, RecordedChange } from './schema.ts'

const EM_DASH = String.fromCharCode(0x2014)

export const PRICE_NOT_MATCHED = 'Nod couldn’t match the price to your words, so it left it empty.'
export const DAYS_NOT_MATCHED =
  'Nod couldn’t match the extra days to your words, so it left them empty.'
export const CHECK_SIGN = 'Check whether this is an extra cost or a credit.'
export const NO_CHANGE_DEFAULT = 'This sounds like a progress update, not a change to the job.'

// ---------------------------------------------------------------------------------------
// The copy scrub (D13)
// ---------------------------------------------------------------------------------------

/** Calm, house-style text: no em dashes, no exclamation marks, "power point" not "PowerPoint". */
export function scrub(s: string): string {
  return s
    .split(EM_DASH)
    .map((part) => part.trim())
    .join(', ')
    .replace(/!+/g, '.')
    .replace(/\bPower[Pp]oint(s?)\b/g, (_m, plural: string, offset: number, all: string) => {
      const sentenceStart = offset === 0 || /[.?]\s*$/.test(all.slice(0, offset))
      return `${sentenceStart ? 'Power' : 'power'} point${plural}`
    })
    .replace(/\s+,/g, ',')
    .replace(/,\s*,/g, ',')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

const scrubOrNull = (s: string | null) => {
  const out = s === null ? '' : scrub(s)
  return out.length > 0 ? out : null
}

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length

// ---------------------------------------------------------------------------------------
// Prices (D12, D81)
// ---------------------------------------------------------------------------------------

const APPROXIMATE =
  /\b(about|around|roughly|approximately|approx|ballpark|maybe|probably|something like|or so|give or take|odd)\b|\d+ish\b/
const PLUS_GST = /\b(plus|ex|excl|excluding|exclusive of) gst\b|\bgst on top\b/
const CREDIT_WORDS =
  /\b(take|knock)\b.*\boff\b|\bcredit\b|\bminus\b|\bless\b|\bdiscount\b|\brefund\b/

type PriceResult = {
  cents: number | null
  quote: string | null
  hint: PriceHint | null
  notes: string[]
}

function guardPrice(spoken: RecordedChange['price_spoken'], transcript: string): PriceResult {
  if (spoken === null) return { cents: null, quote: null, hint: null, notes: [] }
  const { dollars, quote } = spoken
  const cents = Number.isFinite(dollars) ? dollarsToCents(dollars) : NaN
  if (
    !quoteAppears(quote, transcript) ||
    amountMatchesQuote(dollars, quote) === false ||
    !Number.isFinite(cents) ||
    Math.abs(cents) > MAX_CENTS
  ) {
    return { cents: null, quote: null, hint: null, notes: [PRICE_NOT_MATCHED] }
  }

  const ctx = quoteContext(quote, transcript)
  const q = normaliseForQuote(quote)
  const around = `${ctx.before} ${q} ${ctx.after}`

  // "plus GST": Sarah must see the price with GST, so Dan picks which it is (D81).
  if (PLUS_GST.test(`${q} ${ctx.after}`)) {
    return {
      cents: null,
      quote,
      hint: { kind: 'plus_gst', quote, cents, with_gst_cents: Math.round(cents * 1.1) },
      notes: [],
    }
  }
  // "about 150": a contract price can't be "about", so Dan confirms the figure (D81).
  if (APPROXIMATE.test(around)) {
    return { cents: null, quote, hint: { kind: 'approximate', quote, cents }, notes: [] }
  }

  const notes: string[] = []
  const creditWords = CREDIT_WORDS.test(around)
  const minusInQuote = /^\s*[-−]/.test(quote)
  if ((cents > 0 && creditWords) || (cents < 0 && !creditWords && !minusInQuote))
    notes.push(CHECK_SIGN)
  return { cents, quote, hint: null, notes }
}

// ---------------------------------------------------------------------------------------
// Days and payment (D18, D80)
// ---------------------------------------------------------------------------------------

function guardDelay(
  spoken: RecordedChange['delay_spoken'],
  transcript: string,
): { days: number | null; quote: string | null; notes: string[] } {
  if (spoken === null) return { days: null, quote: null, notes: [] }
  const { days, quote } = spoken
  const valid = Number.isFinite(days) && days >= 0 && days <= 365 && Number.isInteger(days * 2)
  if (!valid || !quoteAppears(quote, transcript) || daysMatchQuote(days, quote) === false) {
    return { days: null, quote: null, notes: [DAYS_NOT_MATCHED] }
  }
  return { days, quote, notes: [] }
}

const UPFRONT =
  /\b(upfront|up front|in advance|deposit|beforehand|before (we|i|you) start|before starting)\b/
const NEXT_CLAIM = /\b(next|progress) (progress )?(claim|payment|invoice|bill)\b|\bprogress claim\b/
const FINAL =
  /\b(final|last) (payment|claim|invoice|bill)\b|\bat the end\b|\bend of the job\b|\bhandover\b/
const ON_COMPLETION =
  /\bon completion\b|\b(when|once) (its|it is|thats|were|we are|the work is|this is) (done|finished|complete|completed)\b|\bwhen (done|finished)\b/

function guardPayment(
  said: string | null,
  transcript: string,
  isCredit: boolean,
): {
  timing: PaymentTiming | null
  quote: string | null
  said: { quote: string; upfront: boolean } | null
} {
  if (said === null || !quoteAppears(said, transcript))
    return { timing: null, quote: null, said: null }
  const n = normaliseForQuote(said)
  // Payment can't be asked for before the work starts, so "upfront" never maps to a chip (D18).
  if (UPFRONT.test(n)) return { timing: null, quote: null, said: { quote: said, upfront: true } }
  let timing: PaymentTiming | null = null
  if (NEXT_CLAIM.test(n)) timing = 'next_claim'
  else if (FINAL.test(n)) timing = 'final_payment'
  else if (ON_COMPLETION.test(n) && !isCredit) timing = 'on_completion'
  return timing
    ? { timing, quote: said, said: null }
    : { timing: null, quote: null, said: { quote: said, upfront: false } }
}

// ---------------------------------------------------------------------------------------
// The whole reply
// ---------------------------------------------------------------------------------------

/** Lower-case the first letter so it follows "Nod spotted this in your note:", and drop the full stop. */
function asClause(s: string | null): string | null {
  const t = scrubOrNull(s)
  if (t === null) return null
  const keepCase = /^[A-Z]{2}|^I\b/.test(t)
  return (keepCase ? t : t.charAt(0).toLowerCase() + t.slice(1)).replace(/[.\s]+$/, '')
}

function guardChange(c: RecordedChange, transcript: string, log: string[]): DraftChange {
  const title = scrub(c.title)
  const ownerTitle = scrub(c.owner_title)
  if (wordCount(title) > 7) log.push(`title over 7 words: "${title}"`)
  if (wordCount(ownerTitle) > 8) log.push(`owner title over 8 words: "${ownerTitle}"`)

  let items: Item[] = c.items
    .map((i) => ({ text: scrub(i.text), owner_text: scrub(i.owner_text) }))
    .filter((i) => i.text.length > 0 || i.owner_text.length > 0)
  if (items.length === 0) items = [{ text: title, owner_text: ownerTitle }]

  const requestedBy: RequestedBy | null = c.requested_by === 'unknown' ? null : c.requested_by
  const price = guardPrice(c.price_spoken, transcript)
  const delay = guardDelay(c.delay_spoken, transcript)
  const isCredit = (price.cents ?? price.hint?.cents ?? 0) < 0
  const payment = guardPayment(c.payment_spoken, transcript, isCredit)
  const reason = scrubOrNull(c.reason)

  // "Worth checking" notes, each under its field (D65). A price hint already explains itself.
  const worth: { field: FieldId; text: string }[] = c.uncertain
    .filter((u) => u !== null)
    .map((u) => ({ field: u.field as FieldId, text: scrub(u.note) }))
    .filter((u) => u.text.length > 0 && !(u.field === 'price' && price.hint !== null))
  for (const text of price.notes) worth.push({ field: 'price', text })
  for (const text of delay.notes) worth.push({ field: 'delay', text })
  const seen = new Set<string>()
  const worthChecking = worth.filter((w) => {
    const key = `${w.field}|${w.text}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const fromNote: FieldId[] = ['description']
  if (requestedBy !== null) fromNote.push('requested_by')
  if (reason !== null) fromNote.push('reason')
  if (price.cents !== null) fromNote.push('price')
  if (delay.days !== null) fromNote.push('delay')
  if (payment.timing !== null) fromNote.push('payment')
  if (c.permit_mentioned !== null) fromNote.push('permit')

  return {
    title,
    owner_title: ownerTitle,
    items,
    reason,
    owner_reason: scrubOrNull(c.owner_reason),
    requested_by: requestedBy,
    price_cents: price.cents,
    delay_days: delay.days,
    payment_timing: payment.timing,
    permit_change: c.permit_mentioned,
    ai: {
      explicit: c.explicit,
      detected_because: c.explicit ? null : asClause(c.detected_because),
      quotes: { price: price.quote, delay: delay.quote, payment: payment.quote },
      price_hint: price.hint,
      payment_said: payment.said,
      worth_checking: worthChecking,
      from_note: fromNote,
    },
  }
}

export type GuardedReply = {
  changes: DraftChange[]
  site_note: string | null
  no_change_reason: string | null
  /** Things worth logging (word limits), never shown to Dan. */
  log: string[]
}

/** Run every check over Claude's reply. `transcript` is exactly what was sent to Claude. */
export function applyGuardrails(reply: RecordChanges, transcript: string): GuardedReply {
  const log: string[] = []
  const changes = reply.changes.map((c) => guardChange(c, transcript, log))
  return {
    changes,
    site_note: scrubOrNull(reply.site_note),
    no_change_reason:
      changes.length > 0 ? null : (scrubOrNull(reply.no_change_reason) ?? NO_CHANGE_DEFAULT),
    log,
  }
}
