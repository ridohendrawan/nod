// The Review screen's working copy: what Dan edits, kept on the screen while he types and saved
// in small patches (autosave). The checklist and "What Sarah sees" run on this copy, so they
// change as he types, before anything is saved.
import type { OwnerCardContent } from '../../../shared/owner.ts'
import type { DraftInput, Evaluation } from '../../../shared/rules/types.ts'
import type { Item, Variation, VariationPatch } from '../../../shared/types.ts'

export type Working = Required<
  Pick<
    VariationPatch,
    | 'title'
    | 'owner_title'
    | 'items'
    | 'reason'
    | 'owner_reason'
    | 'requested_by'
    | 'price_cents'
    | 'price_method'
    | 'delay_days'
    | 'payment_timing'
    | 'permit_change'
    | 'work_effect'
    | 'date_requested'
  >
>

export const workingFrom = (v: Variation): Working => ({
  title: v.title,
  owner_title: v.owner_title,
  items: v.items.length ? v.items : [{ text: '', owner_text: '' }],
  reason: v.reason,
  owner_reason: v.owner_reason,
  requested_by: v.requested_by,
  price_cents: v.price_cents,
  price_method: v.price_method,
  delay_days: v.delay_days,
  payment_timing: v.payment_timing,
  permit_change: v.permit_change,
  work_effect: v.work_effect,
  date_requested: v.date_requested,
})

/** What the rules engine reads (shared/rules). Empty lines don't count as items. */
export const draftInputOf = (w: Working, photoId: string | null): DraftInput => ({
  title: w.title,
  items: w.items.filter((i) => i.text.trim()).map((i) => ({ text: i.text })),
  requested_by: w.requested_by,
  reason: w.reason,
  price_cents: w.price_cents,
  price_method: w.price_method,
  delay_days: w.delay_days,
  payment_timing: w.payment_timing,
  permit_change: w.permit_change,
  work_effect: w.work_effect,
  photo_id: photoId,
  date_requested: w.date_requested,
})

/** What Sarah's card reads (shared/owner.ts). */
export const ownerContentOf = (w: Working, photoId: string | null): OwnerCardContent => ({
  ...w,
  items: w.items.filter((i) => i.text.trim() || i.owner_text.trim()),
  photo_id: photoId,
})

/** Lines Dan saves: blank lines are dropped, but one line always stays on screen. */
export const savedItems = (items: Item[]): Item[] =>
  items.filter((i) => i.text.trim() || i.owner_text.trim())

// ---- The price: a kind (Extra cost / Credit / No charge) and a size ----------------------------

export type PriceKind = 'extra' | 'credit' | 'none'

export function priceParts(cents: number | null): { kind: PriceKind; size: number | null } {
  if (cents === null) return { kind: 'extra', size: null }
  if (cents === 0) return { kind: 'none', size: null }
  return cents < 0 ? { kind: 'credit', size: -cents } : { kind: 'extra', size: cents }
}

/** Back to signed cents: a credit is negative, "No charge" is 0, no size yet is null. */
export function priceFrom(kind: PriceKind, size: number | null): number | null {
  if (kind === 'none') return 0
  if (size === null) return null
  return kind === 'credit' ? -size : size
}

/** The limits the data layer checks (src/data/variations.ts), so a save is never refused. */
export const LIMITS = { title: 200, text: 500, items: 20, method: 300 } as const

/** The rules for this job ask for this item (sections show and hide by the law, not by hand). */
export const hasCheck = (e: Evaluation, id: string) => e.checks.some((c) => c.id === id)
