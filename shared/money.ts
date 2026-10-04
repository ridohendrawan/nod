// Money in Australian format (D74). Amounts are integer cents everywhere.
// Intl gives a hyphen for negatives, so signs are built here: "+" and the true minus (U+2212).

export const MINUS = '−'

const wholeDollars = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})
const withCents = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export type MoneyOptions = {
  /** Show cents. Default: only when this amount has cents. Pass `hasCents(...)` of every amount
   *  on a screen so they all match ("cents only when an amount on that screen has cents"). */
  cents?: boolean
}

/** The size of an amount, never signed: 4895000 -> "$48,950"; 145050 -> "$1,450.50". */
export function formatMoney(cents: number, options: MoneyOptions = {}): string {
  const abs = Math.abs(Math.round(cents))
  const showCents = options.cents ?? abs % 100 !== 0
  return (showCents ? withCents : wholeDollars).format(abs / 100)
}

/** A change, always signed: "+$220", "−$400", "$0". Totals are never signed (use formatMoney). */
export function formatSignedMoney(cents: number, options: MoneyOptions = {}): string {
  if (cents === 0) return formatMoney(0, options)
  return (cents > 0 ? '+' : MINUS) + formatMoney(cents, options)
}

/** True if any of these amounts has cents, so a screen can show them all with cents. */
export function hasCents(amounts: readonly (number | null | undefined)[]): boolean {
  return amounts.some((a) => typeof a === 'number' && Math.abs(Math.round(a)) % 100 !== 0)
}

/** Dollars (a number, maybe with cents) to integer cents, rounding half away from zero. */
export function dollarsToCents(dollars: number): number {
  return Math.sign(dollars) * Math.round(Math.abs(dollars) * 100)
}

/**
 * What Dan typed in a money field, as cents, or null if it isn't a plain amount.
 * Accepts "220", "$220", "1,450.50", "1450.5" and spaces. The sign comes from the Extra cost /
 * Credit control, never from the text (the iPhone decimal keypad has no minus key).
 */
export function parseMoneyInput(text: string): number | null {
  const cleaned = text.replace(/[\s$]/g, '')
  if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/.test(cleaned)) return null
  const value = Number(cleaned.replace(/,/g, ''))
  if (!Number.isFinite(value)) return null
  const cents = Math.round(value * 100)
  return cents <= MAX_CENTS ? cents : null
}

/** $20 million: far above any variation, and inside Postgres `integer` cents (about $21.4 million). */
export const MAX_CENTS = 2_000_000_000
