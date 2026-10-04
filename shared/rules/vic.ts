// Victoria: two rule sets, picked by the contract's signing date (D55). Contracts signed before
// the 2025 reform starts keep the old ss 37-38 for life; later contracts use ss 37-38 as
// replaced in 2025 (research/fact-check-legal.md). Not legal advice (D59, D90).

import {
  auto,
  delay,
  description,
  permit,
  premiumNote,
  price,
  reason,
  requestedBy,
  workEffect,
} from './common.ts'
import type { DraftInput, RuleContext, RuleNote, RuleSet } from './types.ts'

/**
 * Victoria's Domestic Building Contracts Amendment Act 2025 (No. 36/2025) replaces ss 37-38
 * for contracts entered into on or after commencement (new s 139). Commencement is by
 * proclamation, otherwise the default date, which the Consumer Legislation Amendment Act 2026
 * (No. 36/2026, s 178ZL) moved from 1 December 2026 to 31 March 2027. No earlier proclamation
 * was found on 1 October 2026: if one is made, change this date.
 */
export const VIC_REFORM_START = '2027-03-31'

/** The home warranty scheme covers work of $20,000 or more (Building Act 1993 (Vic) s 137J(d)). */
const INSURED_FROM_CENTS = 2_000_000

/** Building Act 1993 (Vic) s 137X, in force since 1 July 2026 (D58). */
function vicPremium(d: DraftInput, ctx: RuleContext): RuleNote[] {
  if (ctx.contract_price_cents < INSURED_FROM_CENTS) return []
  return premiumNote(
    d,
    'This adds $5,000 or more. Pay the extra home warranty premium for this change.',
  )
}

/**
 * D4: the s 38(2) exception, only for an owner's request with no permit change and no delay,
 * adding no more than 2% of the original contract price. A credit is tested by its size, the
 * conservative reading (a literal one would let any credit through; the lawyer checks it).
 */
function twoPercentApplies(d: DraftInput, ctx: RuleContext): boolean {
  return (
    d.requested_by === 'owner' &&
    d.permit_change === false &&
    d.delay_days === 0 &&
    d.price_cents !== null &&
    Math.abs(d.price_cents) * 50 <= ctx.contract_price_cents
  )
}

const builderOrSite = (d: DraftInput) => d.requested_by === 'builder' || d.requested_by === 'site'

export const VIC_1995: RuleSet = {
  id: 'vic-1995',
  state: 'VIC',
  name: 'Victoria',
  law: 'Domestic Building Contracts Act 1995 (Vic), ss 37–38',
  effectiveFrom: '1996-01-01',
  checks: (d, ctx, firstName) => [
    description(d),
    // Who asked decides the section: s 37 (builder or site) or s 38 (owner).
    requestedBy(d),
    // s 37(1)(b): why, for builder or site changes. The owner's pathway (s 38) has no reason.
    ...(builderOrSite(d) ? [reason(d)] : []),
    workEffect(d),
    permit(d),
    delay(d),
    price(d, ctx, 'Cost and new contract total', { showTotal: true }),
    auto(
      'signed_ok',
      `${firstName}’s signed OK on this notice`,
      ctx.approved,
      `When ${firstName} signs`,
    ),
  ],
  notes(d, ctx, firstName) {
    const notes: RuleNote[] = []
    if (twoPercentApplies(d, ctx)) {
      notes.push({
        id: 'vic_two_percent',
        tone: 'go',
        text: `${firstName} asked for it, there’s no permit change or delay, and it’s under 2% of the original price, so the law lets you go ahead without a signature. Getting the nod still protects you both.`,
      })
    }
    if (builderOrSite(d)) {
      // s 37(3)(a)(ii): payable only if it couldn't reasonably have been foreseen (D58).
      notes.push({
        id: 'vic_foreseeable',
        tone: 'wait',
        text: 'You’re only paid for this if you couldn’t reasonably have seen it coming when you signed the contract. Say why.',
      })
    }
    return [...notes, ...vicPremium(d, ctx)]
  },
}

export const VIC_2025: RuleSet = {
  id: 'vic-2025',
  state: 'VIC',
  name: 'Victoria',
  law: 'Domestic Building Contracts Act 1995 (Vic), ss 37–38 as replaced in 2025',
  effectiveFrom: VIC_REFORM_START,
  checks: (d, ctx, firstName) => [
    description(d, 'What’s changing (in detail)'),
    requestedBy(d),
    // New s 37(2)(c)(iii): a reason for every variation, whoever asked.
    reason(d),
    permit(d),
    delay(d),
    price(d, ctx, 'Cost and new contract total', { showTotal: true }),
    auto('date_agreed', 'Date agreed', ctx.approved, `The day ${firstName} signs`),
    // New s 37(2)(b): signed by or on behalf of both.
    auto('signed', 'Signed by you both', ctx.approved, `When ${firstName} signs`),
  ],
  // No 2% exception any more; the new s 38 keeps only building-order and urgent-work exceptions,
  // which Nod doesn't offer (it always gets her agreement).
  notes: (d, ctx) => vicPremium(d, ctx),
}
