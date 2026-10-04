// A real checkbox in a 48 px row; the whole sentence is its label, so tapping the words ticks it
// (research/accessibility-copy.md 2.2 g). Never pre-ticked by Nod.
import { useId, type ReactNode, type Ref } from 'react'

export function Checkbox({
  checked,
  onChange,
  invalid,
  describedBy,
  children,
  ref,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  invalid?: boolean
  describedBy?: string
  children: ReactNode
  ref?: Ref<HTMLInputElement>
}) {
  const id = useId()
  return (
    <label className="check-row" htmlFor={id}>
      <input
        ref={ref}
        id={id}
        type="checkbox"
        checked={checked}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{children}</span>
    </label>
  )
}
