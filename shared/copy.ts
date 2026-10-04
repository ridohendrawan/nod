// The two vocabularies (ux-spec.md 0.2). Dan reads trade words and compact signs ("+$220");
// Sarah reads plain words, never symbols (D78), and delays in working days (D80).
// Keeping both here means no screen can mix them.

import { formatMoney, formatSignedMoney, type MoneyOptions } from './money.ts'
import type { StateCode } from './states.ts'
import { formatOwnerTime } from './time.ts'
import type { AiUnavailableReason } from './types.ts'

export type VariationStatus = 'draft' | 'sent' | 'question' | 'approved' | 'declined' | 'withdrawn'
export type RequestedBy = 'owner' | 'builder' | 'site'
export type PaymentTiming = 'next_claim' | 'on_completion' | 'final_payment'
export type Tone = 'go' | 'wait' | 'ask' | 'stop' | 'neutral'

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

/** "½", "1½", "2" (Dan's compact day counts). */
function compactDays(days: number): string {
  const whole = Math.floor(days)
  const half = days - whole === 0.5
  if (whole === 0 && half) return '½'
  return `${whole}${half ? '½' : ''}`
}

/** "half a", "1 and a half", "2" (Sarah reads words). */
function wordyDays(days: number): string {
  const whole = Math.floor(days)
  const half = days - whole === 0.5
  if (whole === 0 && half) return 'half a'
  return half ? `${whole} and a half` : `${whole}`
}

// ---------------------------------------------------------------------------------------
// Dan (builder)
// ---------------------------------------------------------------------------------------

export const builder = {
  /** "Variation 2", or "Draft" before the first send (D8). */
  variationName: (n: number | null) => (n === null ? 'Draft' : `Variation ${n}`),
  /** The short tag on a row: "V2" or "Draft". */
  variationTag: (n: number | null) => (n === null ? 'Draft' : `V${n}`),

  status(status: VariationStatus, firstName: string): { text: string; tone: Tone } {
    switch (status) {
      case 'draft':
        return { text: 'Draft', tone: 'neutral' }
      case 'sent':
        return { text: `Waiting on ${firstName}`, tone: 'wait' }
      case 'question':
        return { text: 'Question', tone: 'ask' }
      case 'approved':
        return { text: 'Approved', tone: 'go' }
      case 'declined':
        return { text: `${firstName} said no`, tone: 'stop' }
      case 'withdrawn':
        return { text: 'Withdrawn', tone: 'neutral' }
    }
  },

  requestedBy(by: RequestedBy, firstName: string): string {
    return by === 'owner' ? firstName : by === 'builder' ? 'Me' : 'Site conditions'
  },

  /** "+$220", "−$400", "No charge"; null when no price was set yet. */
  price(cents: number | null, options?: MoneyOptions): string | null {
    if (cents === null) return null
    return cents === 0 ? 'No charge' : formatSignedMoney(cents, options)
  },

  /** "No extra time", "+½ day", "+1 day", "+2 days"; null when not stated. */
  days(days: number | null): string | null {
    if (days === null) return null
    if (days === 0) return 'No extra time'
    return `+${compactDays(days)} ${plural(days, 'day', days < 1 ? 'day' : 'days')}`
  },

  payment(timing: PaymentTiming, isCredit: boolean): string {
    if (isCredit)
      return timing === 'final_payment' ? 'Off the final payment' : 'Off the next progress claim'
    switch (timing) {
      case 'next_claim':
        return 'With the next progress claim'
      case 'on_completion':
        return 'When this work is done'
      case 'final_payment':
        return 'With the final payment'
    }
  },

  permit: (change: boolean) => (change ? 'Permit needs changing' : 'No permit change'),

  /** Why the AI step can't help (ux-spec.md 3, Failures); every reason offers "Fill it in by
   *  hand". The function, the browser and the dev hook all answer with these words. */
  aiUnavailable: {
    not_configured: 'Nod can’t read notes right now. Your note’s safe.',
    down: 'Nod can’t read notes right now. Your note’s safe.',
    limit: 'Nod has read today’s 80 notes. Fill this one in by hand.',
    unreadable:
      'Nod couldn’t read that note. Your note’s safe. Try rewording it, or fill it in by hand.',
    demo: 'This demo drafts the five sample notes only. Your note’s safe. Fill it in by hand, or try a sample note.',
  } satisfies Record<AiUnavailableReason, string>,

  /** Demo mode's results (D95), so nobody takes a prepared result for live AI: on Review (one
   *  draft), on the job screen after a split (two drafts), and on Nothing to sign (no draft). */
  preparedDraft:
    'Demo draft, prepared in advance for this sample note. With an AI key, Nod drafts any note.',
  preparedDrafts:
    'Demo drafts, prepared in advance for this sample note. With an AI key, Nod drafts any note.',
  preparedResult:
    'Demo result, prepared in advance for this sample note. With an AI key, Nod reads any note.',
}

