import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { cx } from './cx.ts'

export type ButtonVariant = 'primary' | 'dark' | 'outline' | 'text' | 'danger'

export type Look = {
  /** primary: amber (Dan's main action); dark: ink (Sarah's Approve); outline; text; danger. */
  variant?: ButtonVariant
  size?: 48 | 56
  block?: boolean
  icon?: ReactNode
  /** After the label: an arrow on a navigation, for example. */
  iconEnd?: ReactNode
}

type ButtonProps = Look &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled'> & {
    ref?: Ref<HTMLButtonElement>
    /** While its action runs: keeps the label, adds "…" and aria-busy (never a spinner alone). */
    pending?: boolean
    /** Blocked (D17): stays focusable and readable, says why via aria-describedby, and a press
     *  calls onBlockedPress (usually: move focus to the gap) instead of onClick. */
    blocked?: boolean
    onBlockedPress?: () => void
  }

export function Button({
  variant = 'outline',
  size = 48,
  block,
  icon,
  iconEnd,
  pending,
  blocked,
  onBlockedPress,
  onClick,
  className,
  children,
  type = 'button',
  ref,
  ...rest
}: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        'btn',
        `btn-${variant}`,
        `btn-${size}`,
        block && 'btn-block',
        blocked && 'is-blocked',
        className,
      )}
      aria-disabled={blocked || pending ? true : undefined}
      aria-busy={pending ? true : undefined}
      onClick={(event) => {
        if (pending) return event.preventDefault()
        if (blocked) {
          event.preventDefault()
          onBlockedPress?.()
          return
        }
        onClick?.(event)
      }}
      {...rest}
    >
      {icon}
      <span>
        {children}
        {pending ? '…' : null}
      </span>
      {iconEnd}
    </button>
  )
}

/** A round 48 px icon-only button. The accessible name goes on the button; the icon is hidden. */
export function IconButton({
  label,
  icon,
  className,
  type = 'button',
  ref,
  ...rest
}: { label: string; icon: ReactNode; ref?: Ref<HTMLButtonElement> } & Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'aria-label'
>) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx('icon-btn', className)}
      aria-label={label}
      {...rest}
    >
      {icon}
    </button>
  )
}
