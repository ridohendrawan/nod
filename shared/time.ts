// Times and dates in the job site's zone (D10, D74). Strings are assembled from formatToParts,
// because Safari and Chrome join date and time differently ("at" vs ","), and zone names come
// from our own map. Non-breaking spaces keep "2:15 pm" and "1 October" together.

import { STATE_CITY_TIME, STATE_ZONE, type StateCode } from './states.ts'

const NBSP = ' '
const ZONE_ABBR: Record<string, string> = { 'GMT+10': 'AEST', 'GMT+11': 'AEDT' }

type Parts = Record<string, string>

const cache = new Map<string, Intl.DateTimeFormat>()
function parts(at: Date, timeZone: string, style: 'short' | 'long'): Parts {
  const key = `${timeZone}|${style}`
  let f = cache.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat('en-AU', {
      timeZone,
      weekday: style,
      day: 'numeric',
      month: style,
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hourCycle: 'h12',
      timeZoneName: 'shortOffset',
    })
    cache.set(key, f)
  }
  const out: Parts = {}
  for (const { type, value } of f.formatToParts(at)) out[type] = value
  return out
}

/** "2:15 pm", "midday", "midnight" (no leading zero; a non-breaking space before am/pm). */
function clock(p: Parts): string {
  const period = p.dayPeriod.toLowerCase().replace(/\./g, '')
  if (p.hour === '12' && p.minute === '00') return period === 'pm' ? 'midday' : 'midnight'
  return `${p.hour}:${p.minute}${NBSP}${period}`
}

/** Dan and the stored record: "Thu 1 Oct 2026, 2:15 pm AEST". */
export function formatRecordTime(at: Date, state: StateCode): string {
  const p = parts(at, STATE_ZONE[state], 'short')
  const zone = ZONE_ABBR[p.timeZoneName] ?? p.timeZoneName
  return `${p.weekday} ${p.day}${NBSP}${p.month} ${p.year}, ${clock(p)} ${zone}`
}

/** Sarah: "Thursday 1 October 2026 at 2:15 pm (Brisbane time)". */
export function formatOwnerTime(at: Date, state: StateCode): string {
  const p = parts(at, STATE_ZONE[state], 'long')
  return `${p.weekday} ${p.day}${NBSP}${p.month} ${p.year} at ${clock(p)} (${STATE_CITY_TIME[state]})`
}

/** A time for status lines: "2:15 pm" today on site, otherwise "Mon 28 Sep, 2:15 pm". */
export function formatShortTime(at: Date, state: StateCode, now: Date = new Date()): string {
  const p = parts(at, STATE_ZONE[state], 'short')
  if (todayIn(state, at) === todayIn(state, now)) return clock(p)
  return `${p.weekday} ${p.day}${NBSP}${p.month}, ${clock(p)}`
}

/** Today's date on site, as YYYY-MM-DD (for date_requested). */
export function todayIn(state: StateCode, at: Date = new Date()): string {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: STATE_ZONE[state],
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const p: Parts = {}
  for (const { type, value } of f.formatToParts(at)) p[type] = value
  return `${p.year}-${p.month}-${p.day}`
}

/** Calendar arithmetic on YYYY-MM-DD strings (no time zone involved). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return t.toISOString().slice(0, 10)
}

const dateOnly = new Intl.DateTimeFormat('en-AU', {
  timeZone: 'UTC',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})
const dateOnlyLong = new Intl.DateTimeFormat('en-AU', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

function dateParts(date: string, f: Intl.DateTimeFormat): Parts {
  const [y, m, d] = date.split('-').map(Number)
  const out: Parts = {}
  for (const { type, value } of f.formatToParts(new Date(Date.UTC(y, m - 1, d)))) out[type] = value
  return out
}

/** A calendar date for Dan: "Thu 1 Oct". */
export function formatDate(date: string): string {
  const p = dateParts(date, dateOnly)
  return `${p.weekday} ${p.day}${NBSP}${p.month}`
}

/** A calendar date for Sarah and records: "Thursday 1 October 2026". */
export function formatDateLong(date: string): string {
  const p = dateParts(date, dateOnlyLong)
  return `${p.weekday} ${p.day}${NBSP}${p.month} ${p.year}`
}

/**
 * Today on the device, for headers next to the greeting: "Thursday 1 October" (device time, like
 * the greeting, D10; never on a record). `timeZone` is for tests; leave it out in the app.
 */
export function formatToday(at: Date = new Date(), timeZone?: string): string {
  const f = new Intl.DateTimeFormat('en-AU', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  const p: Parts = {}
  for (const { type, value } of f.formatToParts(at)) p[type] = value
  return `${p.weekday} ${p.day}${NBSP}${p.month}`
}

/** "Morning", "Afternoon" or "Evening" from an hour 0-23 (device time, D10). */
export function partOfDay(hour: number): 'Morning' | 'Afternoon' | 'Evening' {
  if (hour >= 5 && hour < 12) return 'Morning'
  if (hour >= 12 && hour < 17) return 'Afternoon'
  return 'Evening'
}
