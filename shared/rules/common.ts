// Building blocks the state rule sets share. Each state file reads like its row in
// research/state-rules.md 1.2: a list of checks, in the order the law gives them. Labels use the
// client's first name ("Date Sarah asked"), never "she", because the client can be anyone.

import { formatDate } from '../time.ts'
import { formatMoney } from '../money.ts'
import type { Check, DraftInput, RuleContext, RuleNote } from './types.ts'

export const DISCLAIMER = 'Nod checks the content. It isn’t legal advice.'

/** $5,000: the extra home warranty premium threshold (QBCC Act s 70(2); Building Act 1993 (Vic) s 137X). */
export const PREMIUM_THRESHOLD_CENTS = 500_000

export const hasText = (s: string | null | undefined) =>
  typeof s === 'string' && s.trim().length > 0

/** A description is a title and at least one line item with words in it (architecture.md 7). */
export const isDescribed = (d: DraftInput) =>
  hasText(d.title) && d.items.some((i) => hasText(i.text))

export function required(
  id: string,
  label: string,
  done: boolean,
  field: Check['field'],
  action: string,
  detail: string | null = null,
): Check {
  return { id, label, kind: 'required', state: done ? 'done' : 'missing', field, action, detail }
}

export function description(d: DraftInput, label = 'What’s changing'): Check {
  return required('description', label, isDescribed(d), 'description', 'Describe the change')
}

export function requestedBy(d: DraftInput): Check {
  return required(
    'requested_by',
    'Who asked',
    d.requested_by !== null,
    'requested_by',
    'Choose who asked',
  )
}

export function reason(d: DraftInput): Check {
  return required('reason', 'Why it’s needed', hasText(d.reason), 'reason', 'Say why it’s needed')
}

/**
 * The price. `orMethod`: QLD accepts "how it's worked out" instead of an amount (s 41(2)(e)).
 * `showTotal`: put the new total in the detail, where the state has no separate total item.
 */
export function price(
  d: DraftInput,
  ctx: RuleContext,
  label: string,
  { orMethod = false, showTotal = false } = {},
): Check {
  const priced = d.price_cents !== null
  const done = priced || (orMethod && hasText(d.price_method))
  const detail =
    showTotal && priced
      ? `New total ${formatMoney(ctx.total_now_cents + (d.price_cents ?? 0))}`
      : null
  const action = orMethod ? 'Add the price, or how it’s worked out' : 'Add the price'
  return required('price', label, done, 'price', action, detail)
}

export function newTotal(d: DraftInput, ctx: RuleContext): Check {
  const priced = d.price_cents !== null
  return {
    id: 'new_total',
    label: 'New contract total',
    kind: 'auto',
    state: priced ? 'done' : 'pending',
    field: 'price',
    action: null,
    detail: priced
      ? formatMoney(ctx.total_now_cents + (d.price_cents ?? 0))
      : 'Worked out once there’s a price',
  }
}

export function delay(d: DraftInput, label = 'Delay estimate (0 is fine)'): Check {
  return required('delay', label, d.delay_days !== null, 'delay', 'Choose the extra days')
}

export function permit(d: DraftInput): Check {
  return required(
    'permit',
    'Permit change needed?',
    d.permit_change !== null,
    'permit',
    'Say if the permit changes',
  )
}

export function workEffect(d: DraftInput): Check {
  return required(
    'work_effect',
    'Effect on the rest of the job',
    hasText(d.work_effect),
    'work_effect',
    'Say how it affects the rest of the job',
  )
}

export function optional(id: string, label: string, added: boolean, field: Check['field']): Check {
  return {
    id,
    label,
    kind: 'optional',
    state: added ? 'done' : 'missing',
    field,
    action: null,
    detail: added ? null : 'Optional',
  }
}

/** An item that completes on its own later (when she signs, when it's sent). */
export function auto(
  id: string,
  label: string,
  done: boolean,
  pendingDetail: string,
  doneDetail: string | null = null,
  field: Check['field'] = null,
): Check {
  return {
    id,
    label,
    kind: 'auto',
    state: done ? 'done' : 'pending',
    field,
    action: null,
    detail: done ? doneDetail : pendingDetail,
  }
}

/** QLD "Date Sarah asked": automatic, but Dan can change it (D57). */
export function dateAsked(d: DraftInput, ctx: RuleContext, firstName: string): Check {
  const detail =
    d.date_requested === ctx.today
      ? 'Automatic: today'
      : `Changed to ${formatDate(d.date_requested)}`
  return {
    id: 'date_requested',
    label: `Date ${firstName} asked`,
    kind: 'auto',
    state: 'done',
    field: 'date_requested',
    action: null,
    detail,
  }
}

/** The extra home warranty premium: a warning, never a gap (D57, D58). */
export function premiumNote(d: DraftInput, text: string): RuleNote[] {
  return d.price_cents !== null && d.price_cents >= PREMIUM_THRESHOLD_CENTS
    ? [{ id: 'premium', tone: 'wait', text }]
    : []
}
