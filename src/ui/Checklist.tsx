// The state checklist (research/accessibility-copy.md 2.2 h): what the law asks a variation to
// include, from the rules engine (shared/rules). Words, not just icons: "Optional", "Automatic",
// "When Sarah signs". A missing item is a button that takes Dan to its field. It never says
// "compliant" (D59), and the footer always says it isn't legal advice.
import { Check, CircleDashed, Clock, Info, X } from 'lucide-react'
import type { Check as RuleCheck, Evaluation, FieldId } from '../../shared/rules/types.ts'
import { Callout } from './Callout.tsx'
import { cx } from './cx.ts'

export function Checklist({
  evaluation,
  onGoTo,
}: {
  evaluation: Evaluation
  /** Take Dan to a field (scroll it clear of the action bar and focus it). */
  onGoTo: (field: FieldId) => void
}) {
  return (
    <section className="card checklist-card" aria-labelledby="checklist-title">
      <div className="checklist-head">
        <h2 id="checklist-title" className="t-title-2">
          {evaluation.heading}
        </h2>
        <p className={cx('checklist-summary', evaluation.can_send ? 'is-ready' : 'is-blocked')}>
          {evaluation.can_send ? (
            <Check size={20} strokeWidth={3} aria-hidden="true" />
          ) : (
            <Info size={20} strokeWidth={2.5} aria-hidden="true" />
          )}
          {evaluation.summary}
        </p>
      </div>
      <ul className="checklist">
        {evaluation.checks.map((check) => (
          <CheckItem key={check.id} check={check} onGoTo={onGoTo} />
        ))}
      </ul>
      {evaluation.notes.map((note) => (
        <Callout key={note.id} tone={note.tone === 'info' ? 'neutral' : note.tone}>
          {note.text}
        </Callout>
      ))}
      <div className="checklist-footer">
        {evaluation.footer.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </section>
  )
}

function CheckItem({ check, onGoTo }: { check: RuleCheck; onGoTo: (field: FieldId) => void }) {
  const optional = check.kind === 'optional' && check.state !== 'done'
  const look = optional ? 'optional' : check.state
  const prefix =
    check.state === 'done'
      ? 'Done: '
      : optional
        ? 'Optional: '
        : check.state === 'pending'
          ? 'Later: '
          : 'To do: '
  const Icon =
    check.state === 'done' ? Check : optional ? CircleDashed : check.state === 'pending' ? Clock : X
  const actionable = check.state === 'missing' && check.kind === 'required' && check.field
  return (
    <li className={`check-item is-${look}`}>
      <span className="check-icon" aria-hidden="true">
        <Icon size={16} strokeWidth={3} />
      </span>
      <span className="check-body">
        <span className="check-label">
          <span className="visually-hidden">{prefix}</span>
          {check.label}
        </span>
        {actionable && check.field ? (
          <button
            type="button"
            className="check-action"
            onClick={() => check.field && onGoTo(check.field)}
          >
            {check.action ?? `Add ${check.label.toLowerCase()}`}
          </button>
        ) : null}
        {check.detail || optional ? (
          <span className="check-detail">
            {check.detail ?? (check.kind === 'auto' ? 'Automatic' : 'Optional')}
          </span>
        ) : null}
      </span>
    </li>
  )
}
