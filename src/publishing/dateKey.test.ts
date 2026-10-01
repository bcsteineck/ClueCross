import { describe, expect, it } from 'vitest'
import { addDays, compareDateKeys, formatDateKey, isDateKey, maxDateKey, parseDateKey } from './dateKey'

describe('DateKey parsing and formatting', () => {
  it('accepts only canonical keys naming real dates', () => {
    for (const key of ['2026-10-01', '2028-02-29', '2000-02-29', '0999-12-31', '9999-12-31']) {
      expect(isDateKey(key), key).toBe(true)
    }
    for (const key of [
      '2026-02-29', // not a leap year
      '1900-02-29', // century, not a leap year
      '2026-02-30',
      '2026-13-01',
      '2026-00-10',
      '2026-04-31',
      '2026-1-1',
      '26-10-01',
      '2026-10-01T00:00',
      ' 2026-10-01',
      '2026/10/01',
      '',
    ]) {
      expect(isDateKey(key), key).toBe(false)
    }
  })

  it('round-trips between keys and calendar dates', () => {
    expect(parseDateKey('2026-03-08')).toEqual({ year: 2026, month: 3, day: 8 })
    expect(formatDateKey({ year: 2026, month: 3, day: 8 })).toBe('2026-03-08')
    expect(formatDateKey({ year: 999, month: 1, day: 2 })).toBe('0999-01-02')
    expect(() => parseDateKey('2026-02-30')).toThrow('Invalid DateKey')
    expect(() => formatDateKey({ year: 2026, month: 2, day: 30 })).toThrow('Invalid calendar date')
  })
})

describe('DateKey comparison', () => {
  it('orders chronologically', () => {
    expect(compareDateKeys('2026-09-30', '2026-10-01')).toBeLessThan(0)
    expect(compareDateKeys('2027-01-01', '2026-12-31')).toBeGreaterThan(0)
    expect(compareDateKeys('2026-10-01', '2026-10-01')).toBe(0)
    expect(maxDateKey('2026-10-01', '2026-09-30')).toBe('2026-10-01')
    expect(maxDateKey('2026-09-30', '2026-10-01')).toBe('2026-10-01')
    expect(() => compareDateKeys('2026-10-1', '2026-10-01')).toThrow('Invalid DateKey')
  })
})

describe('calendar-day arithmetic', () => {
  it('rolls over months, years, and leap days', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31')
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01')
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29')
    expect(addDays('2026-10-01', 0)).toBe('2026-10-01')
    expect(addDays('2026-01-01', 365)).toBe('2027-01-01')
    expect(addDays('2028-01-01', 366)).toBe('2029-01-01')
  })

  it('is calendar arithmetic across DST changes, not 24-hour arithmetic', () => {
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08')
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09')
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02')
  })

  it('rejects non-integer offsets and invalid keys', () => {
    expect(() => addDays('2026-10-01', 0.5)).toThrow('integer')
    expect(() => addDays('2026-02-30', 1)).toThrow('Invalid DateKey')
  })
})
