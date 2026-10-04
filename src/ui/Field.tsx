// Text fields: the label above, a hint and any error below (design-system 6). The error joins
// the field's description only while it shows, because a hidden element that's referenced by
// id is still read out (research/accessibility-copy.md 2.2 f).
import { CircleAlert } from 'lucide-react'
import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type TextareaHTMLAttributes,
} from 'react'
import { cx } from './cx.ts'

type Shared = {
  label: string
  hint?: ReactNode
  error?: string | null
  /** Filled by Nod and not yet touched (D64): an amber edge and a "From your note" tag. */
  drafted?: boolean
  /** Shown after the label, like the drafted tag. */
  labelExtra?: ReactNode
}

function useFieldIds(hint: unknown, error: unknown) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ')
  return { id, hintId, errorId, describedBy: describedBy || undefined }
}

function FieldFrame({
  id,
  label,
  hint,
  hintId,
  error,
  errorId,
  drafted,
  labelExtra,
  children,
}: Shared & { id: string; hintId: string; errorId: string; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id} className="field-label">
        {label}
        {drafted ? <span className="drafted-tag">From your note</span> : null}
        {labelExtra}
      </label>
      {children}
      {hint ? (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="field-error">
          <CircleAlert size={18} strokeWidth={2.25} aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  )
}

export function TextField({
  label,
  hint,
  error,
  drafted,
  labelExtra,
  className,
  ref,
  ...input
}: Shared & Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & { ref?: Ref<HTMLInputElement> }) {
  const ids = useFieldIds(hint, error)
  return (
    <FieldFrame
      {...ids}
      label={label}
      hint={hint}
      error={error}
      drafted={drafted}
      labelExtra={labelExtra}
    >
      <input
        ref={ref}
        id={ids.id}
        className={cx('input', drafted && 'is-drafted', className)}
        aria-describedby={ids.describedBy}
        aria-invalid={error ? true : undefined}
        {...input}
      />
    </FieldFrame>
  )
}

export function TextArea({
  label,
  hint,
  error,
  drafted,
  labelExtra,
  className,
  ref,
  ...area
}: Shared &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> & { ref?: Ref<HTMLTextAreaElement> }) {
  const ids = useFieldIds(hint, error)
  return (
    <FieldFrame
      {...ids}
      label={label}
      hint={hint}
      error={error}
      drafted={drafted}
      labelExtra={labelExtra}
    >
      <textarea
        ref={ref}
        id={ids.id}
        className={cx('input', drafted && 'is-drafted', className)}
        aria-describedby={ids.describedBy}
        aria-invalid={error ? true : undefined}
        autoCapitalize="sentences"
        {...area}
      />
    </FieldFrame>
  )
}
