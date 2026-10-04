import { ChevronRight } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { cx } from './cx.ts'

/** A menu row: a tile, the action's name, a line on what it does, and a chevron. The hint is the
 *  button's description, so the name stays just the action ("Reset demo data"). */
export function MenuItem({
  icon,
  label,
  hint,
  danger,
  onClick,
}: {
  icon: ReactNode
  label: string
  hint: string
  /** Deletes something: a stop-tinted tile, so the row reads differently before it's read. */
  danger?: boolean
  onClick: () => void
}) {
  const id = useId()
  return (
    <button
      type="button"
      className="menu-item"
      aria-labelledby={`${id}-label`}
      aria-describedby={`${id}-hint`}
      onClick={onClick}
    >
      <span className={cx('menu-tile', danger && 'is-danger')} aria-hidden="true">
        {icon}
      </span>
      <span className="menu-text">
        <span id={`${id}-label`} className="menu-label">
          {label}
        </span>
        <span id={`${id}-hint`} className="menu-hint">
          {hint}
        </span>
      </span>
      <ChevronRight className="menu-chevron" size={20} strokeWidth={2.25} aria-hidden="true" />
    </button>
  )
}
