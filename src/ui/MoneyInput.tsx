// The price field (research/accessibility-copy.md 2.2 f): a big amount with a "$" that screen
// readers skip, the unit in the label, and the decimal keypad. The sign never comes from the
// text (the iPhone decimal keypad has no minus key): Extra cost / Credit sits beside it.
import { CircleAlert } from 'lucide-react'
import { useId, useState, type ReactNode, type Ref } from 'react'
import { formatMoney, parseMoneyInput } from '../../shared/money.ts'
import { cx } from './cx.ts'

const BAD_AMOUNT = 'Enter the price in dollars, like 220 or 1,450.50.'

/** "1,450.50" without the dollar sign, for the text box. */
const plain = (cents: number) => formatMoney(cents).replace(/^\$/, '')

/** A half-typed "220." still means $220. */
const parse = (text: string) => parseMoneyInput(text.trim().replace(/\.$/, ''))

export function MoneyInput({
  label = 'Amount in dollars, including GST',
  cents,
  onChange,
  missing,
  source,
  preview,
  drafted,
  ref,
}: {
  label?: string
  /** The size of the amount in cents (never signed), or null when there isn't one yet. */
  cents: number | null
  onChange: (cents: number | null) => void
  /** Send is waiting on a price (D17): a dashed stop-coloured edge until Dan types one. */
  missing?: boolean
  /** The source line under the field: "You said '220 all up'" or the "Use $150" buttons. */
  source?: ReactNode
  /** "Sarah will see: Adds $220 to the price". */
  preview?: ReactNode
  /** Filled by Nod from Dan's note and not yet touched (D64). */
  drafted?: boolean
  ref?: Ref<HTMLInputElement>
}) {
  const id = useId()
  const [text, setText] = useState(() => (cents === null ? '' : plain(cents)))
  const [shownCents, setShownCents] = useState(cents)
  const [error, setError] = useState<string | null>(null)

  // A new amount from outside (a "Use $150" tap, an undo): show it, unless it's what's typed.
  if (cents !== shownCents) {
    setShownCents(cents)
    if (cents !== parse(text)) setText(cents === null ? '' : plain(cents))
  }

  const describedBy = [error ? `${id}-error` : null, preview ? `${id}-preview` : null]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="field">
      <label htmlFor={id} className="field-label">
        {label}
        {drafted ? <span className="drafted-tag">From your note</span> : null}
      </label>
      <div
        className={cx(
          'money-field',
          drafted && 'is-drafted',
          missing && text.trim() === '' && 'is-empty-required',
          error && 'is-invalid',
        )}
      >
        <span className="money-prefix" aria-hidden="true">
          $
        </span>
        <input
          ref={ref}
          id={id}
          type="text"
          inputMode="decimal"
          enterKeyHint="next"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="0"
          value={text}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          onChange={(event) => {
            const next = event.target.value
            setText(next)
            if (next.trim() === '') {
              setError(null)
              onChange(null)
              return
            }
            const parsed = parse(next)
            if (parsed !== null) {
              setError(null)
              onChange(parsed)
            }
          }}
          onBlur={() => {
            if (text.trim() === '') return
            const parsed = parse(text)
            if (parsed === null) {
              setError(BAD_AMOUNT)
              return
            }
            setText(plain(parsed))
          }}
        />
      </div>
      {error ? (
        <p id={`${id}-error`} className="field-error">
          <CircleAlert size={18} strokeWidth={2.25} aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
      {source}
      {preview ? (
        <p id={`${id}-preview`} className="money-preview">
          {preview}
        </p>
      ) : null}
    </div>
  )
}
