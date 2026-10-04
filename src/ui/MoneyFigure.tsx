import { formatMoney, type MoneyOptions } from '../../shared/money.ts'

/**
 * A big amount with the dollar sign set small and high, like a price tag. Screen readers get
 * the plain amount once ("$48,950"); the styled figure is hidden from them.
 * `shown` lets a count-up animate the figure while `cents` stays the true value.
 */
export function MoneyFigure({
  cents,
  shown = cents,
  options,
  className,
}: {
  cents: number
  shown?: number
  options?: MoneyOptions
  className?: string
}) {
  const visual = formatMoney(shown, options)
  return (
    <span className={className}>
      <span aria-hidden="true">
        <span className="cur">{visual.slice(0, 1)}</span>
        {visual.slice(1)}
      </span>
      <span className="visually-hidden">{formatMoney(cents, options)}</span>
    </span>
  )
}
