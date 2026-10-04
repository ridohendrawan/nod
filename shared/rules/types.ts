// The shapes the rules engine works with (architecture.md 7). Pure data: the screens run
// `evaluate` live on every edit, and the data layer runs the same function again at send, so a
// screen bug can never send an incomplete change. Not legal advice (D59, D90).

import type { PaymentTiming, RequestedBy } from '../copy.ts'
import type { StateCode } from '../states.ts'

/** A field on the Review screen, in screen order. A press on a gap focuses its field. */
export type FieldId =
  | 'description'
  | 'requested_by'
  | 'reason'
  | 'price'
  | 'price_method'
  | 'delay'
  | 'payment'
  | 'date_requested'
  | 'permit'
  | 'work_effect'
  | 'photo'

/** Review order, top to bottom (ux-spec.md 4): the first gap is the highest one. */
export const FIELD_ORDER: readonly FieldId[] = [
  'description',
  'requested_by',
  'reason',
  'price',
  'price_method',
  'delay',
  'payment',
  'date_requested',
  'permit',
  'work_effect',
  'photo',
]

/** The working copy, as far as the rules care. */
export type DraftInput = {
  title: string
  items: readonly { text: string }[]
  requested_by: RequestedBy | null
  reason: string | null
  /** Integer cents: null = not stated, negative = credit, 0 = no charge. */
  price_cents: number | null
  /** QLD "how it's worked out"; NSW "how the price adds up". */
  price_method: string | null
  /** null = not stated; 0 is a valid answer; halves allowed. */
  delay_days: number | null
  payment_timing: PaymentTiming | null
  permit_change: boolean | null
  work_effect: string | null
  photo_id: string | null
  /** YYYY-MM-DD in the job's time zone. */
  date_requested: string
}

export type RuleContext = {
  state: StateCode
  /** YYYY-MM-DD: picks the rule set (D55). */
  contract_date: string
  /** The original contract price, for the VIC 2% test (D4) and the premium threshold. */
  contract_price_cents: number
  /** The contract total now (original plus approved changes), for "New contract total". */
  total_now_cents: number
  /** Today in the job's time zone, YYYY-MM-DD. */
  today: string
  /** The change has been sent (so "She gets a copy" is done). */
  sent: boolean
  /** Sarah has approved this version (so the signature items are done). */
  approved: boolean
}

export type CheckKind = 'required' | 'optional' | 'auto'
export type CheckState = 'done' | 'missing' | 'pending'

export type Check = {
  id: string
  /** The item, as Dan reads it: "When it's paid". */
  label: string
  kind: CheckKind
  /** `missing` on an optional item means "not added", never a gap. */
  state: CheckState
  /** Where a press takes Dan, if anywhere. */
  field: FieldId | null
  /** The button for a missing item: "Choose when it's paid". */
  action: string | null
  /** Small words after the label: "Automatic: today", "When Sarah signs", "$49,170". */
  detail: string | null
}

export type RuleNote = {
  id: 'vic_two_percent' | 'vic_foreseeable' | 'premium'
  tone: 'go' | 'wait' | 'info'
  text: string
}

export type RuleSetMeta = {
  id: string
  state: StateCode
  name: string
  /** The footer citation. */
  law: string
  /** NSW: the Act sets only writing and signatures; the rest is government guidance (D56). */
  guidanceNote?: string
  /** Contracts signed on or after this date (YYYY-MM-DD) use this set. */
  effectiveFrom: string
}

export type RuleSet = RuleSetMeta & {
  checks(d: DraftInput, ctx: RuleContext, firstName: string): Check[]
  notes(d: DraftInput, ctx: RuleContext, firstName: string): RuleNote[]
}

export type Evaluation = {
  rules: RuleSetMeta
  /** "Queensland checklist". */
  heading: string
  /** In the order the law lists them. */
  checks: Check[]
  /** Required items still missing, in Review order. */
  gaps: Check[]
  first_gap: Check | null
  can_send: boolean
  /** "Ready to send" or "1 thing to do before you can send" (D59: never "compliant"). */
  summary: string
  /** "Before you can send: choose when it's paid." Linked to the blocked Send button (D17). */
  blocked_reason: string | null
  notes: RuleNote[]
  /** The citation, the NSW guidance note, then the disclaimer. */
  footer: string[]
}
