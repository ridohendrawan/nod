// A navigation that looks like a button, for Dan's app only. It uses React Router's Link, which
// Sarah's page never loads (D86 keeps her bundle small), so it lives apart from Button.
import { Link, type LinkProps } from 'react-router'
import type { Look } from './Button.tsx'
import { cx } from './cx.ts'

/** For example "Record a change". */
export function ButtonLink({
  variant = 'outline',
  size = 48,
  block,
  icon,
  iconEnd,
  className,
  children,
  ...rest
}: Look & LinkProps) {
  return (
    <Link
      className={cx('btn', `btn-${variant}`, `btn-${size}`, block && 'btn-block', className)}
      {...rest}
    >
      {icon}
      <span>{children}</span>
      {iconEnd}
    </Link>
  )
}
