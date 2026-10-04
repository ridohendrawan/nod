// Choices as chips: native radios in a fieldset with a legend, so arrow keys, "2 of 6", Space
// and screen readers all work for free (research/accessibility-copy.md 2.2 e). The selected chip
// shows a tick, so the choice never rides on colour alone. Segmented is the same control drawn
// as one track, for Extra cost / Credit / No charge (2.2 f).
import { Check, CircleAlert } from 'lucide-react'
import { useId, type ReactNode, type Ref } from 'react'

export type ChipOption<T extends string> = { value: T; label: string }

type GroupProps<T extends string> = {
  legend: string
  /** A line under the legend, read as the group's description. */
  hint?: ReactNode
  options: readonly ChipOption<T>[]
  value: T | null
  onChange: (value: T) => void
  /** The group is a gap Send is waiting on (D17): its chips get a stop-coloured edge. */
  invalid?: boolean
  /** What's missing, in words, under the chips and in the group's description. */
  error?: string | null
  /** Focus lands here when a checklist gap points at this group. */
  firstRef?: Ref<HTMLInputElement>
  /** Chosen by Nod from Dan's note and not yet touched (D64): a "From your note" tag. */
  drafted?: boolean
  /** The legend is still read out, but a heading right above already says it. */
  hideLegend?: boolean
}

export function ChipGroup<T extends string>(props: GroupProps<T>) {
  return <RadioGroup {...props} look="chips" />
}

export function Segmented<T extends string>(props: GroupProps<T>) {
  return <RadioGroup {...props} look="segmented" />
}

function RadioGroup<T extends string>({
  legend,
  hint,
  options,
  value,
  onChange,
  invalid,
  error,
  firstRef,
  drafted,
  hideLegend,
  look,
}: GroupProps<T> & { look: 'chips' | 'segmented' }) {
  const name = useId()
  const hintId = `${name}-hint`
  const errorId = `${name}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ')
  return (
    <fieldset
      className="fieldset"
      aria-describedby={describedBy || undefined}
      aria-invalid={invalid || error ? true : undefined}
    >
      <legend className={hideLegend ? 'visually-hidden' : 'fieldset-legend'}>
        {legend}
        {drafted ? <span className="drafted-tag">From your note</span> : null}
      </legend>
      {hint ? (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      ) : null}
      <div className={look === 'chips' ? 'chips' : 'segmented'}>
        {options.map((option, i) => (
          <label key={option.value} className={look === 'chips' ? 'chip' : 'segment'}>
            <input
              ref={i === 0 ? firstRef : undefined}
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            {look === 'chips' ? (
              <Check className="chip-tick" size={18} strokeWidth={3} aria-hidden="true" />
            ) : null}
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      {error ? (
        <p id={errorId} className="field-error">
          <CircleAlert size={18} strokeWidth={2.25} aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </fieldset>
  )
}
