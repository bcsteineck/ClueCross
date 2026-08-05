import { describe, expect, it } from 'vitest'
import {
  WEEKDAYS,
  addMonths,
  buildMonthGrid,
  formatFullDate,
  formatMonthYear,
  getDaysInMonth,
  getLeadingBlankCount,
  isSameDate,
  startOfDay,
  startOfMonth,
  toDateKey,
} from './archiveCalendar'

describe('WEEKDAYS', () => {
  it('starts with Monday', () => {
    expect(WEEKDAYS[0]).toEqual({ short: 'M', full: 'Monday' })
    expect(WEEKDAYS.map((w) => w.short).join(' ')).toBe('M T W T F S S')
  })

  it('ends with Sunday', () => {
    expect(WEEKDAYS[6]).toEqual({ short: 'S', full: 'Sunday' })
  })
})

describe('getLeadingBlankCount', () => {
  it('is 0 when the month starts on a Monday', () => {
    // 2026-06-01 is a Monday.
    expect(getLeadingBlankCount(2026, 5)).toBe(0)
  })

  it('is 6 when the month starts on a Sunday', () => {
    // 2026-11-01 is a Sunday.
    expect(getLeadingBlankCount(2026, 10)).toBe(6)
  })

  it('is 5 when the month starts on a Saturday', () => {
    // 2026-08-01 is a Saturday.
    expect(getLeadingBlankCount(2026, 7)).toBe(5)
  })
})

describe('getDaysInMonth', () => {
  it('returns 31 for August', () => {
    expect(getDaysInMonth(2026, 7)).toBe(31)
  })

  it('returns 28 for a non-leap February', () => {
    expect(getDaysInMonth(2026, 1)).toBe(28)
  })

  it('returns 29 for a leap February', () => {
    expect(getDaysInMonth(2028, 1)).toBe(29)
  })
})

describe('buildMonthGrid', () => {
  it('pads August 2026 with 5 leading blanks so day 1 lands on Saturday', () => {
    const grid = buildMonthGrid(2026, 7)
    expect(grid.slice(0, 5)).toEqual([null, null, null, null, null])
    expect(grid[5]).toBe(1)
    expect(grid.at(-1)).toBe(31)
    expect(grid).toHaveLength(5 + 31)
  })

  it('has no leading blanks for a month starting on Monday', () => {
    const grid = buildMonthGrid(2026, 5) // June 2026 starts on Monday
    expect(grid[0]).toBe(1)
  })

  it('has no trailing blanks after the final day', () => {
    const grid = buildMonthGrid(2026, 7)
    expect(grid.at(-1)).toBe(31)
    expect(grid.length % 7).not.toBe(0) // no padding to a full last row
  })
})

describe('formatMonthYear', () => {
  it('formats as "MMMM YYYY"', () => {
    expect(formatMonthYear(new Date(2026, 7, 3))).toBe('August 2026')
  })
})

describe('formatFullDate', () => {
  it('formats as "Month D, YYYY"', () => {
    expect(formatFullDate(new Date(2026, 7, 12))).toBe('August 12, 2026')
  })
})

describe('toDateKey', () => {
  it('formats as zero-padded YYYY-MM-DD', () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(toDateKey(new Date(2026, 10, 23))).toBe('2026-11-23')
  })
})

describe('isSameDate', () => {
  it('is true for the same calendar day regardless of time', () => {
    expect(isSameDate(new Date(2026, 7, 3, 1), new Date(2026, 7, 3, 23))).toBe(true)
  })

  it('is false for different days', () => {
    expect(isSameDate(new Date(2026, 7, 3), new Date(2026, 7, 4))).toBe(false)
  })
})

describe('startOfDay / startOfMonth', () => {
  it('zeroes out the time', () => {
    const d = startOfDay(new Date(2026, 7, 3, 15, 30))
    expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([0, 0, 0])
  })

  it('moves to the first of the month', () => {
    const d = startOfMonth(new Date(2026, 7, 17))
    expect(d.getDate()).toBe(1)
    expect(d.getMonth()).toBe(7)
  })
})

describe('addMonths', () => {
  it('moves forward across a year boundary', () => {
    const d = addMonths(new Date(2026, 11, 15), 1)
    expect(d.getFullYear()).toBe(2027)
    expect(d.getMonth()).toBe(0)
  })

  it('moves backward across a year boundary', () => {
    const d = addMonths(new Date(2026, 0, 15), -1)
    expect(d.getFullYear()).toBe(2025)
    expect(d.getMonth()).toBe(11)
  })
})
