// Which rule set applies to a job: by state and contract date (D55). Rules are data with an
// effective date: adding WA is one file plus one line here. Not legal advice: every citation
// goes to a lawyer before a pilot (D90).

import { NSW } from './nsw.ts'
import { QLD } from './qld.ts'
import type { RuleSet, RuleSetMeta } from './types.ts'
import { VIC_1995, VIC_2025, VIC_REFORM_START } from './vic.ts'
import type { StateCode } from '../states.ts'

export { VIC_REFORM_START }
export type { RuleSetMeta }

export const RULE_SETS: readonly RuleSet[] = [NSW, QLD, VIC_1995, VIC_2025]

/** The newest set for the state whose effectiveFrom is on or before the contract date. */
export function ruleSetFor(state: StateCode, contractDate: string): RuleSet {
  const candidates = RULE_SETS.filter((r) => r.state === state && r.effectiveFrom <= contractDate)
  const pick = candidates.sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0]
  if (!pick) throw new Error(`No rule set for ${state} on ${contractDate}`)
  return pick
}

/** Just the data, for records and API responses (no functions). */
export function ruleSetMeta(rules: RuleSet): RuleSetMeta {
  const { id, state, name, law, guidanceNote, effectiveFrom } = rules
  return guidanceNote === undefined
    ? { id, state, name, law, effectiveFrom }
    : { id, state, name, law, guidanceNote, effectiveFrom }
}
