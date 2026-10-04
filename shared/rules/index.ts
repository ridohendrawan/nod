// The rules engine's public face: what the screens and the data layer import.

export { evaluate } from './evaluate.ts'
export { RULE_SETS, VIC_REFORM_START, ruleSetFor, ruleSetMeta } from './registry.ts'
export { FIELD_ORDER } from './types.ts'
export type {
  Check,
  CheckKind,
  CheckState,
  DraftInput,
  Evaluation,
  FieldId,
  RuleContext,
  RuleNote,
  RuleSet,
  RuleSetMeta,
} from './types.ts'
