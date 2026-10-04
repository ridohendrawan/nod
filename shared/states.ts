// The three states Nod covers, their names and the time zone that legal times use (D10).

export type StateCode = 'NSW' | 'QLD' | 'VIC'

export const STATES: readonly StateCode[] = ['NSW', 'QLD', 'VIC']

export const STATE_NAME: Record<StateCode, string> = {
  NSW: 'New South Wales',
  QLD: 'Queensland',
  VIC: 'Victoria',
}

/** IANA zones. Queensland has no daylight saving; NSW and VIC switch on the first Sunday in October. */
export const STATE_ZONE: Record<StateCode, string> = {
  NSW: 'Australia/Sydney',
  QLD: 'Australia/Brisbane',
  VIC: 'Australia/Melbourne',
}

/** What Sarah reads after a time: "(Brisbane time)". */
export const STATE_CITY_TIME: Record<StateCode, string> = {
  NSW: 'Sydney time',
  QLD: 'Brisbane time',
  VIC: 'Melbourne time',
}

export function isStateCode(value: unknown): value is StateCode {
  return value === 'NSW' || value === 'QLD' || value === 'VIC'
}
