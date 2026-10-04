import { describe, expect, it } from 'vitest'
import {
  addDays,
  formatDate,
  formatDateLong,
  formatOwnerTime,
  formatRecordTime,
  formatShortTime,
  formatToday,
  partOfDay,
  todayIn,
} from '../shared/time.ts'

const NBSP = ' '
const plain = (s: string) => s.replaceAll(NBSP, ' ')

// 1 Oct 2026, 2:15 pm in Brisbane (UTC+10) is 04:15 UTC.
const oct1 = new Date('2026-10-01T04:15:00Z')

describe('record times in the job site’s zone (D10)', () => {
  it('formats Dan’s record line', () => {
    expect(plain(formatRecordTime(oct1, 'QLD'))).toBe('Thu 1 Oct 2026, 2:15 pm AEST')
  })

  it('formats Sarah’s line in words with the city', () => {
    expect(plain(formatOwnerTime(oct1, 'QLD'))).toBe(
      'Thursday 1 October 2026 at 2:15 pm (Brisbane time)',
    )
  })

  it('keeps "2:15 pm" and "1 Oct" together with non-breaking spaces', () => {
    const s = formatRecordTime(oct1, 'QLD')
    expect(s).toContain(`2:15${NBSP}pm`)
    expect(s).toContain(`1${NBSP}Oct`)
  })

  it('says midday and midnight, not 12 pm and 12 am', () => {
    expect(plain(formatRecordTime(new Date('2026-10-01T02:00:00Z'), 'QLD'))).toBe(
      'Thu 1 Oct 2026, midday AEST',
    )
    expect(plain(formatRecordTime(new Date('2026-09-30T14:00:00Z'), 'QLD'))).toBe(
      'Thu 1 Oct 2026, midnight AEST',
    )
  })
})

describe('daylight saving starts on Sunday 4 October 2026 in NSW and VIC, not QLD', () => {
  const before = new Date('2026-10-03T15:00:00Z') // Sun 4 Oct, 1:00 am in Sydney (AEST)
  const after = new Date('2026-10-03T16:30:00Z') // Sun 4 Oct, 3:30 am in Sydney (AEDT)

  it('switches Sydney and Melbourne to AEDT at 2 am', () => {
    expect(plain(formatRecordTime(before, 'NSW'))).toBe('Sun 4 Oct 2026, 1:00 am AEST')
    expect(plain(formatRecordTime(after, 'NSW'))).toBe('Sun 4 Oct 2026, 3:30 am AEDT')
    expect(plain(formatRecordTime(after, 'VIC'))).toBe('Sun 4 Oct 2026, 3:30 am AEDT')
  })

  it('keeps Brisbane on AEST', () => {
    expect(plain(formatRecordTime(after, 'QLD'))).toBe('Sun 4 Oct 2026, 2:30 am AEST')
  })
})

describe('dates', () => {
  it('gives today on site, which can differ from UTC and from the laptop', () => {
    // 11 pm UTC on 30 Sep is already 1 Oct in Brisbane.
    expect(todayIn('QLD', new Date('2026-09-30T23:00:00Z'))).toBe('2026-10-01')
  })

  it('adds calendar days across a month end', () => {
    expect(addDays('2026-10-01', -3)).toBe('2026-09-28')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('formats calendar dates without a time zone shift', () => {
    expect(plain(formatDate('2026-10-01'))).toBe('Thu 1 Oct')
    expect(plain(formatDateLong('2026-10-01'))).toBe('Thursday 1 October 2026')
  })

  it('shows just the time for today, the day as well for other days', () => {
    expect(plain(formatShortTime(oct1, 'QLD', oct1))).toBe('2:15 pm')
    expect(plain(formatShortTime(oct1, 'QLD', new Date('2026-10-03T04:15:00Z')))).toBe(
      'Thu 1 Oct, 2:15 pm',
    )
  })
})

describe('formatToday (device time, for the header next to the greeting)', () => {
  it('says the weekday, day and month in words, with no year', () => {
    expect(plain(formatToday(oct1, 'Australia/Brisbane'))).toBe('Thursday 1 October')
  })

  it('keeps "1 October" together with a non-breaking space', () => {
    expect(formatToday(oct1, 'Australia/Brisbane')).toBe(`Thursday 1${NBSP}October`)
  })

  it('follows the device zone, so the laptop and the site can disagree', () => {
    // 1:30 am on 1 Oct in Brisbane is still 30 Sep in Jakarta (UTC+7).
    const lateNight = new Date('2026-09-30T15:30:00Z')
    expect(plain(formatToday(lateNight, 'Australia/Brisbane'))).toBe('Thursday 1 October')
    expect(plain(formatToday(lateNight, 'Asia/Jakarta'))).toBe('Wednesday 30 September')
  })

  it('uses the device zone when none is given', () => {
    const deviceZone = new Intl.DateTimeFormat().resolvedOptions().timeZone
    expect(formatToday(oct1)).toBe(formatToday(oct1, deviceZone))
  })
})

describe('partOfDay (device time, for the greeting)', () => {
  it('splits at 5 am, midday and 5 pm', () => {
    expect(partOfDay(5)).toBe('Morning')
    expect(partOfDay(11)).toBe('Morning')
    expect(partOfDay(12)).toBe('Afternoon')
    expect(partOfDay(17)).toBe('Evening')
    expect(partOfDay(2)).toBe('Evening')
  })
})
