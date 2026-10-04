// Run a state's checklist over a draft (architecture.md 7). The screens call this on every edit
// and the data layer calls it again when Dan sends, so both always agree.

import { STATE_NAME } from '../states.ts'
import { DISCLAIMER } from './common.ts'
import { ruleSetFor, ruleSetMeta } from './registry.ts'
import {
  FIELD_ORDER,
  type Check,
  type DraftInput,
  type Evaluation,
  type RuleContext,
} from './types.ts'

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
const fieldRank = (c: Check) =>
  c.field === null ? FIELD_ORDER.length : FIELD_ORDER.indexOf(c.field)

export function evaluate(d: DraftInput, ctx: RuleContext, firstName: string): Evaluation {
  const rules = ruleSetFor(ctx.state, ctx.contract_date)
  const checks = rules.checks(d, ctx, firstName)
  const gaps = checks
    .filter((c) => c.kind === 'required' && c.state === 'missing')
    .sort((a, b) => fieldRank(a) - fieldRank(b))
  const first = gaps[0] ?? null

  let blocked: string | null = null
  if (first) {
    const more = gaps.length - 1
    const tail = more === 0 ? '' : `, and ${more} more ${more === 1 ? 'thing' : 'things'}`
    blocked = `Before you can send: ${lowerFirst(first.action ?? first.label)}${tail}.`
  }

  return {
    rules: ruleSetMeta(rules),
    heading: `${STATE_NAME[ctx.state]} checklist`,
    checks,
    gaps,
    first_gap: first,
    can_send: gaps.length === 0,
    summary:
      gaps.length === 0
        ? 'Ready to send'
        : `${gaps.length} ${gaps.length === 1 ? 'thing' : 'things'} to do before you can send`,
    blocked_reason: blocked,
    notes: rules.notes(d, ctx, firstName),
    footer: [
      `${rules.law}.`,
      ...(rules.guidanceNote ? [`${rules.guidanceNote}.`] : []),
      DISCLAIMER,
    ],
  }
}
