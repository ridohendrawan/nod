// An on/off setting, as a row: the label and hint on the left, the switch on the right.
// Base UI renders a native <button role="switch"> here, so the sibling <label> names it and a
// tap on the words toggles it too.
import { Switch as BaseSwitch } from '@base-ui/react/switch'
import { useId, type ReactNode } from 'react'

type SwitchProps = {
  label: string
  hint?: ReactNode
  /** A decorative tile before the words, as in the menu. */
  icon?: ReactNode
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

export function Switch({ label, hint, icon, checked, onCheckedChange }: SwitchProps) {
  const id = useId()
  const labelId = `${id}-label`
  const hintId = `${id}-hint`
  return (
    <div className="switch-row">
      {icon}
      <div className="switch-text">
        <label id={labelId} htmlFor={id} className="switch-label">
          {label}
        </label>
        {hint ? (
          <p id={hintId} className="switch-hint">
            {hint}
          </p>
        ) : null}
      </div>
      <BaseSwitch.Root
        id={id}
        nativeButton
        render={<button type="button" aria-labelledby={labelId} />}
        className="switch"
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next)}
        aria-describedby={hint ? hintId : undefined}
      >
        <BaseSwitch.Thumb className="switch-thumb" />
      </BaseSwitch.Root>
    </div>
  )
}