// ---------------------------------------------------------------------------------------
// Sarah (owner)
// ---------------------------------------------------------------------------------------

export const owner = {
  changeName: (n: number) => `Change ${n}`,

  /** "Adds $220 to the price", "Takes $400 off the price", "No change to the price". */
  price(cents: number, options?: MoneyOptions): string {
    if (cents === 0) return 'No change to the price'
    return cents > 0
      ? `Adds ${formatMoney(cents, options)} to the price`
      : `Takes ${formatMoney(cents, options)} off the price`
  },

  /** "You save $400" for a credit (shown in go colour), otherwise null. */
  saving: (cents: number, options?: MoneyOptions) =>
    cents < 0 ? `You save ${formatMoney(cents, options)}` : null,

  /** "No extra time", "About half a working day", "About 1 extra working day",
   *  "About 1 extra week (5 working days)". */
  days(days: number): string {
    if (days === 0) return 'No extra time'
    if (days === 0.5) return 'About half a working day'
    if (days % 5 === 0) {
      const weeks = days / 5
      return `About ${weeks} extra ${plural(weeks, 'week', 'weeks')} (${days} working days)`
    }
    return `About ${wordyDays(days)} extra working ${plural(days, 'day', 'days')}`
  },

  payment(timing: PaymentTiming, isCredit: boolean): string {
    if (isCredit) {
      return timing === 'final_payment'
        ? 'Taken off your final payment'
        : 'Taken off your next progress payment'
    }
    switch (timing) {
      case 'next_claim':
        return 'Added to your next progress payment'
      case 'on_completion':
        return 'Paid when this work is finished'
      case 'final_payment':
        return 'Added to your final payment'
    }
  },

  permit: (change: boolean) =>
    change ? 'Your building permit needs updating' : 'No change to your building permit',

  /** The "Asked for by" fact: "You", "Dan", "What was found on site". */
  askedBy(by: RequestedBy, builderName: string): string {
    return by === 'owner' ? 'You' : by === 'builder' ? builderName : 'What was found on site'
  },

  /**
   * The approve checkbox's label: one whole sentence (ux-spec.md 7), in words, never symbols.
   * "I agree to this change to my building contract: extra double power point on the island
   * bench. It adds $220 to the price. It does not add any time. My new contract total is $49,170."
   */
  consent(i: {
    title: string
    price_cents: number
    delay_days: number
    total_after_cents: number
    options?: MoneyOptions
  }): string {
    const price =
      i.price_cents === 0
        ? 'It does not change the price.'
        : i.price_cents > 0
          ? `It adds ${formatMoney(i.price_cents, i.options)} to the price.`
          : `It takes ${formatMoney(i.price_cents, i.options)} off the price.`
    const d = i.delay_days
    const time =
      d === 0
        ? 'It does not add any time.'
        : d === 0.5
          ? 'It adds about half a working day.'
          : `It adds about ${wordyDays(d)} working ${plural(d, 'day', 'days')}.`
    const title = i.title.charAt(0).toLowerCase() + i.title.slice(1)
    return `I agree to this change to my building contract: ${title}. ${price} ${time} My new contract total is ${formatMoney(i.total_after_cents, i.options)}.`
  },

  /** Her record: "The $220 will be added to your next progress payment." null at no charge. */
  paymentLine(timing: PaymentTiming, cents: number, options?: MoneyOptions): string | null {
    if (cents === 0) return null
    const amount = formatMoney(cents, options)
    if (cents < 0) {
      return timing === 'final_payment'
        ? `The ${amount} will be taken off your final payment.`
        : `The ${amount} will be taken off your next progress payment.`
    }
    switch (timing) {
      case 'next_claim':
        return `The ${amount} will be added to your next progress payment.`
      case 'on_completion':
        return `The ${amount} is paid when this work is finished.`
      case 'final_payment':
        return `The ${amount} will be added to your final payment.`
    }
  },

  /** "Approved by Sarah Chen on Thursday 1 October 2026 at 2:15 pm (Brisbane time)." */
  approvedLine: (name: string, at: Date, state: StateCode) =>
    `Approved by ${name} on ${formatOwnerTime(at, state)}.`,

  /** "You said no on Thursday 1 October 2026 at 2:15 pm (Brisbane time)." */
  declinedLine: (at: Date, state: StateCode) => `You said no on ${formatOwnerTime(at, state)}.`,
}
